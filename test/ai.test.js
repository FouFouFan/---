// T3-1 AI 基础层测试（AI-02/03）：纯函数、合法落点、四方向模式评分、候选生成。
const test = require('node:test');
const assert = require('node:assert/strict');
const AI = require('../client/ai.js');

/** 在空盘上按坐标列表放同色棋子 */
function boardWith(stones, color) {
  const board = AI.createBoard();
  for (const [row, col] of stones) board[row][col] = color || 'black';
  return board;
}

/** 返回棋盘的可比较快照，用于断言函数没有改动输入 */
function snapshot(board) {
  return JSON.stringify(board);
}

// ---------- 棋盘工具 ----------

test('createBoard 生成 15x15 空盘，cloneBoard 与原盘互相独立', () => {
  const board = AI.createBoard();
  assert.equal(board.length, 15);
  assert.equal(board[0].length, 15);
  assert.ok(board.every((row) => row.every((cell) => cell === null)));

  const copy = AI.cloneBoard(board);
  copy[0][0] = 'black';
  assert.notEqual(board[0][0], copy[0][0]);
  assert.equal(board[0][0], null);
});

test('isLegalMove 只接受盘内空位（AI-03）', () => {
  const board = boardWith([[7, 7]]);
  assert.equal(AI.isLegalMove(board, 7, 7), false); // 已占用
  assert.equal(AI.isLegalMove(board, -1, 0), false); // 盘外
  assert.equal(AI.isLegalMove(board, 0, 15), false); // 盘外
  assert.equal(AI.isLegalMove(board, 7, 8), true);
});

test('getLegalMoves 与 boardIsFull 随棋子数量变化', () => {
  const board = boardWith([[0, 0], [14, 14]]);
  assert.equal(AI.getLegalMoves(board).length, 223);
  assert.equal(AI.boardIsFull(board), false);

  const full = AI.createBoard();
  for (const row of full) row.fill('black');
  assert.equal(AI.boardIsFull(full), true);
  assert.equal(AI.getLegalMoves(full).length, 0);
});

test('hasFive 识别横、竖、两种斜线的五连，四连不算', () => {
  assert.equal(AI.hasFive(boardWith([[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]]), 7, 7, 'black'), true);
  assert.equal(AI.hasFive(boardWith([[3, 7], [4, 7], [5, 7], [6, 7], [7, 7]]), 7, 7, 'black'), true);
  assert.equal(AI.hasFive(boardWith([[3, 3], [4, 4], [5, 5], [6, 6], [7, 7]]), 7, 7, 'black'), true);
  assert.equal(AI.hasFive(boardWith([[3, 11], [4, 10], [5, 9], [6, 8], [7, 7]]), 7, 7, 'black'), true);
  assert.equal(AI.hasFive(boardWith([[7, 4], [7, 5], [7, 6], [7, 7]]), 7, 7, 'black'), false);
});

// ---------- 线型与模式评分 ----------

test('lineString 以落点为中心，盘外记为 #', () => {
  const board = boardWith([[7, 6], [7, 8]]); // 中心 (7,7)，左右各一子
  assert.equal(AI.lineString(board, 7, 7, 0, 1, 'black'), '...XXX...');
  const corner = AI.lineString(board, 0, 0, 1, 0, 'black');
  assert.ok(corner.startsWith('####'));
  assert.equal(corner[4], 'X');
});

test('scoreLine 分值满足「五连 ≫ 活四 > 冲四 > 活三 > 眠三 > 活二 > 眠二」', () => {
  const five = AI.scoreLine('XXXXX');
  const openFour = AI.scoreLine('.XXXX.');
  const four = AI.scoreLine('OXXXX.');
  const openThree = AI.scoreLine('.XXX.');
  const three = AI.scoreLine('OXXX.');
  const openTwo = AI.scoreLine('.XX.');
  const two = AI.scoreLine('OXX.');

  assert.equal(five, AI.SCORES.five);
  assert.ok(five > openFour);
  assert.ok(openFour > four);
  assert.ok(four > openThree);
  assert.ok(openThree > three);
  assert.ok(three > openTwo);
  assert.ok(openTwo > two);
  assert.ok(two > 0);
});

test('scoreLine 识别跳三与跳四', () => {
  assert.equal(AI.scoreLine('.X.XX.'), AI.SCORES.openThree);
  assert.equal(AI.scoreLine('XX.XX'), AI.SCORES.four);
  assert.equal(AI.scoreLine('XXX.X'), AI.SCORES.four);
});

test('evaluatePoint 四方向累加，五连与活三均能被识别', () => {
  const four = boardWith([[7, 3], [7, 4], [7, 5], [7, 6]]);
  assert.ok(AI.evaluatePoint(four, 7, 7, 'black') >= AI.SCORES.five);

  const two = boardWith([[7, 5], [7, 6]]);
  assert.ok(AI.evaluatePoint(two, 7, 7, 'black') >= AI.SCORES.openThree);

  const empty = AI.createBoard();
  // 孤立单子四方向各计 1 分，低于任何成组模式
  assert.ok(AI.evaluatePoint(empty, 7, 7, 'black') < AI.SCORES.openTwo);
  assert.ok(AI.evaluatePoint(empty, 0, 0, 'black') < AI.SCORES.openTwo);
});

test('evaluatePoint 对占用点与盘外点返回 -Infinity', () => {
  const board = boardWith([[7, 7]]);
  assert.equal(AI.evaluatePoint(board, 7, 7, 'black'), -Infinity);
  assert.equal(AI.evaluatePoint(board, -1, 7, 'black'), -Infinity);
});

