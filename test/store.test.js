// T1-1 存储基础模块测试
// 覆盖：可用性探测、命名空间、内存降级、迁移备份、损坏数据回退、clearAll
const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const STORE_PATH = '../client/store.js';

/** 创建一个可用的 mock localStorage */
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

/** 创建一个 setItem 抛错的 mock（模拟配额满 / 隐私模式） */
function createFailingStorage() {
  const base = createMockStorage();
  return {
    ...base,
    setItem: () => {
      const err = new Error('QuotaExceededError');
      err.name = 'QuotaExceededError';
      throw err;
    },
  };
}

function reloadStore() {
  delete require.cache[require.resolve(STORE_PATH)];
  return require(STORE_PATH);
}

beforeEach(() => {
  global.localStorage = createMockStorage();
});

afterEach(() => {
  delete global.localStorage;
});

// ---------- 可用性探测 ----------

test('available() 在 localStorage 可用时返回 true', () => {
  const Store = reloadStore();
  assert.equal(Store.available(), true);
});

test('available() 在 localStorage 不可用时返回 false', () => {
  global.localStorage = createFailingStorage();
  const Store = reloadStore();
  assert.equal(Store.available(), false);
});

test('available() 在无 localStorage 环境返回 false', () => {
  delete global.localStorage;
  const Store = reloadStore();
  assert.equal(Store.available(), false);
});

// ---------- 命名空间 ----------

test('set/get 只接受 gomoku.* 前缀的键', () => {
  const Store = reloadStore();
  assert.equal(Store.set('other.key', { a: 1 }), false);
  assert.equal(Store.get('other.key', 'fb'), 'fb');

  assert.equal(Store.set('gomoku.test.v1', { a: 1 }), true);
  assert.deepEqual(Store.get('gomoku.test.v1'), { a: 1 });
});

test('remove 非 gomoku.* 键无效', () => {
  const Store = reloadStore();
  Store.set('gomoku.test.v1', 1);
  Store.remove('other.key'); // 不应影响
  assert.equal(Store.get('gomoku.test.v1'), 1);
  Store.remove('gomoku.test.v1');
  assert.equal(Store.get('gomoku.test.v1', null), null);
});

// ---------- 基本读写 ----------

test('set 后 get 返回相同值（对象/数组/字符串/数字）', () => {
  const Store = reloadStore();
  Store.set('gomoku.obj.v1', { name: 'test', n: 42 });
  Store.set('gomoku.arr.v1', [1, 2, 3]);
  Store.set('gomoku.str.v1', 'hello');
  Store.set('gomoku.num.v1', 99);

  assert.deepEqual(Store.get('gomoku.obj.v1'), { name: 'test', n: 42 });
  assert.deepEqual(Store.get('gomoku.arr.v1'), [1, 2, 3]);
  assert.equal(Store.get('gomoku.str.v1'), 'hello');
  assert.equal(Store.get('gomoku.num.v1'), 99);
});

test('get 不存在的键返回 fallback', () => {
  const Store = reloadStore();
  assert.equal(Store.get('gomoku.nope.v1', 'default'), 'default');
  assert.equal(Store.get('gomoku.nope.v1', null), null);
});

test('损坏 JSON 回退 fallback（不抛异常）', () => {
  const Store = reloadStore();
  localStorage.setItem('gomoku.broken.v1', '{not valid json');
  assert.equal(Store.get('gomoku.broken.v1', 'fb'), 'fb');
});

// ---------- 内存降级 ----------

test('setItem 抛错时自动降级到内存，后续 get 仍可读到值', () => {
  global.localStorage = createFailingStorage();
  const Store = reloadStore();
  assert.equal(Store.available(), false);

  assert.equal(Store.set('gomoku.mem.v1', { x: 1 }), true);
  assert.deepEqual(Store.get('gomoku.mem.v1'), { x: 1 });
});

test('降级到内存后 remove 正常工作', () => {
  global.localStorage = createFailingStorage();
  const Store = reloadStore();
  Store.set('gomoku.mem.v1', 1);
  Store.remove('gomoku.mem.v1');
  assert.equal(Store.get('gomoku.mem.v1', null), null);
});

// ---------- 迁移备份 ----------

test('backup 将原值复制到 gomoku.backup.<ts>', () => {
  const Store = reloadStore();
  Store.set('gomoku.profile.v1', { name: 'old', v: 1 });

  const ok = Store.backup('gomoku.profile.v1');
  assert.equal(ok, true);

  // 找到 backup 键
  let backupKey = null;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith('gomoku.backup.')) {
      backupKey = k;
      break;
    }
  }
  assert.ok(backupKey, '应存在 gomoku.backup.* 键');
  assert.deepEqual(Store.get(backupKey), { name: 'old', v: 1 });
});

test('backup 不存在的键返回 false', () => {
  const Store = reloadStore();
  assert.equal(Store.backup('gomoku.nope.v1'), false);
});

// ---------- clearAll ----------

test('clearAll 只删除 gomoku.* 键，保留其他站点数据', () => {
  const Store = reloadStore();
  Store.set('gomoku.a.v1', 1);
  Store.set('gomoku.b.v1', 2);
  localStorage.setItem('other.app', 'keep');

  Store.clearAll();

  assert.equal(Store.get('gomoku.a.v1', null), null);
  assert.equal(Store.get('gomoku.b.v1', null), null);
  assert.equal(localStorage.getItem('other.app'), 'keep');
});

// ---------- 不抛异常保证 ----------

test('所有操作在异常环境下不抛异常', () => {
  const Store = reloadStore();
  assert.doesNotThrow(() => Store.set(null, 1));
  assert.doesNotThrow(() => Store.set(123, 1));
  assert.doesNotThrow(() => Store.get(null));
  assert.doesNotThrow(() => Store.remove(null));
  assert.doesNotThrow(() => Store.backup(null));
  assert.doesNotThrow(() => Store.clearAll());
});
