// T1-3 战绩模块测试
// 覆盖 STAT-01~06：幂等、胜负和统计、连胜、history 环形 20、games 恒等、reset
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const STORE_PATH = '../client/store.js';
const STATS_PATH = '../client/stats-store.js';

function createMockStorage() {
  const store = {};
  return {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
  };
}

function reloadModules() {
  delete require.cache[require.resolve(STORE_PATH)];
  delete require.cache[require.resolve(STATS_PATH)];
  const Store = require(STORE_PATH);
  Store._resetForTest();
  const StatsStore = require(STATS_PATH);
  return { Store, StatsStore };
}

beforeEach(() => {
  global.localStorage = createMockStorage();
});

afterEach(() => {
  delete global.localStorage;
});

// ---------- 默认值 ----------

test('get() 无战绩时返回默认值（全 0）', () => {
  const { StatsStore } = reloadModules();
  const s = StatsStore.get();
  assert.equal(s.wins, 0);
  assert.equal(s.losses, 0);
  assert.equal(s.draws, 0);
  assert.equal(s.currentStreak, 0);
  assert.equal(s.longestStreak, 0);
  assert.deepEqual(s.history, []);
  assert.equal(s.schemaVersion, 1);
});

// ---------- STAT-03 胜负和统计 ----------

test('record win 增加 wins，games = wins + losses + draws', () => {
  const { StatsStore } = reloadModules();
  const s = StatsStore.record({ id: 'r1', mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  assert.equal(s.wins, 1);
  assert.equal(s.losses, 0);
  assert.equal(s.draws, 0);
  assert.equal(StatsStore.getGames(s), 1);
});

test('record loss 增加 losses', () => {
  const { StatsStore } = reloadModules();
  const s = StatsStore.record({ id: 'r1', mode: 'pvp', result: 'loss', color: 'white', turns: 20 });
  assert.equal(s.losses, 1);
  assert.equal(StatsStore.getGames(s), 1);
});

test('record draw 增加 draws', () => {
  const { StatsStore } = reloadModules();
  const s = StatsStore.record({ id: 'r1', mode: 'ai', result: 'draw', color: 'black', turns: 225 });
  assert.equal(s.draws, 1);
  assert.equal(StatsStore.getGames(s), 1);
});

test('多局后 games 恒等于 wins + losses + draws', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ id: 'r1', mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  StatsStore.record({ id: 'r2', mode: 'pvp', result: 'win', color: 'white', turns: 15 });
  StatsStore.record({ id: 'r3', mode: 'pvp', result: 'loss', color: 'black', turns: 20 });
  StatsStore.record({ id: 'r4', mode: 'ai', result: 'draw', color: 'white', turns: 100 });
  const s = StatsStore.get();
  assert.equal(s.wins, 2);
  assert.equal(s.losses, 1);
  assert.equal(s.draws, 1);
  assert.equal(StatsStore.getGames(s), 4);
  assert.equal(StatsStore.getGames(s), s.wins + s.losses + s.draws);
});

// ---------- STAT-02 幂等 ----------

test('同一对局 ID 重复上报不重复计数', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ id: 'r1', mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  StatsStore.record({ id: 'r1', mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  const s = StatsStore.get();
  assert.equal(s.wins, 1);
  assert.equal(s.history.length, 1);
});

// ---------- STAT-04 连胜 ----------

test('连胜：连续 win 累加 currentStreak', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ id: 'r1', mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  StatsStore.record({ id: 'r2', mode: 'pvp', result: 'win', color: 'white', turns: 15 });
  const s = StatsStore.get();
  assert.equal(s.currentStreak, 2);
  assert.equal(s.longestStreak, 2);
});

test('连胜中断：loss 重置 currentStreak 为 0', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ id: 'r1', mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  StatsStore.record({ id: 'r2', mode: 'pvp', result: 'win', color: 'white', turns: 15 });
  StatsStore.record({ id: 'r3', mode: 'pvp', result: 'loss', color: 'black', turns: 20 });
  const s = StatsStore.get();
  assert.equal(s.currentStreak, 0);
  assert.equal(s.longestStreak, 2); // 最高连胜保留
});

test('连胜中断：draw 重置 currentStreak 为 0', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ id: 'r1', mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  StatsStore.record({ id: 'r2', mode: 'ai', result: 'draw', color: 'white', turns: 100 });
  const s = StatsStore.get();
  assert.equal(s.currentStreak, 0);
  assert.equal(s.longestStreak, 1);
});

// ---------- STAT-05 history 环形 20 ----------

test('history 最多 20 条，FIFO 淘汰最旧', () => {
  const { StatsStore } = reloadModules();
  for (let i = 0; i < 25; i++) {
    StatsStore.record({ id: 'r' + i, mode: 'pvp', result: 'win', color: 'black', turns: i });
  }
  const s = StatsStore.get();
  assert.equal(s.history.length, 20);
  // 最新的在前，最旧的被淘汰
  assert.equal(s.history[0].id, 'r24');
  assert.equal(s.history[19].id, 'r5');
});

test('history 条目含完整字段', () => {
  const { StatsStore } = reloadModules();
  const before = Date.now();
  StatsStore.record({ id: 'r1', mode: 'ai', result: 'win', color: 'white', turns: 30 });
  const s = StatsStore.get();
  const h = s.history[0];
  assert.equal(h.id, 'r1');
  assert.equal(h.mode, 'ai');
  assert.equal(h.result, 'win');
  assert.equal(h.color, 'white');
  assert.equal(h.turns, 30);
  assert.ok(h.endedAt >= before);
});

// ---------- 非法输入 ----------

test('非法 result 不写入', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ id: 'r1', mode: 'pvp', result: 'cheat', color: 'black', turns: 10 });
  const s = StatsStore.get();
  assert.equal(s.wins, 0);
  assert.equal(s.history.length, 0);
});

test('缺少 id 不写入', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  const s = StatsStore.get();
  assert.equal(s.wins, 0);
});

test('非法 mode 不写入', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ id: 'r1', mode: 'online', result: 'win', color: 'black', turns: 10 });
  const s = StatsStore.get();
  assert.equal(s.wins, 0);
});

// ---------- STAT-06 reset ----------

test('reset 清空所有战绩', () => {
  const { StatsStore } = reloadModules();
  StatsStore.record({ id: 'r1', mode: 'pvp', result: 'win', color: 'black', turns: 10 });
  StatsStore.record({ id: 'r2', mode: 'pvp', result: 'loss', color: 'white', turns: 15 });
  const s = StatsStore.reset();
  assert.equal(s.wins, 0);
  assert.equal(s.losses, 0);
  assert.equal(s.draws, 0);
  assert.equal(s.currentStreak, 0);
  assert.equal(s.longestStreak, 0);
  assert.equal(s.history.length, 0);
});
