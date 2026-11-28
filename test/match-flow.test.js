'use strict';

// T4-6 服务端集成测试：启动真实 server.js 子进程，用两个 ws 客户端跑完整链路
// （匹配、重复匹配、取消、落子与拒绝、断线判负、心跳超时）。
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const WebSocket = require('../server/node_modules/ws');

const SERVER_DIR = path.join(__dirname, '..', 'server');

/** 启动独立服务进程（PORT=0 由系统分配），从日志中解析实际端口 */
function startServer(extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.js'], {
      cwd: SERVER_DIR,
      env: { ...process.env, PORT: '0', ...extraEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('服务端启动超时：' + output));
    }, 8000);

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      output += chunk;
      const found = output.match(/listening on ws:\/\/localhost:(\d+)/);
      if (found) {
        clearTimeout(timer);
        resolve({ child, port: Number(found[1]) });
      }
    });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      output += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function stopServer(server) {
  return new Promise((resolve) => {
    if (!server || server.child.exitCode !== null) return resolve();
    server.child.once('exit', () => resolve());
    server.child.kill();
  });
}

function connect(port, options) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, options);
  ws.messages = [];
  ws.on('message', (raw) => ws.messages.push(JSON.parse(raw.toString())));
  return ws;
}

function opened(ws) {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

function send(ws, message) {
  ws.send(JSON.stringify(message));
}

function find(ws, predicate) {
  return ws.messages.find(predicate) || null;
}

/** 等待某条消息出现（已存在则立即返回） */
function waitFor(ws, predicate, timeout = 4000) {
  return new Promise((resolve, reject) => {
    const existing = find(ws, predicate);
    if (existing) return resolve(existing);

    const timer = setTimeout(() => {
      ws.off('message', onMessage);
      reject(new Error('等待消息超时：' + describe(predicate)));
    }, timeout);

    function onMessage() {
      const message = find(ws, predicate);
      if (message) {
        clearTimeout(timer);
        ws.off('message', onMessage);
        resolve(message);
      }
    }

    ws.on('message', onMessage);
  });
}

function describe(predicate) {
  return predicate.toString().slice(0, 80);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function closeAll(clients) {
  for (const ws of clients) {
    try {
      ws.close();
    } catch {
      // 已关闭
    }
  }
}

/** 建立一局并返回 [黑方, 白方] */
async function matchPair(port) {
  const a = connect(port);
  const b = connect(port);
  await Promise.all([opened(a), opened(b)]);
  send(a, { type: 'match_request' });
  send(b, { type: 'match_request' });
  const [successA, successB] = await Promise.all([
    waitFor(a, (m) => m.type === 'match_success'),
    waitFor(b, (m) => m.type === 'match_success'),
  ]);
  assert.equal(successA.roomId, successB.roomId);
  const black = successA.color === 'black' ? a : b;
  const white = black === a ? b : a;
  return { a, b, black, white, successA, successB };
}

let server;

test.before(async () => {
  server = await startServer();
});

test.after(async () => {
  await stopServer(server);
});

test('两个客户端匹配到同一房间，先入队执黑且下发对手信息（PVP-03/04）', async () => {
  const a = connect(server.port);
  const b = connect(server.port);
  await Promise.all([opened(a), opened(b)]);

  send(a, { type: 'match_request', profile: { playerId: 'gm_aaaaaaaaaaaa', nickname: '枫客', avatarId: 'maple' } });
  const waiting = await waitFor(a, (m) => m.type === 'match_waiting');
  assert.equal(waiting.position, 1);

  send(b, { type: 'match_request', profile: { playerId: 'gm_bbbbbbbbbbbb', nickname: '竹影', avatarId: 'bamboo' } });
  const successA = await waitFor(a, (m) => m.type === 'match_success');
  const successB = await waitFor(b, (m) => m.type === 'match_success');

  assert.equal(successA.roomId, successB.roomId);
  assert.equal(successA.color, 'black');
  assert.equal(successB.color, 'white');
  assert.equal(successA.protocolVersion, 2);
  assert.deepEqual(successA.opponent, { playerId: 'gm_bbbbbbbbbbbb', nickname: '竹影', avatarId: 'bamboo' });
  assert.deepEqual(successB.opponent, { playerId: 'gm_aaaaaaaaaaaa', nickname: '枫客', avatarId: 'maple' });

  closeAll([a, b]);
  await delay(50);
});

test('重复匹配请求幂等，不会创建第二局（PVP-03）', async () => {
  const a = connect(server.port);
  const b = connect(server.port);
  const c = connect(server.port);
  await Promise.all([opened(a), opened(b), opened(c)]);

  send(a, { type: 'match_request' });
  send(a, { type: 'match_request' });
  await waitFor(a, (m) => m.type === 'match_waiting');
  await delay(100);
  assert.equal(a.messages.filter((m) => m.type === 'match_waiting').length >= 2, true);

  send(b, { type: 'match_request' });
  const successA = await waitFor(a, (m) => m.type === 'match_success');
  await waitFor(b, (m) => m.type === 'match_success');

  // 已在房间中再次请求：返回 already_in_game，且不产生新房间
  send(a, { type: 'match_request' });
  const error = await waitFor(a, (m) => m.type === 'error');
  assert.equal(error.code, 'already_in_game');

  send(c, { type: 'match_request' });
  const waitingC = await waitFor(c, (m) => m.type === 'match_waiting');
  assert.equal(waitingC.position, 1);
  await delay(100);
  assert.equal(c.messages.filter((m) => m.type === 'match_success').length, 0);
  assert.ok(successA.roomId);

  closeAll([a, b, c]);
  await delay(50);
});

test('取消匹配：出队回执后可被后续连接正常匹配（PVP-02/03）', async () => {
  const a = connect(server.port);
  const b = connect(server.port);
  await Promise.all([opened(a), opened(b)]);

  send(a, { type: 'match_request' });
  await waitFor(a, (m) => m.type === 'match_waiting');
  send(a, { type: 'match_cancel' });
  await waitFor(a, (m) => m.type === 'match_cancelled');

  send(b, { type: 'match_request' });
  await waitFor(b, (m) => m.type === 'match_waiting');
  await delay(150);
  assert.equal(b.messages.filter((m) => m.type === 'match_success').length, 0);

  closeAll([a, b]);
  await delay(50);
});

test('落子广播与非法落子拒绝（PVP-01、RULE-01）', async () => {
  const { a, b, black, white } = await matchPair(server.port);

  send(black, { type: 'move', row: 7, col: 7 });
  const [moveBlack, moveToWhite] = await Promise.all([
    waitFor(black, (m) => m.type === 'move'),
    waitFor(white, (m) => m.type === 'move'),
  ]);
  assert.deepEqual(moveBlack, { type: 'move', row: 7, col: 7, color: 'black' });
  assert.deepEqual(moveToWhite, { type: 'move', row: 7, col: 7, color: 'black' });

  // 黑方连下两手：不是你的回合
  send(black, { type: 'move', row: 8, col: 8 });
  const notYourTurn = await waitFor(black, (m) => m.type === 'move_rejected');
  assert.equal(notYourTurn.reason, 'not_your_turn');

  // 白方落在已占位置
  send(white, { type: 'move', row: 7, col: 7 });
  const occupied = await waitFor(white, (m) => m.type === 'move_rejected' && m.reason === 'occupied');
  assert.equal(occupied.reason, 'occupied');

  // 越界
  send(white, { type: 'move', row: 15, col: 0 });
  const outOfRange = await waitFor(white, (m) => m.type === 'move_rejected' && m.reason === 'out_of_range');
  assert.equal(outOfRange.reason, 'out_of_range');

  closeAll([a, b]);
  await delay(50);
});

test('五连结算：双方收到同一 game_over，房间清理后可再匹配（PVP-05）', async () => {
  const { a, b, black, white } = await matchPair(server.port);

  const moves = [
    [black, 7, 3], [white, 9, 3],
    [black, 7, 4], [white, 9, 4],
    [black, 7, 5], [white, 9, 5],
    [black, 7, 6], [white, 9, 6],
  ];
  for (const [ws, row, col] of moves) {
    send(ws, { type: 'move', row, col });
    const other = ws === black ? white : black;
    await waitFor(other, (m) => m.type === 'move' && m.row === row && m.col === col);
  }

  send(black, { type: 'move', row: 7, col: 7 });
  const [overBlack, overWhite] = await Promise.all([
    waitFor(black, (m) => m.type === 'game_over'),
    waitFor(white, (m) => m.type === 'game_over'),
  ]);
  assert.equal(overBlack.winner, 'black');
  assert.equal(overBlack.reason, 'win');
  assert.equal(overWhite.winner, 'black');
  assert.equal(overBlack.positions.length, 5);

  // 结算后双方房间标记已清理，可立即重新匹配
  closeAll([a, b]);
  await delay(100);
  const again = await matchPair(server.port);
  assert.ok(again.successA.roomId);
  closeAll([again.a, again.b]);
  await delay(50);
});

test('断线判负：对手收到 opponent_disconnected 与 game_over(disconnect)（PVP-06）', async () => {
  const { a, b, black, white } = await matchPair(server.port);

  black.close();
  const notice = await waitFor(white, (m) => m.type === 'opponent_disconnected');
  assert.equal(notice.color, 'black');
  const over = await waitFor(white, (m) => m.type === 'game_over');
  assert.equal(over.reason, 'disconnect');
  assert.equal(over.winner, 'white');

  closeAll([a, b]);
  await delay(50);
});

test('心跳超时：无 pong 的连接被终止，对手判胜（PVP-06）', { timeout: 15000 }, async () => {
  const shortServer = await startServer({ HEARTBEAT_INTERVAL_MS: '120' });
  try {
    const silent = connect(shortServer.port, { autoPong: false }); // 不回 pong，模拟半开连接
    const alive = connect(shortServer.port);
    await Promise.all([opened(silent), opened(alive)]);

    send(silent, { type: 'match_request' });
    send(alive, { type: 'match_request' });
    await waitFor(alive, (m) => m.type === 'match_success');

    const closed = new Promise((resolve) => silent.once('close', resolve));
    await closed; // 服务端在两轮心跳后 terminate

    const over = await waitFor(alive, (m) => m.type === 'game_over');
    assert.equal(over.reason, 'disconnect');
    assert.equal(over.winner, 'white'); // 静默方执黑被终止

    // 队列与房间均已清理：新连接可正常匹配
    closeAll([silent, alive]);
    await delay(100);
    const again = await matchPair(shortServer.port);
    assert.ok(again.successA.roomId);
    closeAll([again.a, again.b]);
  } finally {
    await stopServer(shortServer);
  }
});

test('超过 8KB 的消息关闭连接且不影响其他客户端（PVP-09）', async () => {
  const big = connect(server.port);
  const normal = connect(server.port);
  await Promise.all([opened(big), opened(normal)]);

  const closed = new Promise((resolve) => big.once('close', resolve));
  send(big, { type: 'match_request', junk: 'x'.repeat(9000) });
  await closed;

  send(normal, { type: 'match_request' });
  const waiting = await waitFor(normal, (m) => m.type === 'match_waiting');
  assert.equal(waiting.position, 1);

  closeAll([normal]);
  await delay(50);
});
