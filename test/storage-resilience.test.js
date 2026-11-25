// T1-9 数据层容错测试（NFR-09 / PROF-09）
// mock storage 覆盖：正常、配额满（QuotaExceededError）、禁用（SecurityError）、
// 无 localStorage、损坏 JSON、旧版本迁移（schemaVersion 0 → 1 + 备份）。
const test = require('node:test');
const assert = require('node:assert/strict');

const MODULES = [
  require.resolve('../client/store.js'),
  require.resolve('../client/profile-store.js'),
  require.resolve('../client/stats-store.js'),
  require.resolve('../client/settings-store.js'),
];

/** 重载模块并注入 mock localStorage（传 null 表示环境无 localStorage） */
function reload(storage) {
  if (storage) global.localStorage = storage;
  else delete global.localStorage;
  for (const p of MODULES) delete require.cache[p];
  return {
    Store: require('../client/store.js'),
    ProfileStore: require('../client/profile-store.js'),
    StatsStore: require('../client/stats-store.js'),
    SettingsStore: require('../client/settings-store.js'),
  };
}

function makeError(name) {
  const e = new Error(name);
  e.name = name;
  return e;
}

function makeStorage(opts = {}) {
  const data = Object.assign({}, opts.seed);
  return {
    _data: data,
    getItem(key) {
      if (opts.disabled) throw makeError('SecurityError');
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      if (opts.disabled) throw makeError('SecurityError');
      if (opts.quotaFull) throw makeError('QuotaExceededError');
      data[key] = String(value);
    },
    removeItem(key) {
      if (opts.disabled) throw makeError('SecurityError');
      delete data[key];
    },
    key(i) { return Object.keys(data)[i] || null; },
    get length() { return Object.keys(data).length; },
  };
}

const OLD_PROFILE = {
  schemaVersion: 0,
  playerId: 'gm_abcdef123456',
  nickname: '旧昵称',
  avatarId: 'bamboo',
  createdAt: 1700000000000,
};

// ---------- 正常 ----------

test('正常：写入可持久化，重载模块后数据仍在', () => {
  const storage = makeStorage();
  let { Store, ProfileStore } = reload(storage);
  assert.equal(Store.available(), true);
  const p = ProfileStore.update({ nickname: '正常玩家' });
  ({ ProfileStore } = reload(storage));
  assert.equal(ProfileStore.get().nickname, '正常玩家');
  assert.equal(ProfileStore.get().playerId, p.playerId);
});

// ---------- 配额满 ----------

test('配额满：探测失败并降级内存，档案更新仅本次有效', () => {
  const storage = makeStorage({ quotaFull: true });
  const { Store, ProfileStore } = reload(storage);
  assert.equal(Store.available(), false);
  const p = ProfileStore.update({ nickname: '临时昵称' });
  assert.equal(p.nickname, '临时昵称');
  assert.equal(ProfileStore.get().nickname, '临时昵称');
  assert.equal(storage._data['gomoku.profile.v1'], undefined);
});

test('配额满：战绩记账与设置更新不崩溃', () => {
  const storage = makeStorage({ quotaFull: true });
  const { StatsStore, SettingsStore } = reload(storage);
  const s = StatsStore.record({ id: 'g1', mode: 'ai', result: 'win', color: 'black', endedAt: 1 });
  assert.equal(s.wins, 1);
  assert.equal(SettingsStore.update({ aiDifficulty: 'hard' }).aiDifficulty, 'hard');
});

// ---------- 禁用 / 无 localStorage ----------

test('禁用：SecurityError 下读写不抛异常，自动建档可用', () => {
  const storage = makeStorage({ disabled: true });
  const { Store, ProfileStore, StatsStore, SettingsStore } = reload(storage);
  assert.equal(Store.available(), false);
  assert.equal(Store.get('gomoku.profile.v1', 'fallback'), 'fallback');
  const p = ProfileStore.get();
  assert.ok(/^gm_[0-9a-z]{12}$/.test(p.playerId));
  assert.equal(ProfileStore.update({ nickname: '隐私模式' }).nickname, '隐私模式');
  assert.doesNotThrow(() =>
    StatsStore.record({ id: 'g1', mode: 'pvp', result: 'loss', color: 'white', endedAt: 2 }));
  assert.equal(SettingsStore.update({ soundEnabled: false }).soundEnabled, false);
  assert.doesNotThrow(() => Store.clearAll());
});

