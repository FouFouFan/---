// 存储基础模块：统一 localStorage 访问入口（AUTH-01）
// 仅本模块可直接读写 localStorage；视图/对局代码必须通过 Store 接口。
// 支持双环境：Node require（测试）+ 浏览器 window.Gomoku（运行时）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.Store = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PREFIX = 'gomoku.';
  var memoryStore = {};
  var useMemory = false; // localStorage 不可用或写入失败后置 true

  /** 键必须以 gomoku. 为前缀，否则拒绝读写（spec 6.1） */
  function isGomokuKey(key) {
    return typeof key === 'string' && key.indexOf(PREFIX) === 0;
  }

  /**
   * 探测 localStorage 是否真正可写（隐私模式/配额满/被禁用时返回 false）。
   * 已降级到内存时直接返回 false。
   */
  function available() {
    if (useMemory) return false;
    if (typeof localStorage === 'undefined') return false;
    try {
      var testKey = PREFIX + '__probe__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 读取键值，自动 JSON.parse。
   * 键非 gomoku.* 或解析失败时返回 fallback。
   */
  function get(key, fallback) {
    if (!isGomokuKey(key)) return fallback;
    try {
      var raw;
      if (useMemory || typeof localStorage === 'undefined') {
        raw = memoryStore[key];
      } else {
        raw = localStorage.getItem(key);
      }
      if (raw === null || raw === undefined) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      // JSON 损坏或存储异常，回退默认值（spec 6.4 校验）
      return fallback;
    }
  }

  /**
   * 写入键值，自动 JSON.stringify。
   * 成功返回 true；失败（非 gomoku.* 键 / 序列化失败 / 配额满 / 安全错误）返回 false，不抛异常。
   * 写入异常时自动降级到内存存储（PROF-09）。
   */
  function set(key, value) {
    if (!isGomokuKey(key)) return false;
    var raw;
    try {
      raw = JSON.stringify(value);
    } catch (e) {
      return false;
    }
    if (!useMemory && typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(key, raw);
        return true;
      } catch (e) {
        // QuotaExceededError / SecurityError 等，降级到内存
        useMemory = true;
      }
    }
    // 内存写入
    try {
      memoryStore[key] = raw;
      return true;
    } catch (e) {
      return false;
    }
  }

  /** 删除键（非 gomoku.* 键忽略） */
  function remove(key) {
    if (!isGomokuKey(key)) return;
    try {
      if (useMemory || typeof localStorage === 'undefined') {
        delete memoryStore[key];
      } else {
        localStorage.removeItem(key);
      }
    } catch (e) {
      // 静默
    }
  }

  /**
   * 迁移前备份：把 key 当前值复制到 gomoku.backup.<timestamp>（spec 6.4 迁移）。
   * key 不存在时返回 false。
   */
  function backup(key) {
    if (!isGomokuKey(key)) return false;
    var value = get(key, null);
    if (value === null) return false;
    var backupKey = PREFIX + 'backup.' + Date.now();
    return set(backupKey, value);
  }

  /** 清理所有 gomoku.* 键（含备份），不清空其他站点数据 */
  function clearAll() {
    if (useMemory || typeof localStorage === 'undefined') {
      memoryStore = {};
      return;
    }
    try {
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(PREFIX) === 0) {
          keys.push(k);
        }
      }
      for (var j = 0; j < keys.length; j++) {
        localStorage.removeItem(keys[j]);
      }
    } catch (e) {
      // 静默
    }
  }

  /** 仅供测试重置内存状态 */
  function _resetForTest() {
    memoryStore = {};
    useMemory = false;
  }

  return {
    PREFIX: PREFIX,
    available: available,
    get: get,
    set: set,
    remove: remove,
    backup: backup,
    clearAll: clearAll,
    _resetForTest: _resetForTest,
  };
});
