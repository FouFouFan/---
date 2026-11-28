// 设置模块（SET-01/02）
// 依赖 Store（client/store.js）。双环境：Node require + 浏览器 window.Gomoku.SettingsStore。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var Store = require('./store.js');
    module.exports = factory(Store);
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.SettingsStore = factory(root.Gomoku.Store);
  }
})(typeof self !== 'undefined' ? self : this, function (Store) {
  'use strict';

  var SETTINGS_KEY = 'gomoku.settings.v1';
  var SERVER_URL_KEY = 'gomoku.serverUrl.v1';
  var DEFAULT_SERVER_PORT = 3000;
  var SCHEMA_VERSION = 1;

  var DEFAULTS = {
    soundEnabled: true,
    aiDifficulty: 'medium',
    preferredColor: 'auto',
  };

  var VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
  var VALID_COLORS = ['auto', 'black', 'white'];

  var listeners = [];
  var storageBound = false;

  function notify(settings) {
    listeners.slice().forEach(function (fn) {
      try {
        fn(settings);
      } catch (error) {
        if (typeof console !== 'undefined') console.error('[settings] listener failed:', error);
      }
    });
  }

  /** 跨标签页同步；只在浏览器环境注册一次 */
  function bindStorage() {
    if (storageBound || typeof window === 'undefined' || !window.addEventListener) return;
    storageBound = true;
    window.addEventListener('storage', function (event) {
      if (event.key === SETTINGS_KEY) notify(get());
    });
  }

  /** 订阅设置变化，返回取消订阅函数（T2-6：音效开关即时生效） */
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    bindStorage();
    return function () {
      listeners = listeners.filter(function (item) {
        return item !== fn;
      });
    };
  }

  function createDefaultSettings() {
    return {
      schemaVersion: SCHEMA_VERSION,
      soundEnabled: DEFAULTS.soundEnabled,
      aiDifficulty: DEFAULTS.aiDifficulty,
      preferredColor: DEFAULTS.preferredColor,
      updatedAt: Date.now(),
    };
  }

  /** 校验单个字段，非法则返回默认值 */
  function sanitizeField(field, value) {
    switch (field) {
      case 'soundEnabled':
        return typeof value === 'boolean' ? value : DEFAULTS.soundEnabled;
      case 'aiDifficulty':
        return VALID_DIFFICULTIES.indexOf(value) !== -1 ? value : DEFAULTS.aiDifficulty;
      case 'preferredColor':
        return VALID_COLORS.indexOf(value) !== -1 ? value : DEFAULTS.preferredColor;
      default:
        return undefined;
    }
  }

  /**
   * 获取设置；不存在则创建默认设置并落盘（SET-01）。
   * 读取到的非法字段会回退到默认值（SET-02）。
   */
  function get() {
    var settings = Store.get(SETTINGS_KEY, null);
    if (!settings || typeof settings !== 'object') {
      settings = createDefaultSettings();
      Store.set(SETTINGS_KEY, settings);
      return settings;
    }

    // 逐字段校验，非法值回退默认（SET-02）
    var soundEnabled = sanitizeField('soundEnabled', settings.soundEnabled);
    var aiDifficulty = sanitizeField('aiDifficulty', settings.aiDifficulty);
    var preferredColor = sanitizeField('preferredColor', settings.preferredColor);

    var normalized = {
      schemaVersion: SCHEMA_VERSION,
      soundEnabled: soundEnabled,
      aiDifficulty: aiDifficulty,
      preferredColor: preferredColor,
      updatedAt: typeof settings.updatedAt === 'number' ? settings.updatedAt : Date.now(),
    };

    // 若有非法字段被修正，回写
    if (
      normalized.soundEnabled !== settings.soundEnabled ||
      normalized.aiDifficulty !== settings.aiDifficulty ||
      normalized.preferredColor !== settings.preferredColor
    ) {
      Store.set(SETTINGS_KEY, normalized);
    }

    return normalized;
  }

  /**
   * 更新设置（SET-01/02）。校验非法值并回退默认。
   */
  function update(patch) {
    if (!patch || typeof patch !== 'object') return get();

    var current = get();
    var next = {
      schemaVersion: SCHEMA_VERSION,
      soundEnabled: current.soundEnabled,
      aiDifficulty: current.aiDifficulty,
      preferredColor: current.preferredColor,
      updatedAt: Date.now(),
    };

    if (Object.prototype.hasOwnProperty.call(patch, 'soundEnabled')) {
      next.soundEnabled = sanitizeField('soundEnabled', patch.soundEnabled);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'aiDifficulty')) {
      next.aiDifficulty = sanitizeField('aiDifficulty', patch.aiDifficulty);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'preferredColor')) {
      next.preferredColor = sanitizeField('preferredColor', patch.preferredColor);
    }

    Store.set(SETTINGS_KEY, next);
    notify(next);
    return next;
  }

  /**
   * 校验并规范化 WebSocket 服务地址（T4-8 / spec 6.5）。
   * 仅接受 ws:/wss:、必须含主机、不允许用户名密码；非法返回 null。
   */
  function normalizeServerUrl(value) {
    if (typeof value !== 'string') return null;
    var raw = value.trim();
    if (!raw) return null;

    var parsed;
    try {
      parsed = new URL(raw);
    } catch (error) {
      return null;
    }
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return null;
    if (!parsed.hostname) return null;
    if (parsed.username || parsed.password) return null;

    var path = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : '';
    return parsed.protocol + '//' + parsed.host + path;
  }

  /** 同主机默认地址；https 页面用 wss */
  function hostDefaultUrl(options) {
    if (options.hostname) {
      return (options.protocol === 'https:' ? 'wss:' : 'ws:') +
        '//' + options.hostname + ':' + DEFAULT_SERVER_PORT;
    }
    return 'ws://localhost:' + DEFAULT_SERVER_PORT;
  }

  function readQueryServer(search) {
    if (!search) return '';
    try {
      return new URLSearchParams(search).get('server') || '';
    } catch (error) {
      return '';
    }
  }

  /**
   * 解析服务地址，优先级：query > localStorage > 同主机 > localhost（spec 6.5）。
   * @param {{search?: string, hostname?: string, protocol?: string, stored?: string}} options
   * @returns {{url: string, source: string, notice: string|null}}
   */
  function resolveServerUrl(options) {
    var opts = options || {};
    var fallbackUrl = normalizeServerUrl(opts.stored) || hostDefaultUrl(opts);
    var queryRaw = readQueryServer(opts.search);

    if (queryRaw) {
      var fromQuery = normalizeServerUrl(queryRaw);
      if (fromQuery) return { url: fromQuery, source: 'query', notice: null };
      // 非法查询参数：拒绝并提示实际尝试地址，继续按后续优先级回退
      return {
        url: fallbackUrl,
        source: 'fallback',
        notice: '服务地址无效：' + queryRaw + '，已改用 ' + fallbackUrl,
      };
    }

    if (normalizeServerUrl(opts.stored)) {
      return { url: fallbackUrl, source: 'storage', notice: null };
    }
    if (opts.hostname) {
      return { url: fallbackUrl, source: 'host', notice: null };
    }
    return { url: fallbackUrl, source: 'localhost', notice: null };
  }

  /** 读取已保存的服务地址（normalize 后）；未设置或非法返回 null */
  function getServerUrl() {
    return normalizeServerUrl(Store.get(SERVER_URL_KEY, null));
  }

  /** 保存服务地址；非法值清除已有配置并返回 null */
  function setServerUrl(value) {
    var normalized = normalizeServerUrl(value);
    if (!normalized) {
      Store.remove(SERVER_URL_KEY);
      return null;
    }
    Store.set(SERVER_URL_KEY, normalized);
    return normalized;
  }

  return {
    SETTINGS_KEY: SETTINGS_KEY,
    SERVER_URL_KEY: SERVER_URL_KEY,
    DEFAULT_SERVER_PORT: DEFAULT_SERVER_PORT,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULTS: DEFAULTS,
    VALID_DIFFICULTIES: VALID_DIFFICULTIES,
    VALID_COLORS: VALID_COLORS,
    get: get,
    update: update,
    subscribe: subscribe,
    getServerUrl: getServerUrl,
    setServerUrl: setServerUrl,
    normalizeServerUrl: normalizeServerUrl,
    resolveServerUrl: resolveServerUrl,
    _sanitizeField: sanitizeField,
  };
});
