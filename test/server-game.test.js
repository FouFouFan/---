'use strict';

// T4-4 和棋/认输/满盘（PVP-10/11、RULE-04）：isFull、winner:null、resign 判负、计时器清理。
const test = require('node:test');
const assert = require('node:assert/strict');
const { Board } = require('../server/board.js');
const { applyMove, resign, checkWin, validateMove } = require('../server/game.js');

function makeWs(id) {
  return {
    clientId: id,
    OPEN: 1,
    readyState: 1,
    sent: [],
    send(payload) {
      this.sent.push(JSON.parse(payload));
    },
    gameOver() {
      return this.sent.filter((msg) => msg.type === 'game_over');
    },
  };
}

function makeRoom(a, b) {
  const room = {
    id: 'room-test',
    board: new Board(),
    turn: 'black',
    finished: false,
    timer: setTimeout(() => {}, 60 * 60 * 1000), // 模拟进行中的回合计时
    players: [
      { ws: a, color: 'black', profile: { nickname: 'A' } },
      { ws: b, color: 'white', profile: { nickname: 'B' } },
    ],
    ends: 0,
  };
  room.onEnd = () => { room.ends += 1; };
  return room;
}

test('isFull：空盘为 false，225 子为 true（PVP-10）', () => {
  const board = new Board();
  assert.equal(board.isFull(), false);

  board.set(0, 0, 'black');
  assert.equal(board.isFull(), false);

  for (let row = 0; row < board.size; row++) {
    for (let col = 0; col < board.size; col++) board.set(row, col, 'white');
  }
  assert.equal(board.isFull(), true);
});

test('满盘且无五连：winner 为 null、reason 为 draw，双方结算（PVP-10）', () => {
  const a = makeWs(1);
  const b = makeWs(2);
  const room = makeRoom(a, b);

  // 以 2 格为周期交错填满，保证任意方向连续同色不超过 4
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      if (row === 7 && col === 7) continue; // 留最后一手
      room.board.set(row, col, (row + Math.floor(col / 2)) % 2 === 0 ? 'black' : 'white');
    }
  }
  let prefilledWin = null;
  for (let row = 0; row < 15 && !prefilledWin; row++) {
    for (let col = 0; col < 15 && !prefilledWin; col++) {
      const color = room.board.get(row, col);
      if (color && checkWin(room.board, row, col, color)) prefilledWin = [row, col];
    }
  }
  assert.equal(prefilledWin, null, '预置棋盘不应已有五连');

  room.turn = 'black';
  assert.equal(validateMove(room, a, 7, 7).ok, true);
  applyMove(room, a, 7, 7);

  assert.equal(room.board.isFull(), true);
  assert.equal(room.finished, true);
  assert.equal(room.timer, null, '终局应清理回合计时器');
  assert.equal(room.ends, 1);
  for (const ws of [a, b]) {
    const messages = ws.gameOver();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].winner, null);
    assert.equal(messages[0].reason, 'draw');
  }
});

test('认输：对手胜、reason 为 resign，双方各收到一次 game_over（PVP-11）', () => {
  const a = makeWs(1);
  const b = makeWs(2);
  const room = makeRoom(a, b);

  assert.equal(resign(room, b), true);

  assert.equal(room.finished, true);
  assert.equal(room.timer, null);
  assert.equal(room.ends, 1);
  for (const ws of [a, b]) {
    const messages = ws.gameOver();
    assert.equal(messages.length, 1);
    assert.equal(messages[0].winner, 'black'); // 白色认输，黑色获胜
    assert.equal(messages[0].reason, 'resign');
  }
});

test('黑方认输则白方胜；重复认输幂等（不再广播）', () => {
  const a = makeWs(1);
  const b = makeWs(2);
  const room = makeRoom(a, b);

  assert.equal(resign(room, a), true);
  assert.equal(resign(room, a), false);
  assert.equal(resign(room, b), false);

  assert.equal(a.gameOver().length, 1);
  assert.equal(b.gameOver()[0].winner, 'white');
  assert.equal(room.ends, 1);
});

test('不在房间或房间为空时认输返回 false，不抛错', () => {
  const a = makeWs(1);
  const room = makeRoom(a, makeWs(2));
  assert.equal(resign(room, makeWs(9)), false);
  assert.equal(resign(null, a), false);
  assert.equal(room.finished, false);
  assert.equal(a.gameOver().length, 0);
  clearTimeout(room.timer);
});

test('和棋后落子被拒绝（game_over），且不重复结算', () => {
  const a = makeWs(1);
  const b = makeWs(2);
  const room = makeRoom(a, b);
  for (let row = 0; row < 15; row++) {
    for (let col = 0; col < 15; col++) {
      if (row === 7 && col === 7) continue;
      room.board.set(row, col, (row + Math.floor(col / 2)) % 2 === 0 ? 'black' : 'white');
    }
  }
  room.turn = 'black';
  applyMove(room, a, 7, 7);

  const rejected = validateMove(room, b, 0, 0);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, 'game_over');
  assert.equal(room.ends, 1);
  assert.equal(b.gameOver().length, 1);
});
