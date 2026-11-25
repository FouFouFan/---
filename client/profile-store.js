// 档案模块（PROF-01/04/07/08/10）
// 依赖 Store（client/store.js）。双环境：Node require + 浏览器 window.Gomoku。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var Store = require('./store.js');
    module.exports = factory(Store);
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.ProfileStore = factory(root.Gomoku.Store);
  }
})(typeof self !== 'undefined' ? self : this, function (Store) {
  'use strict';

  var PROFILE_KEY = 'gomoku.profile.v1';
  var SCHEMA_VERSION = 1;
  var ID_PREFIX = 'gm_';
  var ID_LENGTH = 12;
  var NICKNAME_MAX = 12;

  // 8 款预设头像（spec 4.1 细则）
  var AVATAR_IDS = [
    'maple', 'bamboo', 'plum', 'pine',
    'crane', 'moon', 'mountain', 'stream',
  ];

  var BASE36 = '0123456789abcdefghijklmnopqrstuvwxyz';

  var subscribers = [];

  // ---------- ID 生成 ----------

  /** 生成 gm_ + 12 位小写 base36 的玩家 ID（PROF-07） */
  function generatePlayerId() {
    var id = ID_PREFIX;
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var arr = new Uint8Array(ID_LENGTH);
      crypto.getRandomValues(arr);
      for (var i = 0; i < ID_LENGTH; i++) {
        id += BASE36[arr[i] % 36];
      }
    } else {
      // 退化：Math.random（无安全用途，仅作唯一标识）
      for (var j = 0; j < ID_LENGTH; j++) {
        id += BASE36[Math.floor(Math.random() * 36)];
      }
    }
    return id;
  }

  /** 展示格式 GM-XXXX-XXXX（PROF-07） */
  function formatPlayerId(playerId) {
    var body = playerId.slice(ID_PREFIX.length);
    return 'GM-' + body.slice(0, 4) + '-' + body.slice(4, 8);
  }

  // ---------- 昵称校验 ----------

  /**
   * 昵称校验（PROF-04）：去首尾空白 → 过滤控制/零宽字符 → 1–12 码点。
   * 空值/全过滤后为空返回 null（调用方回退默认昵称）。
   */
  function sanitizeNickname(nickname) {
    if (typeof nickname !== 'string') return null;
    var trimmed = nickname.trim();
    // 过滤控制字符（C0/C1）与零宽字符
    var filtered = trimmed.replace(
      /[\u0000-\u001F\u007F-\u009F\u200B\u200C\u200D\uFEFF\u180E\u2060]/g,
      ''
    );
    var codePoints = Array.from(filtered);
    if (codePoints.length === 0) return null;
    if (codePoints.length > NICKNAME_MAX) {
      filtered = codePoints.slice(0, NICKNAME_MAX).join('');
    }
    return filtered;
  }

  // ---------- 默认值 ----------

  /** 默认昵称：枫客-XXXX，XXXX 取 ID 末 4 位 */
  function defaultNickname(playerId) {
    return '枫客-' + playerId.slice(-4);
  }

  /** 从预设头像中随机选一个 */
  function randomAvatarId() {
    return AVATAR_IDS[Math.floor(Math.random() * AVATAR_IDS.length)];
  }

  function createDefaultProfile() {
    var now = Date.now();
    var playerId = generatePlayerId();
    return {
      schemaVersion: SCHEMA_VERSION,
      playerId: playerId,
      nickname: defaultNickname(playerId),
      avatarId: randomAvatarId(),
      avatarDataUrl: null,
      createdAt: now,
      updatedAt: now,
    };
  }

  // ---------- 订阅 ----------

  function notifySubscribers(profile) {
    for (var i = 0; i < subscribers.length; i++) {
      try {
        subscribers[i](profile);
      } catch (e) {
        // 订阅者异常不影响其他
      }
    }
  }

  /**
   * 订阅档案变更（PROF-08）。本地写入与跨标签页 storage 事件均会触发。
   * 返回取消订阅函数。
   */
  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    subscribers.push(fn);

    var storageHandler = null;
    if (typeof window !== 'undefined' && window.addEventListener) {
      storageHandler = function (e) {
        if (e.key === PROFILE_KEY) {
          var profile = get();
          notifySubscribers(profile);
        }
      };
      window.addEventListener('storage', storageHandler);
    }

    return function unsubscribe() {
      var idx = subscribers.indexOf(fn);
      if (idx !== -1) subscribers.splice(idx, 1);
      if (storageHandler && typeof window !== 'undefined' && window.removeEventListener) {
        window.removeEventListener('storage', storageHandler);
      }
    };
  }

  // ---------- 核心接口 ----------

  /**
   * 获取档案；不存在则创建默认档案并落盘（PROF-01）。
   */
  function get() {
    var profile = Store.get(PROFILE_KEY, null);
    if (!profile || typeof profile !== 'object') {
      profile = createDefaultProfile();
      Store.set(PROFILE_KEY, profile);
      notifySubscribers(profile);
    }
    return profile;
  }

  /**
   * 更新档案（PROF-04/05）。校验昵称/头像，playerId 不可修改。
   * 返回更新后的档案。
   */
  function update(patch) {
    if (!patch || typeof patch !== 'object') return get();

    var current = get();
    var next = {};
    for (var k in current) {
      if (Object.prototype.hasOwnProperty.call(current, k)) {
        next[k] = current[k];
      }
    }
    for (var p in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, p)) {
        next[p] = patch[p];
      }
    }

    next.updatedAt = Date.now();
    // playerId 生成后不可修改（PROF-07）
    next.playerId = current.playerId;

    // 昵称校验
    if (Object.prototype.hasOwnProperty.call(patch, 'nickname')) {
      var sanitized = sanitizeNickname(patch.nickname);
      next.nickname = sanitized !== null ? sanitized : defaultNickname(current.playerId);
    }

    // 头像白名单
    if (Object.prototype.hasOwnProperty.call(patch, 'avatarId')) {
      next.avatarId = AVATAR_IDS.indexOf(patch.avatarId) !== -1
        ? patch.avatarId
        : current.avatarId;
    }

    // 自定义头像（PROF-06）：仅接受 data:image/jpeg;base64, 前缀且 ≤32KB；null 表示清除
    if (Object.prototype.hasOwnProperty.call(patch, 'avatarDataUrl')) {
      var url = patch.avatarDataUrl;
      if (url === null) {
        next.avatarDataUrl = null;
      } else if (typeof url === 'string' &&
        url.indexOf('data:image/jpeg;base64,') === 0 && url.length <= 32768) {
        next.avatarDataUrl = url;
      } else {
        next.avatarDataUrl = current.avatarDataUrl;
      }
    }

    Store.set(PROFILE_KEY, next);
    notifySubscribers(next);
    return next;
  }

  /**
   * 清空档案并重建新身份（PROF-10）。
   * 注意：此处只清档案键；若需清全部 gomoku.* 数据，视图层应先调用 Store.clearAll()。
   */
  function reset() {
    Store.remove(PROFILE_KEY);
    var profile = createDefaultProfile();
    Store.set(PROFILE_KEY, profile);
    notifySubscribers(profile);
    return profile;
  }

  return {
    PROFILE_KEY: PROFILE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    AVATAR_IDS: AVATAR_IDS,
    get: get,
    update: update,
    reset: reset,
    subscribe: subscribe,
    formatPlayerId: formatPlayerId,
    // 暴露给测试
    _sanitizeNickname: sanitizeNickname,
    _generatePlayerId: generatePlayerId,
    _defaultNickname: defaultNickname,
  };
});