// ---------- 候选生成 ----------

test('空盘候选为天元 (7,7)', () => {
  const candidates = AI.generateCandidates(AI.createBoard(), 'black');
  assert.deepEqual(candidates, [{ row: 7, col: 7, score: 0 }]);
});

test('候选点只取已有棋子周围 2 格空位（AI-03）', () => {
  const board = boardWith([[7, 7]]);
  const candidates = AI.generateCandidates(board, 'black');

  // 5x5 区域去掉中心 = 24 个空位
  assert.equal(candidates.length, 24);
  assert.ok(candidates.every((m) => board[m.row][m.col] === null));
  assert.ok(candidates.every((m) => Math.max(Math.abs(m.row - 7), Math.abs(m.col - 7)) <= 2));
  assert.ok(!candidates.some((m) => m.row === 0 && m.col === 0));
});

test('候选按启发式降序，同分按行列升序，并遵守上限', () => {
  const board = boardWith([[7, 5], [7, 6], [7, 7]]); // 活三，两端价值最高
  const candidates = AI.generateCandidates(board, 'black');

  for (let i = 1; i < candidates.length; i++) {
    assert.ok(candidates[i - 1].score >= candidates[i].score);
  }
  assert.ok(['4', '8'].includes(String(candidates[0].col)) && candidates[0].row === 7);

  const limited = AI.generateCandidates(board, 'black', { limit: 5 });
  assert.equal(limited.length, 5);
  assert.deepEqual(limited[0], candidates[0]);
});

// ---------- 纯函数（AI-02） ----------

test('评估与候选生成不修改输入棋盘（AI-02）', () => {
  const board = boardWith([[7, 5], [7, 6], [8, 8]], 'white');
  const before = snapshot(board);

  AI.evaluatePoint(board, 7, 7, 'black');
  AI.generateCandidates(board, 'black');
  AI.hasFive(board, 8, 8, 'white');
  AI.getLegalMoves(board);

  assert.equal(snapshot(board), before);
});

test('不依赖浏览器环境即可运行（纯本地，无网络）', () => {
  const board = AI.createBoard();
  assert.equal(typeof window, 'undefined');
  assert.equal(typeof AI.generateCandidates(board, 'white')[0].row, 'number');
});

// ---------- 搜索与难度（T3-2） ----------

test('己方一步成五必下，三档难度一致（AI-04）', () => {
  const board = boardWith([[7, 3], [7, 4], [7, 5], [7, 6]]);
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const move = AI.chooseMove(board, { color: 'black', difficulty, seed: 1, timeLimit: 200 });
    assert.equal(move.row, 7);
    assert.ok([2, 7].includes(move.col), difficulty + ' 应下在两端成五点');
  }
});

test('对手一步成五必须封堵（AI-04）', () => {
  const board = boardWith([[3, 5], [4, 5], [5, 5], [6, 5]], 'white');
  for (const difficulty of ['normal', 'hard']) {
    const move = AI.chooseMove(board, { color: 'black', difficulty, seed: 2, timeLimit: 200 });
    assert.equal(move.col, 5);
    assert.ok([2, 7].includes(move.row), difficulty + ' 应封堵竖线');
  }
});

test('相同棋盘 + 难度 + 种子得到相同落子（AI-11）', () => {
  const board = boardWith([[7, 7], [8, 8], [7, 8]], 'black');
  for (const difficulty of ['easy', 'normal', 'hard']) {
    const a = AI.chooseMove(board, { color: 'white', difficulty, seed: 20261126, timeLimit: 200 });
    const b = AI.chooseMove(board, { color: 'white', difficulty, seed: 20261126, timeLimit: 200 });
    assert.deepEqual(a, b, difficulty + ' 应可复现');
  }
});

test('困难档在时限内返回合法落子，且不修改输入棋盘（AI-03）', () => {
  const board = boardWith([[7, 7], [7, 8], [8, 7], [6, 6], [8, 8]], 'white');
  const before = snapshot(board);

  const started = Date.now();
  const move = AI.chooseMove(board, { color: 'black', difficulty: 'hard', seed: 3, timeLimit: 100 });
  const elapsed = Date.now() - started;

  assert.ok(elapsed < 1500, '耗时 ' + elapsed + 'ms 超出兜底预期');
  assert.ok(AI.isLegalMove(board, move.row, move.col));
  assert.equal(snapshot(board), before);
});

test('满盘时无落子可返回 null，合法落子不重复占用', () => {
  const full = AI.createBoard();
  for (const row of full) row.fill('black');
  assert.equal(AI.chooseMove(full, { color: 'white' }), null);

  const board = boardWith([[7, 7], [8, 8]], 'black');
  const move = AI.chooseMove(board, { color: 'black', difficulty: 'normal' });
  assert.equal(board[move.row][move.col], null);
});

test('简单档 Top3 随机仍可复现，空盘首手为天元', () => {
  const center = AI.chooseMove(AI.createBoard(), { color: 'black', difficulty: 'easy', seed: 9 });
  assert.deepEqual(center, { row: 7, col: 7 });

  const board = boardWith([[7, 5], [7, 6], [7, 7]]);
  const a = AI.chooseMove(board, { color: 'black', difficulty: 'easy', seed: 9 });
  const b = AI.chooseMove(board, { color: 'black', difficulty: 'easy', seed: 9 });
  assert.deepEqual(a, b);
  assert.ok(AI.isLegalMove(board, a.row, a.col));
});
