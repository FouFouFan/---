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
  var SCHEMA_VERSION = 1;

  var DEFAULTS = {
    soundEnabled: true,
    aiDifficulty: 'medium',
    preferredColor: 'auto',
  };

  var VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];
  var VALID_COLORS = ['auto', 'black', 'white'];

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
    return next;
  }

  return {
    SETTINGS_KEY: SETTINGS_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    DEFAULTS: DEFAULTS,
    VALID_DIFFICULTIES: VALID_DIFFICULTIES,
    VALID_COLORS: VALID_COLORS,
    get: get,
    update: update,
    _sanitizeField: sanitizeField,
  };
});
