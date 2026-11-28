'use strict';

const os = require('node:os');
const { WebSocketServer } = require('ws');
const { parse, send } = require('./protocol');
const { Matchmaker } = require('./matchmaker');
const { validateMove, applyMove, handleDisconnect } = require('./game');

const PORT = Number(process.env.PORT) || 3000;

/** 单条消息上限 8KB（PVP-09） */
const MAX_PAYLOAD_BYTES = 8 * 1024;
/** 限流：每连接 5 秒内最多 20 条（PVP-09） */
const RATE_WINDOW_MS = 5000;
const RATE_MAX_MESSAGES = 20;
/** 心跳：每 30 秒 ping 一次，连续 2 次无 pong 终止连接（PVP-06） */
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

const wss = new WebSocketServer({ port: PORT, maxPayload: MAX_PAYLOAD_BYTES });
const matchmaker = new Matchmaker();

let nextClientId = 1;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

/** 本机非回环 IPv4，用于启动时提示局域网访问地址 */
function lanAddresses() {
  const result = [];
  for (const nets of Object.values(os.networkInterfaces())) {
    for (const net of nets || []) {
      if (net.family === 'IPv4' && !net.internal) result.push(net.address);
    }
  }
  return result;
}

/**
 * 滑动窗口限流：超过 20 条/5s 返回 false。
 * 超限消息由调用方回 rate_limited，不再进入业务分支。
 */
function allowMessage(ws) {
  const now = Date.now();
  if (!ws.rateWindowStart || now - ws.rateWindowStart >= RATE_WINDOW_MS) {
    ws.rateWindowStart = now;
    ws.rateCount = 0;
  }
  ws.rateCount += 1;
  return ws.rateCount <= RATE_MAX_MESSAGES;
}

/** 清除玩家身上的对局标记 */
function clearPlayerRoomState(ws) {
  ws.inGame = false;
  ws.roomId = null;
  ws.color = null;
}

/**
 * 对局结束（五连/超时/断线）后清理房间：
 * 删除房间、清空棋盘与当前回合、重置双方的对局标记，
 * 使双方可以立即重新匹配。清理逻辑由 Matchmaker 统一实现（幂等）。
 */
function cleanupRoom(room) {
  if (!matchmaker.cleanupRoom(room)) return; // 已清理过则直接返回
  log(`room ${room.id} cleaned up`);
}

/**
 * 兜底：玩家仍标记为对局中，但对应房间已不存在时，
 * 清除其残留标记后继续正常匹配流程，避免返回 error。
 */
function resetStaleRoomState(ws) {
  if ((ws.inGame || ws.roomId) && !matchmaker.rooms.has(ws.roomId)) {
    log(`client#${ws.clientId} stale room state (roomId=${ws.roomId}), cleared`);
    clearPlayerRoomState(ws);
  }
}

wss.on('listening', () => {
  log(`WebSocket server listening on ws://localhost:${PORT}`);
  for (const address of lanAddresses()) {
    log(`LAN access: ws://${address}:${PORT}`);
  }
});

// 心跳：30 秒 ping，连续 2 次无响应即终止连接（断线判负由 close 分支处理）
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      log(`client#${ws.clientId} heartbeat timeout, terminating`);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, HEARTBEAT_INTERVAL_MS);

wss.on('close', () => clearInterval(heartbeat));

wss.on('connection', (ws, req) => {
  ws.clientId = nextClientId++;
  ws.isAlive = true;
  ws.rateWindowStart = Date.now();
  ws.rateCount = 0;

  log(`client#${ws.clientId} connected from ${req.socket.remoteAddress}:${req.socket.remotePort}`);

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (raw) => {
    if (!allowMessage(ws)) {
      log(`client#${ws.clientId} rate limited`);
      send(ws, { type: 'error', code: 'rate_limited', message: '消息过于频繁，请稍后再试' });
      return;
    }

    const msg = parse(raw);
    if (!msg) {
      send(ws, { type: 'error', code: 'invalid_message', message: '无效的消息格式' });
      return;
    }

    switch (msg.type) {
      case 'match_request': {
        log(`client#${ws.clientId} requests match`);
        resetStaleRoomState(ws);
        matchmaker.enqueue(ws, msg.profile);

        const room = matchmaker.rooms.get(ws.roomId);
        if (room) {
          // 对局结束（五连/超时/断线）后统一清理房间，允许立即重新匹配
          room.onEnd = () => cleanupRoom(room);
        }
        break;
      }

      case 'match_cancel': {
        const removed = matchmaker.cancel(ws);
        log(`client#${ws.clientId} cancels match (queued=${removed})`);
        break;
      }

      case 'move': {
        const room = matchmaker.rooms.get(ws.roomId);
        const result = validateMove(room, ws, msg.row, msg.col);
        if (!result.ok) {
          log(`client#${ws.clientId} move (${msg.row},${msg.col}) rejected: ${result.reason}`);
          send(ws, { type: 'move_rejected', reason: result.reason, message: result.message });
          break;
        }

        const move = applyMove(room, ws, msg.row, msg.col);
        log(
          `client#${ws.clientId} move (${move.row},${move.col}) color=${move.color} broadcast, next turn=${move.nextTurn}`
        );
        if (move.win) {
          log(
            `WIN detected: color=${move.win.color} line=${move.win.positions
              .map(([r, c]) => `(${r},${c})`)
              .join('-')}`
          );
        }
        break;
      }

      default:
        send(ws, { type: 'error', code: 'unknown_type', message: `未知消息类型: ${msg.type}` });
    }
  });

  ws.on('close', (code, reason) => {
    const room = matchmaker.rooms.get(ws.roomId);
    if (room) {
      // 通知对手并判负，broadcast game_over 后由 room.onEnd 清理；
      // 这里再调用一次作为兜底（清理操作幂等）。
      handleDisconnect(room, ws);
      cleanupRoom(room);
      log(`client#${ws.clientId} left ${room.id}, room destroyed`);
    }

    matchmaker.remove(ws);
    log(`client#${ws.clientId} disconnected (code=${code}, reason=${reason.toString() || '-'})`);
  });

  ws.on('error', (err) => {
    log(`client#${ws.clientId} error: ${err.message}`);
  });
});

wss.on('error', (err) => {
  log(`server error: ${err.message}`);
});

process.on('SIGINT', () => {
  log('shutting down...');
  clearInterval(heartbeat);
  matchmaker.queue.length = 0; // 关闭时清空匹配队列
  for (const room of [...matchmaker.rooms.values()]) matchmaker.cleanupRoom(room);
  wss.close(() => process.exit(0));
});
