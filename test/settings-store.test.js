// T1-4 设置模块测试
// 覆盖 SET-01/02：默认值、持久化、非法值回退
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const STORE_PATH = '../client/store.js';
const SETTINGS_PATH = '../client/settings-store.js';

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
  delete require.cache[require.resolve(SETTINGS_PATH)];
  const Store = require(STORE_PATH);
  Store._resetForTest();
  const SettingsStore = require(SETTINGS_PATH);
  return { Store, SettingsStore };
}

beforeEach(() => {
  global.localStorage = createMockStorage();
});

afterEach(() => {
  delete global.localStorage;
});

// ---------- 默认值 ----------

test('get() 无设置时返回默认值', () => {
  const { SettingsStore } = reloadModules();
  const s = SettingsStore.get();
  assert.equal(s.schemaVersion, 1);
  assert.equal(s.soundEnabled, true);
  assert.equal(s.aiDifficulty, 'medium');
  assert.equal(s.preferredColor, 'auto');
});

// ---------- SET-01 持久化 ----------

test('update 后持久化，再次 get 返回更新值', () => {
  const { SettingsStore } = reloadModules();
  SettingsStore.update({ soundEnabled: false, aiDifficulty: 'hard', preferredColor: 'black' });
  const s = SettingsStore.get();
  assert.equal(s.soundEnabled, false);
  assert.equal(s.aiDifficulty, 'hard');
  assert.equal(s.preferredColor, 'black');
});

test('部分 update 只更新指定字段', () => {
  const { SettingsStore } = reloadModules();
  SettingsStore.update({ soundEnabled: false });
  const s = SettingsStore.get();
  assert.equal(s.soundEnabled, false);
  assert.equal(s.aiDifficulty, 'medium'); // 保持默认
  assert.equal(s.preferredColor, 'auto');
});

// ---------- SET-02 非法值回退 ----------

test('update 非法 aiDifficulty 回退默认', () => {
  const { SettingsStore } = reloadModules();
  const s = SettingsStore.update({ aiDifficulty: 'extreme' });
  assert.equal(s.aiDifficulty, 'medium');
});

test('update 非法 preferredColor 回退默认', () => {
  const { SettingsStore } = reloadModules();
  const s = SettingsStore.update({ preferredColor: 'red' });
  assert.equal(s.preferredColor, 'auto');
});

test('update 非法 soundEnabled 回退默认', () => {
  const { SettingsStore } = reloadModules();
  const s = SettingsStore.update({ soundEnabled: 'yes' });
  assert.equal(s.soundEnabled, true);
});

test('get 时读取到非法值自动回退并回写', () => {
  const { SettingsStore, Store } = reloadModules();
  // 手动写入非法值
  Store.set(SettingsStore.SETTINGS_KEY, {
    schemaVersion: 1,
    soundEnabled: 'invalid',
    aiDifficulty: 'nightmare',
    preferredColor: 'purple',
    updatedAt: 0,
  });
  const s = SettingsStore.get();
  assert.equal(s.soundEnabled, true);
  assert.equal(s.aiDifficulty, 'medium');
  assert.equal(s.preferredColor, 'auto');
});

// ---------- 合法值 ----------

test('合法 aiDifficulty 三档均可保存', () => {
  const { SettingsStore } = reloadModules();
  for (const d of ['easy', 'medium', 'hard']) {
    SettingsStore.update({ aiDifficulty: d });
    assert.equal(SettingsStore.get().aiDifficulty, d);
  }
});

test('合法 preferredColor 三档均可保存', () => {
  const { SettingsStore } = reloadModules();
  for (const c of ['auto', 'black', 'white']) {
    SettingsStore.update({ preferredColor: c });
    assert.equal(SettingsStore.get().preferredColor, c);
  }
});

// ---------- 边界 ----------

test('update 空 patch 返回当前设置', () => {
  const { SettingsStore } = reloadModules();
  const original = SettingsStore.get();
  const s = SettingsStore.update({});
  assert.equal(s.soundEnabled, original.soundEnabled);
  assert.equal(s.aiDifficulty, original.aiDifficulty);
});

test('update 非对象返回当前设置', () => {
  const { SettingsStore } = reloadModules();
  const s = SettingsStore.update(null);
  assert.equal(s.aiDifficulty, 'medium');
});
