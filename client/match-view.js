// 匹配视图（T4-7 / PVP-01/02/07）：连接中、排队中（等待时长）、取消中、已找到、失败重试。
// 只负责 #match-overlay 的呈现与按钮回调；连接、匹配消息与路由由 app.js 处理。
// 双环境：Node require（纯函数可测）+ 浏览器 window.Gomoku.MatchView。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.MatchView = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** 等待超过 60 秒给软提示，但不自动取消（spec 5.5） */
  var WAIT_SOFT_LIMIT_MS = 60 * 1000;
  /** 「已找到对手」停留时长 */
  var FOUND_HIDE_MS = 400;

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  /** 等待时长 mm:ss */
  function formatElapsed(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  /** 等待提示：60 秒后切换文案，仍继续排队 */
  function waitHint(elapsedMs) {
    return elapsedMs >= WAIT_SOFT_LIMIT_MS
      ? '暂时没有对手，可稍后再试'
      : '两个终端同时匹配即可开局';
  }

  function panel(title, hint, body, actions) {
    return (
      '<div class="match-panel">' +
      '<h2 class="match-title">' + title + '</h2>' +
      '<p id="match-hint" class="match-hint" role="status" aria-live="polite">' + hint + '</p>' +
      body +
      '<div class="match-actions">' + actions + '</div>' +
      '</div>'
    );
  }

  /**
   * @param {{root: HTMLElement, onStart?: Function, onCancel?: Function,
   *          onRetry?: Function, onHome?: Function}} options
   */
  function create(options) {
    var root = options.root;
    var callbacks = {
      start: options.onStart || function () {},
      cancel: options.onCancel || function () {},
      retry: options.onRetry || function () {},
      home: options.onHome || function () {},
    };

    var state = 'idle';
    var startedAt = 0;
    var tickTimer = null;
    var hideTimer = null;

    function clearTimers() {
      if (tickTimer) clearInterval(tickTimer);
      if (hideTimer) clearTimeout(hideTimer);
      tickTimer = null;
      hideTimer = null;
    }

    function bind() {
      var actions = [['cancel', callbacks.cancel], ['start', callbacks.start],
        ['retry', callbacks.retry], ['home', callbacks.home]];
      for (var i = 0; i < actions.length; i++) {
        var el = root.querySelector('[data-action="' + actions[i][0] + '"]');
        if (el) el.addEventListener('click', actions[i][1]);
      }
    }

    function render(html, nextState) {
      state = nextState;
      root.innerHTML = html;
      root.dataset.state = state;
      root.hidden = false;
      bind();
    }

    function tick() {
      var elapsed = Date.now() - startedAt;
      var value = root.querySelector('#match-elapsed');
      if (value) value.textContent = formatElapsed(elapsed);
      var hint = root.querySelector('#match-hint');
      if (hint) hint.textContent = waitHint(elapsed);
    }

    function hide() {
      clearTimers();
      state = 'idle';
      root.hidden = true;
      root.dataset.state = 'idle';
      root.innerHTML = '<div class="match-panel"><p class="match-hint">正在连接服务器…</p></div>';
    }

    return {
      /** 连接中：取消即回首页 */
      showConnecting: function () {
        clearTimers();
        render(
          panel('联机对战', '正在连接服务器…', '',
            '<button id="match-button" class="match-button" type="button" data-action="cancel">取消</button>'),
          'connecting'
        );
      },

      /** 已连接未排队：开始匹配 */
      showReady: function () {
        clearTimers();
        render(
          panel('联机对战', '点击下方按钮开始匹配对手', '',
            '<button id="match-button" class="match-button" type="button" data-action="start">开始匹配</button>'),
          'ready'
        );
      },

      /**
       * 排队中：显示已等待时长；每 500ms 刷新，60 秒后切换提示但继续排队。
       * @param {number} [at] 入队时间戳，重复收到 match_waiting 时保持原起点
       */
      showWaiting: function (at) {
        clearTimers();
        // 已在排队时保留原起点（重复 match_waiting 不重置）；新一轮匹配从 0 开始
        var keepStart = state === 'waiting' && startedAt;
        startedAt = at || (keepStart ? startedAt : Date.now());
        var elapsed = Date.now() - startedAt;
        render(
          panel(
            '正在寻找对手',
            waitHint(elapsed),
            '<p class="match-elapsed">已等待 <span id="match-elapsed" class="match-elapsed-value">' +
              formatElapsed(elapsed) + '</span></p>',
            '<button id="match-button" class="match-button" type="button" data-action="cancel">取消匹配</button>'
          ),
          'waiting'
        );
        tickTimer = setInterval(tick, 500);
      },

      /** 取消中：按钮禁用，等待服务端 match_cancelled */
      showCancelling: function () {
        clearTimers();
        render(
          panel('正在寻找对手', '正在取消…', '',
            '<button id="match-button" class="match-button" type="button" disabled>正在取消…</button>'),
          'cancelling'
        );
      },

      /** 匹配成功：短暂提示后自动隐藏，让出棋盘 */
      showFound: function () {
        clearTimers();
        render(panel('已找到对手', '正在进入对局…', '', ''), 'found');
        hideTimer = setTimeout(hide, FOUND_HIDE_MS);
      },

      /** 失败/断开：显示原因与重试、返回首页 */
      showFailed: function (message) {
        clearTimers();
        render(
          panel(
            '联机对战',
            escapeHtml(message),
            '',
            '<button id="match-button" class="match-button" type="button" data-action="retry">重试连接</button>' +
              '<button class="match-secondary" type="button" data-action="home">返回首页</button>'
          ),
          'failed'
        );
      },

      hide: hide,

      getState: function () {
        return state;
      },
    };
  }

  return {
    WAIT_SOFT_LIMIT_MS: WAIT_SOFT_LIMIT_MS,
    FOUND_HIDE_MS: FOUND_HIDE_MS,
    formatElapsed: formatElapsed,
    waitHint: waitHint,
    escapeHtml: escapeHtml,
    create: create,
  };
});
