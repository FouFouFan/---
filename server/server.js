'use strict';

const { WebSocketServer } = require('ws');
const { parse, send } = require('./protocol');
const { Matchmaker } = require('./matchmaker');
const { validateMove, applyMove, handleDisconnect, clearTurnTimer } = require('./game');

const PORT = Number(process.env.PORT) || 3000;

const wss = new WebSocketServer({ port: PORT });
const matchmaker = new Matchmaker();

let nextClientId = 1;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
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
 * 使双方可以立即重新匹配。
 */
function cleanupRoom(room) {
  clearTurnTimer(room);
  for (const player of room.players) {
    clearPlayerRoomState(player.ws);
  }
  room.board = null;
  room.turn = null;
  matchmaker.rooms.delete(room.id);
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
});

wss.on('connection', (ws, req) => {
  ws.clientId = nextClientId++;
  ws.isAlive = true;

  log(`client#${ws.clientId} connected from ${req.socket.remoteAddress}:${req.socket.remotePort}`);

  ws.on('message', (raw) => {
    const msg = parse(raw);
    if (!msg) {
      send(ws, { type: 'error', message: '无效的消息格式' });
      return;
    }

    switch (msg.type) {
      case 'match_request': {
        log(`client#${ws.clientId} requests match`);
        resetStaleRoomState(ws);
        matchmaker.enqueue(ws);

        const room = matchmaker.rooms.get(ws.roomId);
        if (room) {
          // 对局结束（五连/超时/断线）后统一清理房间，允许立即重新匹配
          room.onEnd = () => cleanupRoom(room);
          for (const player of room.players) {
            player.ws.inGame = true;
          }
        }
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
        send(ws, { type: 'error', message: `未知消息类型: ${msg.type}` });
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
  wss.close(() => process.exit(0));
});
