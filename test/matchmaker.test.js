'use strict';

// T4-2 匹配队列改造（PVP-02~05）：取消、幂等、FIFO、先入队执黑、队列/房间上限、清理幂等。
const test = require('node:test');
const assert = require('node:assert/strict');
const { Matchmaker, PROTOCOL_VERSION, MAX_ROOMS, MAX_QUEUE } = require('../server/matchmaker.js');
const { clearTurnTimer } = require('../server/game.js');

/** 模拟 WebSocket：记录已发送消息 */
function makeWs(id) {
  const ws = {
    clientId: id,
    OPEN: 1,
    readyState: 1,
    sent: [],
    send(raw) {
      ws.sent.push(typeof raw === 'string' ? JSON.parse(raw) : raw);
    },
    of(type) {
      return ws.sent.filter((message) => message.type === type);
    },
    last(type) {
      const list = ws.of(type);
      return list[list.length - 1];
    },
  };
  return ws;
}

/** 每局开 5 分钟倒计时，测试结束需清理，避免挂起进程 */
function cleanup(matchmaker) {
  for (const room of matchmaker.rooms.values()) clearTurnTimer(room);
}

test('先入队者执黑，双方收到含对手档案的 match_success（PVP-03/04）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);
  const b = makeWs(2);

  mm.enqueue(a, { playerId: 'gm_aaaaaaaaaaaa', nickname: '竹影', avatarId: 'bamboo' });
  assert.equal(a.last('match_waiting').position, 1);
  assert.equal(mm.enqueue(b, { playerId: 'gm_bbbbbbbbbbbb', nickname: '松风', avatarId: 'pine' }), mm.rooms.values().next().value);

  const roomId = `room-1`;
  assert.equal(a.roomId, roomId);
  assert.equal(b.roomId, roomId);
  assert.equal(a.color, 'black');
  assert.equal(b.color, 'white');

  const aSuccess = a.last('match_success');
  const bSuccess = b.last('match_success');
  assert.equal(aSuccess.roomId, roomId);
  assert.equal(aSuccess.color, 'black');
  assert.equal(aSuccess.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(aSuccess.opponent, {
    playerId: 'gm_bbbbbbbbbbbb', nickname: '松风', avatarId: 'pine',
  });
  assert.equal(bSuccess.color, 'white');
  assert.deepEqual(bSuccess.opponent, {
    playerId: 'gm_aaaaaaaaaaaa', nickname: '竹影', avatarId: 'bamboo',
  });

  cleanup(mm);
});

test('FIFO：4 人依次入队，前两人先成局（PVP-03）', () => {
  const mm = new Matchmaker();
  const clients = [1, 2, 3, 4].map(makeWs);
  clients.forEach((ws, i) => mm.enqueue(ws, { nickname: `玩家${i}` }));

  assert.equal(mm.rooms.size, 2);
  assert.equal(clients[0].roomId, 'room-1');
  assert.equal(clients[1].roomId, 'room-1');
  assert.equal(clients[2].roomId, 'room-2');
  assert.equal(clients[3].roomId, 'room-2');
  assert.equal(mm.queue.length, 0);
  cleanup(mm);
});

test('重复入队幂等：同一连接只保留一条队列记录（PVP-03）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);

  mm.enqueue(a, { nickname: '枫客' });
  mm.enqueue(a, { nickname: '改名不应生效' });
  mm.enqueue(a, {});

  assert.equal(mm.queue.length, 1);
  assert.equal(mm.positionOf(a), 1);
  assert.equal(a.of('match_waiting').length, 3);
  assert.deepEqual(a.profile, { playerId: null, nickname: '枫客', avatarId: 'maple' });
  cleanup(mm);
});

test('取消匹配出队并回 match_cancelled，重复取消幂等（PVP-02）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);
  const b = makeWs(2);

  mm.enqueue(a);
  mm.enqueue(b);
  // 此时 a、b 已成局，c 单独排队
  const c = makeWs(3);
  mm.enqueue(c);
  assert.equal(mm.positionOf(c), 1);

  assert.equal(mm.cancel(c), true);
  assert.equal(mm.queue.length, 0);
  assert.equal(c.of('match_cancelled').length, 1);

  assert.equal(mm.cancel(c), false); // 已经不在队列
  assert.equal(c.of('match_cancelled').length, 2); // 仍回执，幂等
  cleanup(mm);
});

test('取消后队列顺序保持，后续两人正常成局（PVP-03）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);
  const b = makeWs(2);
  const c = makeWs(3);
  const d = makeWs(4);

  mm.enqueue(a);
  mm.enqueue(b); // a+b 成局
  mm.enqueue(c); // c 排队
  mm.enqueue(d); // c+d 成局
  assert.equal(c.roomId, 'room-2');
  assert.equal(d.color, 'white'); // c 先入队执黑
  assert.equal(c.color, 'black');
  assert.equal(mm.queue.length, 0);
  cleanup(mm);
});