test('无 localStorage 环境：内存模式完整可用', () => {
  const { Store, ProfileStore } = reload(null);
  assert.equal(Store.available(), false);
  const p = ProfileStore.get();
  assert.ok(p.nickname.startsWith('枫客-'));
  assert.equal(ProfileStore.update({ nickname: '内存玩家' }).nickname, '内存玩家');
});

// ---------- 损坏 JSON ----------

test('损坏 JSON：Store.get 回退 fallback，不抛异常', () => {
  const storage = makeStorage({ seed: { 'gomoku.profile.v1': '{' } });
  const { Store } = reload(storage);
  assert.equal(Store.get('gomoku.profile.v1', null), null);
});

test('损坏 JSON：档案/战绩/设置回退默认并修复落盘', () => {
  const storage = makeStorage({
    seed: {
      'gomoku.profile.v1': '{',
      'gomoku.stats.v1': 'not json',
      'gomoku.settings.v1': '[1,2',
    },
  });
  const { ProfileStore, StatsStore, SettingsStore } = reload(storage);
  const p = ProfileStore.get();
  assert.equal(p.schemaVersion, 1);
  assert.ok(p.nickname.startsWith('枫客-'));
  const s = StatsStore.get();
  assert.equal(s.wins + s.losses + s.draws, 0);
  assert.equal(SettingsStore.get().aiDifficulty, 'medium');
  assert.doesNotThrow(() => JSON.parse(storage._data['gomoku.profile.v1']));
});

// ---------- 旧版本迁移 ----------

test('旧版本迁移：保留 playerId/昵称/头像并生成 gomoku.backup.*', () => {
  const storage = makeStorage({ seed: { 'gomoku.profile.v1': JSON.stringify(OLD_PROFILE) } });
  const { ProfileStore } = reload(storage);
  const p = ProfileStore.get();
  assert.equal(p.schemaVersion, 1);
  assert.equal(p.playerId, 'gm_abcdef123456');
  assert.equal(p.nickname, '旧昵称');
  assert.equal(p.avatarId, 'bamboo');
  assert.equal(p.createdAt, OLD_PROFILE.createdAt);
  const backups = Object.keys(storage._data).filter((k) => k.startsWith('gomoku.backup.'));
  assert.equal(backups.length, 1);
  assert.deepEqual(JSON.parse(storage._data[backups[0]]), OLD_PROFILE);
});

test('旧版本迁移：非法 playerId/昵称/头像全部回退', () => {
  const bad = {
    schemaVersion: 0,
    playerId: 'hacked',
    nickname: '   ',
    avatarId: 'evil',
    avatarDataUrl: 'https://x/y.png',
  };
  const storage = makeStorage({ seed: { 'gomoku.profile.v1': JSON.stringify(bad) } });
  const { ProfileStore } = reload(storage);
  const p = ProfileStore.get();
  assert.ok(/^gm_[0-9a-z]{12}$/.test(p.playerId));
  assert.ok(p.nickname.startsWith('枫客-'));
  assert.equal(p.avatarDataUrl, null);
  assert.notEqual(p.avatarId, 'evil');
});

test('当前版本：不触发迁移，不产生备份键', () => {
  const current = Object.assign({}, OLD_PROFILE, {
    schemaVersion: 1, avatarDataUrl: null, updatedAt: 1,
  });
  const storage = makeStorage({ seed: { 'gomoku.profile.v1': JSON.stringify(current) } });
  const { ProfileStore } = reload(storage);
  ProfileStore.get();
  const backups = Object.keys(storage._data).filter((k) => k.startsWith('gomoku.backup.'));
  assert.equal(backups.length, 0);
  assert.equal(ProfileStore.get().playerId, current.playerId);
});
