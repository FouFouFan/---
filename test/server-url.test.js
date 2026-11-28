// T4-8 WS 地址解析（AUTH-05 / PVP-07 / spec 6.5）：
// 优先级 query > localStorage > 同主机 > localhost；非法地址拒绝并提示实际尝试地址。
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

test('normalizeServerUrl：仅接受 ws/wss 且含主机、无凭据', () => {
  const { SettingsStore } = reloadModules();
  const normalize = SettingsStore.normalizeServerUrl;

  assert.equal(normalize('ws://192.168.1.5:3000'), 'ws://192.168.1.5:3000');
  assert.equal(normalize('  wss://example.com:443/ws  '), 'wss://example.com/ws');
  assert.equal(normalize('ws://localhost:3000/'), 'ws://localhost:3000');

  for (const bad of [
    'http://localhost:3000',
    'https://example.com',
    'ftp://x',
    'javascript:alert(1)',
    'ws://user:pass@localhost:3000',
    'ws://',
    '',
    '   ',
    null,
    42,
    {},
  ]) {
    assert.equal(normalize(bad), null, String(bad));
  }
});

test('优先级：query 覆盖 localStorage', () => {
  const { SettingsStore } = reloadModules();
  const result = SettingsStore.resolveServerUrl({
    search: '?server=' + encodeURIComponent('ws://10.0.0.9:4000'),
    hostname: 'localhost',
    protocol: 'http:',
    stored: 'ws://192.168.1.5:3000',
  });
  assert.deepEqual(result, { url: 'ws://10.0.0.9:4000', source: 'query', notice: null });
});

test('无 query 时使用 localStorage 地址', () => {
  const { SettingsStore } = reloadModules();
  const result = SettingsStore.resolveServerUrl({
    search: '',
    hostname: 'localhost',
    protocol: 'http:',
    stored: 'ws://192.168.1.5:3000',
  });
  assert.equal(result.url, 'ws://192.168.1.5:3000');
  assert.equal(result.source, 'storage');
});

test('非法 query 被拒绝，回退并提示实际尝试地址（PVP-07）', () => {
  const { SettingsStore } = reloadModules();
  const result = SettingsStore.resolveServerUrl({
    search: '?server=' + encodeURIComponent('http://evil.example.com'),
    hostname: '10.21.180.254',
    protocol: 'http:',
    stored: null,
  });
  assert.equal(result.url, 'ws://10.21.180.254:3000');
  assert.equal(result.source, 'fallback');
  assert.match(result.notice, /服务地址无效：http:\/\/evil\.example\.com/);
  assert.match(result.notice, /ws:\/\/10\.21\.180\.254:3000/);
});

test('同主机默认：http → ws:3000，https → wss:3000', () => {
  const { SettingsStore } = reloadModules();
  const httpResult = SettingsStore.resolveServerUrl({
    search: '', hostname: '192.168.1.10', protocol: 'http:', stored: null,
  });
  assert.deepEqual(httpResult, { url: 'ws://192.168.1.10:3000', source: 'host', notice: null });

  const httpsResult = SettingsStore.resolveServerUrl({
    search: '', hostname: 'game.example.com', protocol: 'https:', stored: null,
  });
  assert.equal(httpsResult.url, 'wss://game.example.com:3000');
});

test('无主机名时兜底 ws://localhost:3000', () => {
  const { SettingsStore } = reloadModules();
  const result = SettingsStore.resolveServerUrl({ search: '', hostname: '', protocol: 'file:' });
  assert.deepEqual(result, { url: 'ws://localhost:3000', source: 'localhost', notice: null });
});

test('getServerUrl/setServerUrl：规范化持久化，非法值清除', () => {
  const { SettingsStore } = reloadModules();

  assert.equal(SettingsStore.getServerUrl(), null);
  assert.equal(SettingsStore.SERVER_URL_KEY, 'gomoku.serverUrl.v1');

  assert.equal(SettingsStore.setServerUrl(' ws://192.168.1.5:3000/ '), 'ws://192.168.1.5:3000');
  assert.equal(SettingsStore.getServerUrl(), 'ws://192.168.1.5:3000');

  assert.equal(SettingsStore.setServerUrl('http://bad.example.com'), null);
  assert.equal(SettingsStore.getServerUrl(), null);
});

test('已保存的非法地址不会用于连接（按同主机回退）', () => {
  const { Store, SettingsStore } = reloadModules();
  Store.set(SettingsStore.SERVER_URL_KEY, 'http://bad.example.com');

  const result = SettingsStore.resolveServerUrl({
    search: '',
    hostname: 'localhost',
    protocol: 'http:',
    stored: SettingsStore.getServerUrl(),
  });
  assert.equal(result.url, 'ws://localhost:3000');
  assert.equal(result.source, 'host');
});
