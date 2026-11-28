'use strict';

// T4-2 匹配队列改造（PVP-02/03/04/05）：FIFO、先入队执黑、幂等、取消、队列上限、
// 房间清理幂等、档案随队列下发、≥32 并发房间。
const test = require('node:test');
const assert = require('node:assert/strict');
const { Matchmaker, PROTOCOL_VERSION } = require('../server/matchmaker.js');

/** WebSocket 替身：记录所有下发消息 */
function makeWs(id) {
  return {
    clientId: id,
    OPEN: 1,
    readyState: 1,
    roomId: null,
    color: null,
    inGame: false,
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
    lastSent(type) {
      return [...this.sent].reverse().find((msg) => msg.type === type) || null;
    },
  };
}

function makeMatchmaker(options) {
  // turnDurationMs 设很长，避免测试期间触发超时判负
  return new Matchmaker({ turnDurationMs: 60 * 60 * 1000, ...options });
}

function pairUp(matchmaker, a, b, profileA, profileB) {
  matchmaker.enqueue(a, profileA);
  matchmaker.enqueue(b, profileB);
}

function cleanupAll(matchmaker) {
  for (const room of [...matchmaker.rooms.values()]) matchmaker.cleanupRoom(room);
}

test('FIFO 匹配：先入队执黑，双方收到同一房间与对手信息（PVP-03/04）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);
  const b = makeWs(2);

  matchmaker.enqueue(a, { playerId: 'gm_aaaaaaaaaaaa', nickname: '枫客', avatarId: 'maple' });
  assert.deepEqual(a.lastSent('match_waiting'), { type: 'match_waiting', position: 1 });
  assert.equal(matchmaker.queue.length, 1);

  matchmaker.enqueue(b, { playerId: 'gm_bbbbbbbbbbbb', nickname: '竹影', avatarId: 'bamboo' });

  const successA = a.lastSent('match_success');
  const successB = b.lastSent('match_success');
  assert.equal(successA.roomId, successB.roomId);
  assert.equal(successA.color, 'black');
  assert.equal(successB.color, 'white');
  assert.equal(successA.protocolVersion, PROTOCOL_VERSION);
  assert.equal(PROTOCOL_VERSION, 2);
  assert.deepEqual(successA.opponent, {
    playerId: 'gm_bbbbbbbbbbbb', nickname: '竹影', avatarId: 'bamboo',
  });
  assert.deepEqual(successB.opponent, {
    playerId: 'gm_aaaaaaaaaaaa', nickname: '枫客', avatarId: 'maple',
  });
  assert.equal(matchmaker.queue.length, 0);
  assert.equal(matchmaker.rooms.size, 1);
  cleanupAll(matchmaker);
});

test('重复 match_request 幂等：回 match_waiting 且不重复入队（PVP-03）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);

  matchmaker.enqueue(a);
  matchmaker.enqueue(a);
  matchmaker.enqueue(a);

  assert.equal(matchmaker.queue.length, 1);
  assert.equal(a.sent.filter((msg) => msg.type === 'match_waiting').length, 3);
  assert.equal(a.lastSent('match_waiting').position, 1);
  cleanupAll(matchmaker);
});

test('取消匹配立即出队并回 match_cancelled，重复取消仍幂等（PVP-02）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);
  const b = makeWs(2);

  matchmaker.enqueue(a);
  assert.equal(matchmaker.cancel(a), true);
  assert.equal(matchmaker.queue.length, 0);
  assert.deepEqual(a.lastSent('match_cancelled'), { type: 'match_cancelled' });

  // 重复取消：不抛错、仍回执，但不影响队列
  assert.equal(matchmaker.cancel(a), false);
  assert.equal(a.sent.filter((msg) => msg.type === 'match_cancelled').length, 2);

  // 取消后另一连接独自入队不会开局
  matchmaker.enqueue(b);
  assert.equal(b.roomId, null);
  assert.equal(matchmaker.rooms.size, 0);
  cleanupAll(matchmaker);
});

test('取消后重新匹配可正常开局（PVP-05）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);
  const b = makeWs(2);
  const c = makeWs(3);

  matchmaker.enqueue(a);
  matchmaker.cancel(a);
  matchmaker.enqueue(b);
  matchmaker.enqueue(c);

  assert.ok(b.roomId);
  assert.equal(b.roomId, c.roomId);
  assert.equal(b.color, 'black');
  assert.equal(c.color, 'white');
  cleanupAll(matchmaker);
});

