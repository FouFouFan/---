// T3-6 人机对局控制（AI-06/07/08）：思考锁、300–700ms 反馈、胜负/和棋、用时。
const test = require('node:test');
const assert = require('node:assert/strict');
const AiGame = require('../client/ai-game.js');
const AI = require('../client/ai.js');

/** 构造带记录能力的棋盘视图与 DOM 元素替身 */
function makeDeps(random) {
  const calls = { interactive: [], hover: [] };
  const boardView = {
    board: null,
    handler: null,
    setBoard(b) { this.board = b; },
    reset() {},
    onMove(fn) { this.handler = fn; },
    setInteractive(v) { calls.interactive.push(v); },
    setHoverEnabled(v) { calls.hover.push(v); },
    setHoverColor() {},
    setLastMove() {},
    animateMove() {},
    render() {},
  };
  function el() {
    return { hidden: false, textContent: '', title: '', dataset: {}, addEventListener() {} };
  }
  const elements = {
    gameInfo: el(), turnLabel: el(), countdown: el(), roundTime: el(),
    matchOverlay: el(), resultOverlay: el(), resultTitle: el(),
    resultMessage: el(), resultButton: el(),
  };
  return {
    boardView,
    elements,
    calls,
    random: random || (() => 0),
    playSound() {},
    unlockAudio() {},
  };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('执子偏好：黑/白直接生效，auto 由随机数决定（AI-01/09）', () => {
  assert.equal(AiGame.resolveHumanColor('black', () => 0.9), 'black');
  assert.equal(AiGame.resolveHumanColor('white', () => 0.1), 'white');
  assert.equal(AiGame.resolveHumanColor('auto', () => 0), 'black');
  assert.equal(AiGame.resolveHumanColor('auto', () => 0.9), 'white');
});

test('思考反馈固定在 300–700ms（AI-06）', () => {
  assert.equal(AiGame.thinkDelay(() => 0), 300);
  assert.equal(AiGame.thinkDelay(() => 0.999), 700);
  assert.equal(AiGame.THINK_MIN, 300);
  assert.equal(AiGame.THINK_MAX, 700);
});

test('用时格式化为 m:ss（AI-08）', () => {
  assert.equal(AiGame.formatClock(0), '0:00');
  assert.equal(AiGame.formatClock(61000), '1:01');
  assert.equal(AiGame.formatClock(300000), '5:00');
});

test('人类执黑先行：开局可落子，落子后进入思考锁（AI-06）', async () => {
  const deps = makeDeps();
  const game = AiGame.create(deps);
  const state = game.start({ difficulty: 'easy', preferredColor: 'black' });

  assert.equal(state.humanColor, 'black');
  assert.equal(state.thinking, false);
  assert.equal(deps.calls.interactive.at(-1), true);

  deps.boardView.handler({ row: 7, col: 7 });
  assert.equal(state.board[7][7], 'black');
  assert.equal(state.thinking, true);
  assert.equal(deps.calls.interactive.at(-1), false);
  assert.equal(deps.elements.turnLabel.textContent, 'AI 思考中…');

  await wait(400);
  const stones = state.board.flat().filter(Boolean);
  assert.equal(stones.length, 2); // 人类 1 子 + AI 1 子
  assert.equal(state.turn, 'black');
  assert.equal(state.thinking, false);
  assert.equal(deps.calls.interactive.at(-1), true);
  game.stop();
});

test('人类执白时 AI 执黑先行，且思考期间锁定输入（AI-06）', async () => {
  const deps = makeDeps();
  const game = AiGame.create(deps);
  const state = game.start({ difficulty: 'easy', preferredColor: 'white' });

  assert.equal(state.aiColor, 'black');
  assert.equal(state.thinking, true);
  assert.equal(deps.calls.interactive.at(-1), false);

  await wait(400);
  assert.equal(state.board.flat().filter(Boolean).length, 1);
  assert.equal(state.turn, 'white');
  assert.equal(deps.calls.interactive.at(-1), true);
  game.stop();
});

test('五连判胜并显示结果（AI-07）', () => {
  const deps = makeDeps();
  const game = AiGame.create(deps);
  const state = game.start({ difficulty: 'easy', preferredColor: 'black' });
  [[7, 3], [7, 4], [7, 5], [7, 6]].forEach(([r, c]) => { state.board[r][c] = 'black'; });

  deps.boardView.handler({ row: 7, col: 7 });
  assert.equal(state.finished, true);
  assert.equal(deps.elements.resultOverlay.hidden, false);
  assert.equal(deps.elements.resultTitle.textContent, '你赢了');
  assert.match(deps.elements.resultMessage.textContent, /本局用时/);
  assert.equal(deps.calls.interactive.at(-1), false);
  game.stop();
});

test('满盘无五连判和棋（AI-07）', () => {
  const deps = makeDeps();
  const game = AiGame.create(deps);
  const state = game.start({ difficulty: 'easy', preferredColor: 'black' });

  // 用 3x3 小棋盘替换：不可能出现五连，最后一手后必为和棋
  state.board = [
    ['black', 'white', 'black'],
    ['white', 'black', 'white'],
    ['black', 'white', null],
  ];
  deps.boardView.handler({ row: 2, col: 2 });

  assert.equal(state.finished, true);
  assert.equal(AI.boardIsFull(state.board), true);
  assert.equal(deps.elements.resultTitle.textContent, '和棋');
  game.stop();
});

test('停止后不再执行待定的 AI 落子（路由卸载清理）', async () => {
  const deps = makeDeps();
  const game = AiGame.create(deps);
  const state = game.start({ difficulty: 'easy', preferredColor: 'white' });
  game.stop();

  await wait(400);
  assert.equal(state.board.flat().filter(Boolean).length, 0);
});
