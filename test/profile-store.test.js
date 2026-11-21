// T1-2 档案模块测试
// 覆盖 PROF-01/04/07/08/10：自动建档、昵称校验、ID 生成、订阅、reset
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const STORE_PATH = '../client/store.js';
const PROFILE_PATH = '../client/profile-store.js';

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
  delete require.cache[require.resolve(PROFILE_PATH)];
  const Store = require(STORE_PATH);
  Store._resetForTest();
  const ProfileStore = require(PROFILE_PATH);
  return { Store, ProfileStore };
}

beforeEach(() => {
  global.localStorage = createMockStorage();
});

afterEach(() => {
  delete global.localStorage;
});

// ---------- PROF-01 自动建档 ----------

test('get() 在无档案时自动创建默认档案并落盘', () => {
  const { ProfileStore } = reloadModules();
  const profile = ProfileStore.get();

  assert.equal(profile.schemaVersion, 1);
  assert.match(profile.playerId, /^gm_[0-9a-z]{12}$/);
  assert.match(profile.nickname, /^枫客-/);
  assert.ok(ProfileStore.AVATAR_IDS.indexOf(profile.avatarId) !== -1);
  assert.equal(profile.avatarDataUrl, null);
  assert.equal(typeof profile.createdAt, 'number');
  assert.equal(typeof profile.updatedAt, 'number');

  // 已落盘
  assert.equal(localStorage.getItem('gomoku.profile.v1') !== null, true);
});

test('get() 重复调用返回同一档案（不重复创建）', () => {
  const { ProfileStore } = reloadModules();
  const p1 = ProfileStore.get();
  const p2 = ProfileStore.get();
  assert.equal(p1.playerId, p2.playerId);
  assert.equal(p1.nickname, p2.nickname);
});

// ---------- PROF-07 玩家 ID ----------

test('playerId 格式为 gm_ + 12 位小写 base36', () => {
  const { ProfileStore } = reloadModules();
  const id = ProfileStore._generatePlayerId();
  assert.match(id, /^gm_[0-9a-z]{12}$/);
});

test('formatPlayerId 展示为 GM-XXXX-XXXX', () => {
  const { ProfileStore } = reloadModules();
  assert.equal(ProfileStore.formatPlayerId('gm_abcdefgh1234'), 'GM-abcd-efgh');
});

test('update 不能修改 playerId', () => {
  const { ProfileStore } = reloadModules();
  const original = ProfileStore.get();
  const updated = ProfileStore.update({ playerId: 'gm_hacked000000' });
  assert.equal(updated.playerId, original.playerId);
});

// ---------- PROF-04 昵称校验 ----------

test('昵称正常保存', () => {
  const { ProfileStore } = reloadModules();
  ProfileStore.get();
  const updated = ProfileStore.update({ nickname: '竹影' });
  assert.equal(updated.nickname, '竹影');
});

test('昵称去首尾空白', () => {
  const { ProfileStore } = reloadModules();
  ProfileStore.get();
  const updated = ProfileStore.update({ nickname: '  竹影  ' });
  assert.equal(updated.nickname, '竹影');
});

test('昵称超过 12 码点被截断', () => {
  const { ProfileStore } = reloadModules();
  ProfileStore.get();
  const updated = ProfileStore.update({ nickname: '一二三四五六七八九十十一十二' });
  assert.equal(Array.from(updated.nickname).length, 12);
});

test('昵称空值回退默认昵称', () => {
  const { ProfileStore } = reloadModules();
  const original = ProfileStore.get();
  const updated = ProfileStore.update({ nickname: '   ' });
  assert.equal(updated.nickname, '枫客-' + original.playerId.slice(-4));
});

test('昵称过滤控制字符与零宽字符', () => {
  const { ProfileStore } = reloadModules();
  const sanitized = ProfileStore._sanitizeNickname('a\u0000b\u200Bc');
  assert.equal(sanitized, 'abc');
});

test('昵称 1 码点可保存，13 码点被截为 12', () => {
  const { ProfileStore } = reloadModules();
  const s1 = ProfileStore._sanitizeNickname('一');
  assert.equal(s1, '一');
  const s13 = ProfileStore._sanitizeNickname('一二三四五六七八九十十一十二十三');
  assert.equal(Array.from(s13).length, 12);
});

// ---------- 头像校验 ----------

test('update 非法 avatarId 保持原值', () => {
  const { ProfileStore } = reloadModules();
  const original = ProfileStore.get();
  const updated = ProfileStore.update({ avatarId: 'hacked' });
  assert.equal(updated.avatarId, original.avatarId);
});

test('update 合法 avatarId 生效', () => {
  const { ProfileStore } = reloadModules();
  ProfileStore.get();
  const updated = ProfileStore.update({ avatarId: 'crane' });
  assert.equal(updated.avatarId, 'crane');
});

// ---------- PROF-08 订阅 ----------

test('subscribe 在 update 时收到通知', () => {
  const { ProfileStore } = reloadModules();
  ProfileStore.get();
  let received = null;
  const unsub = ProfileStore.subscribe((p) => { received = p; });

  ProfileStore.update({ nickname: '测试' });
  assert.ok(received);
  assert.equal(received.nickname, '测试');
  unsub();
});

test('subscribe 取消后不再收到通知', () => {
  const { ProfileStore } = reloadModules();
  ProfileStore.get();
  let count = 0;
  const unsub = ProfileStore.subscribe(() => { count++; });
  unsub();
  ProfileStore.update({ nickname: 'a' });
  assert.equal(count, 0);
});

// ---------- PROF-10 reset ----------

test('reset 清空档案并生成新身份', () => {
  const { ProfileStore } = reloadModules();
  const original = ProfileStore.get();
  const reset = ProfileStore.reset();

  assert.notEqual(reset.playerId, original.playerId);
  assert.notEqual(reset.nickname, original.nickname);
  assert.match(reset.playerId, /^gm_[0-9a-z]{12}$/);
  assert.equal(reset.schemaVersion, 1);
});

test('reset 后旧档案不再可读', () => {
  const { ProfileStore, Store } = reloadModules();
  const original = ProfileStore.get();
  ProfileStore.reset();
  const current = ProfileStore.get();
  assert.notEqual(current.playerId, original.playerId);
});

// ---------- schemaVersion ----------

test('默认档案 schemaVersion 为 1', () => {
  const { ProfileStore } = reloadModules();
  const profile = ProfileStore.get();
  assert.equal(profile.schemaVersion, 1);
});
