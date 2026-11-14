'use strict';

const { send } = require('./protocol');

/**
 * 落子校验（T1-4）、落子应用/广播（T1-5）、胜负判定（T1-6）与回合计时（T1-7）。
 */

/** 每回合时限：5 分钟 */
const TURN_DURATION_MS = 5 * 60 * 1000;

const REASON_TEXT = {
  not_in_room: '不在对局中',
  game_over: '对局已结束',
  out_of_range: '落子坐标超出棋盘范围',
  occupied: '该位置已有棋子',
  not_your_turn: '还没轮到你落子',
};

function getPlayer(room, ws) {
  return room.players.find((player) => player.ws === ws) || null;
}

/**
 * @returns {{ok: true} | {ok: false, reason: string, message: string}}
 */
function validateMove(room, ws, row, col) {
  const reject = (reason) => ({ ok: false, reason, message: REASON_TEXT[reason] });

  if (!room) return reject('not_in_room');
  if (room.finished) return reject('game_over');
  if (!room.board.isInside(row, col)) return reject('out_of_range');
  if (!room.board.isEmpty(row, col)) return reject('occupied');

  const player = getPlayer(room, ws);
  if (!player || player.color !== room.turn) return reject('not_your_turn');

  return { ok: true };
}

/** 四个检测方向：横、竖、主对角线(↘)、副对角线(↗) */
const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/**
 * 以最后落子点 (row, col) 为中心，检测四个方向是否形成五连（连续 ≥5 同色）。
 * 只在落子后调用，因此无需全盘扫描。
 * @returns {null | {color: string, positions: number[][]}} 未连成返回 null，否则返回获胜颜色与连线坐标
 */
function checkWin(board, row, col, color) {
  for (const [dr, dc] of DIRECTIONS) {
    const line = [[row, col]];

    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;

      while (board.isInside(r, c) && board.get(r, c) === color) {
        if (sign === 1) line.push([r, c]);
        else line.unshift([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }

    if (line.length >= 5) return { color, positions: line };
  }

  return null;
}

/**
 * 清除房间的回合计时器。
 */
function clearTurnTimer(room) {
  if (room.timer) {
    clearTimeout(room.timer);
    room.timer = null;
  }
}

/**
 * 结束对局：标记房间已结束、停止计时，并向双方广播 game_over。
 * 重复调用无效（保证每局只广播一次）。
 */
function endGame(room, winner, reason, positions) {
  if (room.finished) return;

  room.finished = true;
  clearTurnTimer(room);

  const message = { type: 'game_over', winner, reason };
  if (positions) message.positions = positions;
  for (const p of room.players) send(p.ws, message);

  console.log(
    `[${new Date().toISOString()}] room ${room.id} game over: winner=${winner} reason=${reason}`
  );
}

/**
 * 开始（或重置）当前回合的倒计时，并向房间内双方广播 turn_start。
 * 超时未落子则判当前回合方负，广播 game_over（reason='timeout'）。
 * @param {number} [durationMs] 默认 5 分钟，仅测试时传入更短时限
 */
function startTurnTimer(room, durationMs = TURN_DURATION_MS) {
  clearTurnTimer(room);

  room.turnDeadline = Date.now() + durationMs;
  room.timer = setTimeout(() => {
    room.timer = null;

    const loser = room.turn;
    const winner = loser === 'black' ? 'white' : 'black';
    endGame(room, winner, 'timeout');
  }, durationMs);

  const message = {
    type: 'turn_start',
    color: room.turn,
    deadline: room.turnDeadline,
    remainingMs: durationMs,
  };
  for (const p of room.players) send(p.ws, message);
}

/**
 * 落子并广播：更新权威棋盘、切换回合、向房间内两名玩家推送 move。
 * 调用前必须已通过 validateMove。
 * @returns {{row:number, col:number, color:string, nextTurn:string, win:null|{color:string, positions:number[][]}}}
 */
function applyMove(room, ws, row, col) {
  const player = getPlayer(room, ws);

  room.board.set(row, col, player.color);
  room.turn = player.color === 'black' ? 'white' : 'black';

  const message = { type: 'move', row, col, color: player.color };
  for (const p of room.players) {
    send(p.ws, message);
  }

  const win = checkWin(room.board, row, col, player.color);

  if (win) {
    // 五连成局：广播 game_over 并结束对局
    endGame(room, player.color, 'win', win.positions);
  } else {
    // 进入下一回合，重置 5 分钟倒计时
    startTurnTimer(room);
  }

  return { row, col, color: player.color, nextTurn: room.turn, win };
}

module.exports = {
  validateMove,
  applyMove,
  checkWin,
  startTurnTimer,
  clearTurnTimer,
  endGame,
  getPlayer,
  REASON_TEXT,
  TURN_DURATION_MS,
};
