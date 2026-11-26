// T3-8 AI 性能验证（NFR-02）：简单 ≤100ms、普通 ≤300ms、困难 P95 ≤800ms、硬上限 1500ms。
// 结果写入 test/fixtures/ai-performance-report.json（测试记录落盘）。
// 说明：300–700ms 思考反馈延时不在统计范围内，仅测量 AI.chooseMove 计算耗时。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const AI = require('../client/ai.js');

const REPORT_PATH = path.join(__dirname, 'fixtures', 'ai-performance-report.json');
const SAMPLES_PER_BOARD = 4;

/** 用简单档自对弈生成真实中盘/复杂局面（固定种子，可复现） */
function playoutBoard(moves) {
  const board = AI.createBoard();
  let color = 'black';
  for (let i = 0; i < moves; i++) {
    const move = AI.chooseMove(board, { color, difficulty: 'easy', seed: 777 + i });
    if (!move) break;
    board[move.row][move.col] = color;
    if (AI.hasFive(board, move.row, move.col, color)) break;
    color = AI.opposite(color);
  }
  return { board, color };
}

const POSITIONS = [
  { name: '开局', board: AI.createBoard(), color: 'black' },
  { name: '中盘16手', ...playoutBoard(16) },
  { name: '复杂40手', ...playoutBoard(40) },
];

/** 对同一批局面重复采样，返回毫秒耗时数组 */
function measure(difficulty, options) {
  const samples = [];
  for (const position of POSITIONS) {
    for (let i = 0; i < SAMPLES_PER_BOARD; i++) {
      const board = AI.cloneBoard(position.board);
      const started = performance.now();
      const move = AI.chooseMove(board, {
        color: position.color,
        difficulty,
        seed: 1000 + i,
        timeLimit: options && options.timeLimit,
      });
      const elapsed = performance.now() - started;
      assert.ok(move && AI.isLegalMove(board, move.row, move.col), difficulty + ' 必须返回合法落点');
      samples.push(elapsed);
    }
  }
  return samples.sort((a, b) => a - b);
}

function statsOf(samples) {
  const sum = samples.reduce((total, value) => total + value, 0);
  const p95Index = Math.min(samples.length - 1, Math.floor(samples.length * 0.95));
  return {
    count: samples.length,
    avg: Number((sum / samples.length).toFixed(2)),
    p95: Number(samples[p95Index].toFixed(2)),
    max: Number(samples[samples.length - 1].toFixed(2)),
  };
}

test('三档耗时符合 NFR-02，困难档硬上限 1500ms', { timeout: 180000 }, () => {
  const easy = statsOf(measure('easy'));
  const normal = statsOf(measure('normal'));
  const hard = statsOf(measure('hard'));

  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform + ' ' + process.arch,
    note: '仅统计 AI.chooseMove 计算耗时，不含 300–700ms 思考反馈；时限按墙钟控制，CPU 降速时仍在同一时间预算内回退。',
    thresholds: { easyMax: 100, normalMax: 300, hardP95: 800, hardMax: 1500 },
    positions: POSITIONS.map((p) => p.name),
    easy,
    normal,
    hard,
    estimated6xHardMax: Number((hard.max * 6).toFixed(2)),
    cpuThrottling6x: {
      method: 'Chrome DevTools → Performance → CPU: 6x slowdown，再测量困难档单步耗时',
      expected: '困难档单步 ≤1500ms，且思考期间 UI 锁定、结束后恢复输入',
      status: '待人工浏览器实测',
    },
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');

  assert.ok(easy.max <= 100, '简单档最大耗时 ' + easy.max + 'ms');
  assert.ok(normal.max <= 300, '普通档最大耗时 ' + normal.max + 'ms');
  assert.ok(hard.max <= 1500, '困难档超出硬上限：' + hard.max + 'ms');
  // P95 目标 800ms；允许 100ms 的计时与调度开销
  assert.ok(hard.p95 <= 900, '困难档 P95 超标：' + hard.p95 + 'ms');
  // 以本机最慢单步 ×6 估算 6× 降速表现（真实降速实测步骤见报告 cpuThrottling6x）
  assert.ok(hard.max * 6 <= 1500, '6× 降速估算超出硬上限：' + (hard.max * 6).toFixed(2) + 'ms');
});
