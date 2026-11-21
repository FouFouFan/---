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

  /** 渲染整个个人主页 */
  function render(rootEl, profile, stats) {
    if (!rootEl) return;

    var games = stats.wins + stats.losses + stats.draws;
    var winRate = calcWinRate(stats.wins, games);

    // 头像：若有 avatarDataUrl 用图片，否则用预设首字占位
    var avatarHtml;
    if (profile.avatarDataUrl) {
      avatarHtml = '<img class="pf-avatar-img" src="' + profile.avatarDataUrl + '" alt="头像">';
    } else {
      // 用昵称首字作为占位（PROF-12 细则：预设头像为内联资源，此处先占位，T1-7 替换）
      avatarHtml = '<span class="pf-avatar-ph">' + (profile.nickname ? profile.nickname.charAt(0) : '客') + '</span>';
    }

    var formattedId = window.Gomoku.ProfileStore.formatPlayerId(profile.playerId);

    // 最近对局列表
    var historyHtml;
    if (stats.history.length === 0) {
      historyHtml = '<li class="hist-empty">还没有对局记录</li>';
    } else {
      historyHtml = stats.history.map(renderHistoryItem).join('');
    }

    rootEl.innerHTML =
      '<div class="pf-card pf-profile">' +
        '<div class="pf-avatar">' + avatarHtml + '</div>' +
        '<div class="pf-info">' +
          '<div class="pf-nickname"></div>' +
          '<div class="pf-id-row">' +
            '<span class="pf-id-label">ID</span>' +
            '<span class="pf-id" id="pf-player-id">' + formattedId + '</span>' +
            '<button type="button" class="pf-copy-btn" id="pf-copy-id" title="复制 ID">复制</button>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="pf-card pf-stats">' +
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

    // 昵称用 textContent 防 XSS
    var nicknameEl = rootEl.querySelector('.pf-nickname');
    if (nicknameEl) nicknameEl.textContent = profile.nickname;

    bindEvents(rootEl, profile);
  }

  /** 绑定交互事件 */
  function bindEvents(rootEl, profile) {
    var copyBtn = rootEl.querySelector('#pf-copy-id');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        copyToClipboard(profile.playerId, copyBtn);
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
