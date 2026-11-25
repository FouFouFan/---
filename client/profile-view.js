// 个人主页视图（PROF-02/03/10/12，AUTH 登录占位）
// 依赖：window.Gomoku.ProfileStore / StatsStore
// 双环境：Node require（仅导出纯函数便于测试）+ 浏览器自动渲染
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.ProfileView = factory();
    if (root.Gomoku.ProfileView && typeof root.Gomoku.ProfileView.init === 'function') {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', root.Gomoku.ProfileView.init);
      } else {
        root.Gomoku.ProfileView.init();
      }
    }
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 胜负结果映射为文案
  var RESULT_TEXT = { win: '胜', loss: '负', draw: '和' };
  var MODE_TEXT = { pvp: '双人', ai: '人机' };
  var COLOR_TEXT = { black: '黑', white: '白' };
  // 8 款预设头像占位字形（T1-7 将替换为内联 SVG 资源）
  var AVATAR_LABELS = {
    maple: '枫', bamboo: '竹', plum: '梅', pine: '松',
    crane: '鹤', moon: '月', mountain: '山', stream: '水',
  };

  // 编辑态状态
  var editing = false;
  var draft = null;       // { nickname, avatarId }
  var dirtyGuard = null;  // beforeunload 未保存守卫
  /** Unicode 码点长度（emoji 记 1 个） */
  function cpLength(text) {
    return Array.from(String(text == null ? '' : text)).length;
  }
  /** 按码点截断到 max 个 */
  function cpTruncate(text, max) {
    var arr = Array.from(text);
    return arr.length > max ? arr.slice(0, max).join('') : text;
  }
  /** 预设头像占位字形，缺省回退昵称首字 */
  function avatarGlyph(profile) {
    return AVATAR_LABELS[profile.avatarId] ||
      (profile.nickname ? profile.nickname.charAt(0) : '客');
  }
  /** 计算胜率，games 为 0 时返回 '—' */
  function calcWinRate(wins, games) {
    if (games === 0) return '—';
    return Math.round((wins / games) * 100) + '%';
  }
  /** 格式化时间戳为 MM-DD HH:MM */
  function formatTime(ts) {
    if (typeof ts !== 'number') return '';
    var d = new Date(ts);
    var pad = function (n) { return n < 10 ? '0' + n : String(n); };
    return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  /** 将 history 条目渲染为 HTML 字符串（纯文本，无 XSS 风险） */
  function renderHistoryItem(item) {
    var resultClass = 'hist-result hist-' + item.result;
    return '<li class="hist-item">' +
      '<span class="' + resultClass + '">' + RESULT_TEXT[item.result] + '</span>' +
      '<span class="hist-mode">' + MODE_TEXT[item.mode] + '</span>' +
      '<span class="hist-color">' + COLOR_TEXT[item.color] + '</span>' +
      '<span class="hist-turns">' + item.turns + ' 手</span>' +
      '<span class="hist-time">' + formatTime(item.endedAt) + '</span>' +
      '</li>';
  }
  /** 档案卡头像 HTML */
  function buildAvatar(profile) {
    if (profile.avatarDataUrl) {
      return '<img class="pf-avatar-img" src="' + profile.avatarDataUrl + '" alt="头像">';
    }
    return '<span class="pf-avatar-ph">' + avatarGlyph(profile) + '</span>';
  }
  /** 展示态档案卡（含「编辑资料」入口） */
  function buildProfileCard(profile) {
    return '<div class="pf-card pf-profile">' +
      '<div class="pf-avatar">' + buildAvatar(profile) + '</div>' +
      '<div class="pf-info">' +
        '<div class="pf-nickname"></div>' +
        '<div class="pf-id-row">' +
          '<span class="pf-id-label">ID</span>' +
          '<span class="pf-id" id="pf-player-id">' +
            window.Gomoku.ProfileStore.formatPlayerId(profile.playerId) +
          '</span>' +
          '<button type="button" class="pf-copy-btn" id="pf-copy-id" title="复制 ID">复制</button>' +
        '</div>' +
      '</div>' +
      '<button type="button" class="pf-edit-btn" id="pf-edit-btn">编辑资料</button>' +
    '</div>';
  }
  /** 编辑态档案卡（PROF-04/05） */
  function buildEditCard() {
    var ids = window.Gomoku.ProfileStore.AVATAR_IDS;
    var options = ids.map(function (id) {
      var label = AVATAR_LABELS[id] || id;
      return '<button type="button" class="pf-avatar-option" data-avatar="' + id +
        '" title="' + label + '" aria-pressed="false">' + label + '</button>';
    }).join('');

    return '<div class="pf-card pf-profile pf-editing">' +
      '<h3 class="pf-card-title">编辑资料</h3>' +
      '<label class="pf-edit-label" for="pf-nick-input">昵称</label>' +
      '<div class="pf-nick-row">' +
        '<input id="pf-nick-input" class="pf-nick-input" type="text" autocomplete="off" ' +
          'placeholder="1–12 个字符" aria-describedby="pf-nick-counter">' +
        '<span class="pf-nick-counter" id="pf-nick-counter">0/12</span>' +
      '</div>' +
      '<p class="pf-edit-label">头像</p>' +
      '<div class="pf-avatar-grid" id="pf-avatar-grid">' + options + '</div>' +
      '<div class="pf-edit-actions">' +
        '<button type="button" class="pf-save-btn" id="pf-save-btn" disabled>保存</button>' +
        '<button type="button" class="pf-cancel-btn" id="pf-cancel-btn">取消</button>' +
      '</div>' +
    '</div>';
  }
  /** 战绩 / 最近对局 / 危险区 / 账号卡片 */
  function buildStatsCards(stats) {
    var games = stats.wins + stats.losses + stats.draws;
    var winRate = calcWinRate(stats.wins, games);
    var historyHtml = stats.history.length === 0
      ? '<li class="hist-empty">还没有对局记录</li>'
      : stats.history.map(renderHistoryItem).join('');

    return '<div class="pf-card pf-stats">' +
        '<h3 class="pf-card-title">战绩</h3>' +
        '<div class="pf-stat-grid">' +
          '<div class="pf-stat"><span class="pf-stat-num">' + stats.wins + '</span><span class="pf-stat-label">胜</span></div>' +
          '<div class="pf-stat"><span class="pf-stat-num">' + stats.losses + '</span><span class="pf-stat-label">负</span></div>' +
          '<div class="pf-stat"><span class="pf-stat-num">' + stats.draws + '</span><span class="pf-stat-label">和</span></div>' +
          '<div class="pf-stat"><span class="pf-stat-num">' + winRate + '</span><span class="pf-stat-label">胜率</span></div>' +
          '<div class="pf-stat"><span class="pf-stat-num">' + stats.currentStreak + '</span><span class="pf-stat-label">当前连胜</span></div>' +
          '<div class="pf-stat"><span class="pf-stat-num">' + stats.longestStreak + '</span><span class="pf-stat-label">最高连胜</span></div>' +
        '</div>' +
      '</div>' +

      '<div class="pf-card pf-history">' +
        '<h3 class="pf-card-title">最近对局</h3>' +
        '<ul class="pf-hist-list">' + historyHtml + '</ul>' +
      '</div>' +

      '<div class="pf-card pf-danger">' +
        '<h3 class="pf-card-title">危险区</h3>' +
        '<p class="pf-danger-text">清空本地档案将删除所有战绩与设置，并重新生成身份。此操作不可撤销。</p>' +
        '<button type="button" class="pf-danger-btn" id="pf-reset-btn">清空本地档案</button>' +
      '</div>' +

      '<div class="pf-card pf-auth">' +
        '<h3 class="pf-card-title">账号</h3>' +
        '<p class="pf-auth-text">当前为游客身份，战绩仅保存在本机。</p>' +
        '<button type="button" class="pf-auth-btn" disabled>登录（即将上线）</button>' +
      '</div>';
  }
  /** 渲染整个个人主页 */
  function render(rootEl, profile, stats) {
    if (!rootEl) return;
    rootEl.innerHTML = (editing ? buildEditCard() : buildProfileCard(profile)) + buildStatsCards(stats);
    // 昵称用 textContent 防 XSS
    var nicknameEl = rootEl.querySelector('.pf-nickname');
    if (nicknameEl) nicknameEl.textContent = profile.nickname;
    if (editing) bindEditEvents(rootEl, profile); else bindEvents(rootEl, profile);
  }
  /** 绑定展示态交互事件 */
  function bindEvents(rootEl, profile) {
    var copyBtn = rootEl.querySelector('#pf-copy-id');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyToClipboard(profile.playerId, copyBtn);
      });
    }

    var editBtn = rootEl.querySelector('#pf-edit-btn');
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        enterEdit(rootEl);
      });
    }

    var resetBtn = rootEl.querySelector('#pf-reset-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        handleReset(rootEl);
      });
    }
  }
  /** 复制 ID 到剪贴板，成功后 toast 提示（PROF-03） */
  function copyToClipboard(text, btn) {
    var done = function () {
      showToast('ID 已复制：' + text);
      if (btn) {
        var original = btn.textContent;
        btn.textContent = '已复制';
        btn.disabled = true;
        setTimeout(function () {
          btn.textContent = original;
          btn.disabled = false;
        }, 1500);
      }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(function () {
        fallbackCopy(text, done);
      });
    } else {
      fallbackCopy(text, done);
    }
  }
  function fallbackCopy(text, done) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {
      showToast('复制失败，请手动复制');
    }
    document.body.removeChild(ta);
  }
  /** 显示 toast 提示 */
  function showToast(message) {
    var existing = document.getElementById('pf-toast');
    if (existing) existing.remove();
    var toast = document.createElement('div');
    toast.id = 'pf-toast';
    toast.className = 'pf-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('pf-toast-show');
    }, 10);
    setTimeout(function () {
      toast.classList.remove('pf-toast-show');
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 2000);
  }
  /** 清空档案：二次确认后重置（PROF-10） */
  function handleReset(rootEl) {
    if (!window.confirm('确定要清空本地档案吗？所有战绩与设置将被删除，并重新生成身份。')) {
      return;
    }
    window.Gomoku.ProfileStore.reset();
    window.Gomoku.StatsStore.reset();
    var profile = window.Gomoku.ProfileStore.get();
    var stats = window.Gomoku.StatsStore.get();
    render(rootEl, profile, stats);
    showToast('已清空档案，新身份已生成');
  }
  // 页面互斥：个人主页显示时隐藏联机对战区域，避免主页被推到视口下方
  function syncExclusiveView(rootEl) {
    var sels = ['.hero', '#game-info', '#board-area', '.footer-caption'];
    for (var i = 0; i < sels.length; i++) {
      var el = document.querySelector(sels[i]);
      if (el) el.style.display = rootEl.hidden ? '' : 'none';
    }
  }
  // ---------- 编辑态（PROF-04/05） ----------
  /** 进入编辑态 */
  function enterEdit(rootEl) {
    var profile = window.Gomoku.ProfileStore.get();
    editing = true;
    draft = { nickname: profile.nickname, avatarId: profile.avatarId };
    render(rootEl, profile, window.Gomoku.StatsStore.get());
    var input = rootEl.querySelector('#pf-nick-input');
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
  /** 退出编辑态并重渲染 */
  function exitEdit(rootEl) {
    editing = false;
    draft = null;
    removeDirtyGuard();
    render(rootEl, window.Gomoku.ProfileStore.get(), window.Gomoku.StatsStore.get());
  }
  /** 编辑中有未保存修改时，刷新/关闭页面给出提示 */
  function addDirtyGuard(isDirty) {
    removeDirtyGuard();
    dirtyGuard = function (e) {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', dirtyGuard);
  }
  function removeDirtyGuard() {
    if (dirtyGuard) {
      window.removeEventListener('beforeunload', dirtyGuard);
      dirtyGuard = null;
    }
  }
  /** 绑定编辑态事件：字数限制、头像选中态、保存/取消 */
  function bindEditEvents(rootEl, profile) {
    var input = rootEl.querySelector('#pf-nick-input');
    var counter = rootEl.querySelector('#pf-nick-counter');
    var saveBtn = rootEl.querySelector('#pf-save-btn');
    var cancelBtn = rootEl.querySelector('#pf-cancel-btn');
    var grid = rootEl.querySelector('#pf-avatar-grid');
    if (!input || !counter || !saveBtn || !cancelBtn || !grid || !draft) return;

    input.value = draft.nickname;

    function isDirty() {
      return input.value.trim() !== profile.nickname || draft.avatarId !== profile.avatarId;
    }

    function sync() {
      var len = cpLength(input.value);
      counter.textContent = len + '/12';
      counter.classList.toggle('is-limit', len >= 12);
      saveBtn.disabled = !isDirty();
    }

    function markSelected() {
      var opts = grid.querySelectorAll('.pf-avatar-option');
      for (var i = 0; i < opts.length; i++) {
        var on = opts[i].getAttribute('data-avatar') === draft.avatarId;
        opts[i].classList.toggle('is-selected', on);
        opts[i].setAttribute('aria-pressed', on ? 'true' : 'false');
      }
    }

    input.addEventListener('input', function () {
      var limited = cpTruncate(input.value, 12);
      if (limited !== input.value) input.value = limited;
      draft.nickname = input.value;
      sync();
    });

    grid.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.pf-avatar-option') : null;
      if (!btn) return;
      draft.avatarId = btn.getAttribute('data-avatar');
      markSelected();
      sync();
    });

    saveBtn.addEventListener('click', function () {
      var patch = { nickname: draft.nickname, avatarId: draft.avatarId };
      editing = false;
      draft = null;
      removeDirtyGuard();
      window.Gomoku.ProfileStore.update(patch);
      render(rootEl, window.Gomoku.ProfileStore.get(), window.Gomoku.StatsStore.get());
      showToast('资料已保存');
    });

    cancelBtn.addEventListener('click', function () {
      if (isDirty() && !window.confirm('有未保存的修改，确定放弃吗？')) return;
      exitEdit(rootEl);
    });

    markSelected();
    sync();
    addDirtyGuard(isDirty);
  }
  /** 初始化：找到容器并渲染 */
  function init() {
    var rootEl = document.getElementById('profile-page');
    if (!rootEl) return;
    if (!window.Gomoku.ProfileStore || !window.Gomoku.StatsStore) return;

    var profile = window.Gomoku.ProfileStore.get();
    var stats = window.Gomoku.StatsStore.get();
    render(rootEl, profile, stats);
    // 订阅档案变更（多标签同步）
    window.Gomoku.ProfileStore.subscribe(function (p) {
      var s = window.Gomoku.StatsStore.get();
      render(rootEl, p, s);
    });
    // 监听 hidden 属性变化，保证个人主页与联机对战互斥显示
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function () { syncExclusiveView(rootEl); })
        .observe(rootEl, { attributes: true, attributeFilter: ['hidden'] });
    }
    syncExclusiveView(rootEl);
  }

  return {
    init: init,
    render: render,
    calcWinRate: calcWinRate,
    formatTime: formatTime,
    renderHistoryItem: renderHistoryItem,
    showToast: showToast,
  };
});