test('已进入对局再请求匹配或取消会被拒绝（PVP-03）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);
  const b = makeWs(2);
  mm.enqueue(a);
  mm.enqueue(b);

  mm.enqueue(a);
  assert.equal(a.last('error').code, 'already_in_room');
  assert.equal(mm.queue.length, 0);

  mm.cancel(a);
  assert.equal(a.last('error').code, 'already_in_room');
  assert.equal(mm.rooms.size, 1);
  cleanup(mm);
});

test('断线移出队列（PVP-03）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);
  const b = makeWs(2);

  mm.enqueue(a);
  assert.equal(mm.remove(a), true);
  assert.equal(mm.remove(a), false);
  assert.equal(mm.queue.length, 0);

  // a 断线后，b 入队应排在首位等待而不是立即成局
  mm.enqueue(b);
  assert.equal(mm.rooms.size, 0);
  assert.equal(mm.positionOf(b), 1);
  cleanup(mm);
});

test('队列上限触发 server_busy（PVP-09 防护）', () => {
  const mm = new Matchmaker({ maxQueue: 2 });
  const clients = [1, 2, 3].map(makeWs);
  clients.forEach((ws) => mm.enqueue(ws));

  assert.equal(mm.queue.length, 2);
  assert.equal(clients[2].last('error').code, 'server_busy');
  assert.equal(clients[2].roomId, undefined);
  cleanup(mm);
});

test('房间上限触发 server_busy（NFR-04）', () => {
  const mm = new Matchmaker({ maxRooms: 1 });
  const clients = [1, 2, 3, 4].map(makeWs);
  clients.forEach((ws) => mm.enqueue(ws));

  assert.equal(mm.rooms.size, 1);
  assert.equal(clients[2].last('error').code, 'server_busy');
  assert.equal(clients[3].last('error').code, 'server_busy');
  assert.equal(mm.queue.length, 0); // 被拒绝者不入队
  cleanup(mm);
});

test('房间清理幂等：重复销毁安全且标记被清除（PVP-05）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);
  const b = makeWs(2);
  mm.enqueue(a);
  const room = mm.enqueue(b);

  assert.equal(mm.destroyRoom(room), true);
  assert.equal(mm.rooms.size, 0);
  assert.equal(a.roomId, null);
  assert.equal(b.color, null);

  assert.equal(mm.destroyRoom(room), false);
  assert.equal(mm.destroyRoom(null), false);

  // 清理后可再次匹配
  mm.enqueue(a);
  assert.equal(mm.positionOf(a), 1);
  cleanup(mm);
});

test('支持 32 个并发房间（PVP-05 / NFR-04）', () => {
  const mm = new Matchmaker();
  const clients = Array.from({ length: 64 }, (_, i) => makeWs(i + 1));
  for (const ws of clients) mm.enqueue(ws);

  assert.equal(mm.rooms.size, 32);
  assert.equal(mm.queue.length, 0);
  assert.ok(MAX_ROOMS >= 32);
  assert.ok(MAX_QUEUE >= 100);

  for (const ws of clients) {
    const success = ws.last('match_success');
    assert.ok(success.roomId);
    assert.equal(success.protocolVersion, 2);
    assert.deepEqual(Object.keys(success.opponent).sort(), ['avatarId', 'nickname', 'playerId']);
  }
  cleanup(mm);
});

test('对手档案裁剪：非法字段降级且不转发自定义头像（PVP-09）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);
  const b = makeWs(2);

  mm.enqueue(a, {
    playerId: 'BAD',
    nickname: '\u0000' + '枫'.repeat(40),
    avatarId: 'custom',
    avatarDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(100),
  });
  mm.enqueue(b, { nickname: '松风' });

  const opponent = b.last('match_success').opponent;
  assert.equal(opponent.playerId, null);
  assert.equal(opponent.nickname, '枫'.repeat(24));
  assert.equal(opponent.avatarId, 'maple');
  assert.equal(JSON.stringify(opponent).includes('avatarDataUrl'), false);
  cleanup(mm);
});

test('缺省档案降级为匿名默认值（PVP-04）', () => {
  const mm = new Matchmaker();
  const a = makeWs(1);
  const b = makeWs(2);
  mm.enqueue(a); // v1 客户端不带 profile
  mm.enqueue(b);

  assert.deepEqual(a.last('match_success').opponent, {
    playerId: null, nickname: '棋客', avatarId: 'maple',
  });
  cleanup(mm);
});