test('已在对局中的连接再次请求匹配返回 already_in_game（PVP-03）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);
  const b = makeWs(2);
  pairUp(matchmaker, a, b);

  const result = matchmaker.enqueue(a);
  assert.equal(result, null);
  assert.equal(a.lastSent('error').code, 'already_in_game');
  assert.equal(matchmaker.queue.length, 0);
  cleanupAll(matchmaker);
});

test('队列达到上限返回 server_busy，已在队列者不受影响（PVP-09）', () => {
  const matchmaker = makeMatchmaker({ queueLimit: 1 });
  const a = makeWs(1);
  const b = makeWs(2);

  matchmaker.enqueue(a);
  const result = matchmaker.enqueue(b);

  assert.equal(result, null);
  assert.equal(b.lastSent('error').code, 'server_busy');
  assert.equal(matchmaker.queue.length, 1);
  assert.equal(a.roomId, null);
  cleanupAll(matchmaker);
});

test('断线出队：remove 清掉队列记录（PVP-03 / 4.5）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);
  const c = makeWs(3);
  const d = makeWs(4);

  matchmaker.enqueue(a);
  assert.equal(matchmaker.remove(a), true);
  assert.equal(matchmaker.queue.length, 0);
  assert.equal(matchmaker.remove(a), false);

  matchmaker.enqueue(c);
  matchmaker.enqueue(d);
  assert.equal(c.roomId, d.roomId);
  assert.equal(c.color, 'black');
  cleanupAll(matchmaker);
});

test('队列项携带裁剪后的档案，恶意字段不进入房间（7.7 / PVP-09）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);
  const b = makeWs(2);

  pairUp(matchmaker, a, b, {
    playerId: 'BAD',
    nickname: '\u0000' + '枫'.repeat(40),
    avatarId: 'custom-upload',
    avatarDataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(1000),
    isAdmin: true,
  });

  const room = [...matchmaker.rooms.values()][0];
  const profile = room.players[0].profile;
  assert.deepEqual(Object.keys(profile).sort(), ['avatarId', 'nickname', 'playerId']);
  assert.equal(profile.playerId, null);
  assert.equal(profile.nickname.length, 24);
  assert.equal(profile.avatarId, 'maple');
  assert.equal(JSON.stringify(profile).includes('avatarDataUrl'), false);
  assert.equal(JSON.stringify(b.lastSent('match_success')).includes('isAdmin'), false);
  cleanupAll(matchmaker);
});

test('房间清理幂等，清理后可再次匹配到新房间（PVP-05）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);
  const b = makeWs(2);
  pairUp(matchmaker, a, b);

  const room = [...matchmaker.rooms.values()][0];
  const firstId = room.id;
  assert.equal(matchmaker.cleanupRoom(room), true);
  assert.equal(matchmaker.cleanupRoom(room), false);
  assert.equal(matchmaker.rooms.size, 0);
  for (const ws of [a, b]) {
    assert.equal(ws.roomId, null);
    assert.equal(ws.inGame, false);
    assert.equal(ws.color, null);
  }

  pairUp(matchmaker, a, b);
  assert.notEqual(a.roomId, firstId);
  assert.equal(a.roomId, b.roomId);
  cleanupAll(matchmaker);
});

test('支持 ≥32 并发房间，全部可独立清理（PVP-05 / NFR-04）', () => {
  const matchmaker = makeMatchmaker();
  const pairs = [];
  for (let i = 0; i < 32; i++) {
    const first = makeWs(i * 2 + 1);
    const second = makeWs(i * 2 + 2);
    pairUp(matchmaker, first, second);
    pairs.push([first, second]);
  }

  assert.equal(matchmaker.rooms.size, 32);
  assert.equal(matchmaker.queue.length, 0);
  assert.equal(new Set(pairs.map(([ws]) => ws.roomId)).size, 32);
  for (const [first] of pairs) {
    assert.ok(matchmaker.rooms.has(first.roomId));
  }

  cleanupAll(matchmaker);
  assert.equal(matchmaker.rooms.size, 0);
});

test('v1 客户端不带 profile 也能匹配，对手字段降级为匿名默认（PVP-08）', () => {
  const matchmaker = makeMatchmaker();
  const a = makeWs(1);
  const b = makeWs(2);
  pairUp(matchmaker, a, b);

  const success = b.lastSent('match_success');
  assert.deepEqual(success.opponent, { playerId: null, nickname: '棋客', avatarId: 'maple' });
  assert.equal(success.protocolVersion, 2);
  cleanupAll(matchmaker);
});
