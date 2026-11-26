// 人机对局控制（T3-6 / AI-06/07/08）：本地引擎、思考锁、300–700ms 反馈、胜负/和棋、用时显示。
// 不建立 WebSocket；棋盘绘制复用 board-view.js，AI 计算复用 ai.js。
// 双环境：Node require（纯函数可测）+ 浏览器 window.Gomoku.AiGame。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ai.js'));
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.AiGame = factory(root.Gomoku.AI);
  }
})(typeof self !== 'undefined' ? self : this, function (AI) {
  'use strict';

  var THINK_MIN = 300;
  var THINK_MAX = 700;

  /** 解析执子偏好；auto 时用随机数分配（AI-01/09） */
  function resolveHumanColor(preferred, rng) {
    if (preferred === 'black' || preferred === 'white') return preferred;
    return (rng || Math.random)() < 0.5 ? 'black' : 'white';
  }

  /** AI 思考反馈时长：300–700ms（AI-06） */
  function thinkDelay(rng) {
    return Math.floor(THINK_MIN + (rng || Math.random)() * (THINK_MAX - THINK_MIN + 1));
  }

  /** 毫秒 → m:ss（本局/回合用时，不判负） */
  function formatClock(ms) {
    var total = Math.max(0, Math.floor(ms / 1000));
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  /**
   * 创建人机对局控制器。
   * deps: { boardView, elements, random?, playSound?, unlockAudio? }
   * elements: { gameInfo, turnLabel, countdown, roundTime, matchOverlay,
   *             resultOverlay, resultTitle, resultMessage, resultButton }
   */
  function create(deps) {
    var boardView = deps.boardView;
    var els = deps.elements;
    var random = deps.random || Math.random;
    var playSound = deps.playSound || function () {};
    var unlockAudio = deps.unlockAudio || function () {};

    var state = null;
    var tickTimer = null;
    var thinkTimer = null;

    function stopTimers() {
      if (tickTimer) clearInterval(tickTimer);
      if (thinkTimer) clearTimeout(thinkTimer);
      tickTimer = null;
      thinkTimer = null;
    }

    /** 刷新本局/回合用时（AI-08：只显示，不判负） */
    function renderClock() {
      if (!state) return;
      var now = Date.now();
      els.countdown.textContent = formatClock(now - state.startedAt);
      els.countdown.dataset.state = 'normal';
      els.countdown.title = '本局用时';
      els.roundTime.hidden = false;
      els.roundTime.textContent = '回合 ' + formatClock(now - state.turnStartedAt);
    }

    function updateTurn() {
      if (!state) return;
      if (state.finished) els.turnLabel.textContent = '对局已结束';
      else if (state.thinking) els.turnLabel.textContent = 'AI 思考中…';
      else if (state.turn === state.humanColor) els.turnLabel.textContent = '轮到你落子';
      else els.turnLabel.textContent = '等待 AI 落子';
      els.gameInfo.dataset.turn = state.finished ? '' : state.turn;
      els.gameInfo.hidden = false;

      // AI-06：AI 回合与思考期间锁定输入；仅人类回合可落子与悬停
      var humanTurn = !state.finished && !state.thinking && state.turn === state.humanColor;
      boardView.setInteractive(humanTurn);
      boardView.setHoverEnabled(humanTurn);
      boardView.setHoverColor(state.humanColor);
    }

    /** 终局：五连判胜、满盘判和（AI-07） */
    function finish(winner, reason) {
      state.finished = true;
      state.thinking = false;
      stopTimers();
      updateTurn();
      renderClock();

      var title;
      var message;
      if (reason === 'draw') {
        title = '和棋';
        message = '棋盘已满，双方未分胜负';
      } else if (winner === state.humanColor) {
        title = '你赢了';
        message = '你率先连成五子，赢下本局';
      } else {
        title = '你输了';
        message = 'AI 率先连成五子，你落败';
      }
      els.resultTitle.textContent = title;
      els.resultTitle.dataset.state = reason === 'draw' ? 'draw' : winner === state.humanColor ? 'win' : 'lose';
      els.resultMessage.textContent = message + ' · 本局用时 ' + formatClock(Date.now() - state.startedAt);
      els.resultOverlay.hidden = false;
    }

    /** 检查终局；未结束则交换回合 */
    function afterMove(row, col, color) {
      boardView.setLastMove({ row: row, col: col });
      boardView.animateMove(row, col, color);
      playSound(color);
      boardView.render();

      if (AI.hasFive(state.board, row, col, color)) {
        finish(color, 'win');
        return;
      }
      if (AI.boardIsFull(state.board)) {
        finish(null, 'draw');
        return;
      }

      state.turn = AI.opposite(color);
      state.turnStartedAt = Date.now();
      updateTurn();
      renderClock();
      if (state.turn === state.aiColor) scheduleAi();
    }

    /** AI 回合：先展示 300–700ms 思考反馈，再同步计算并落子 */
    function scheduleAi() {
      if (!state || state.finished) return;
      state.thinking = true;
      updateTurn();

      thinkTimer = setTimeout(function () {
        thinkTimer = null;
        if (!state || state.finished || state.turn !== state.aiColor) return;

        var move = AI.chooseMove(state.board, {
          color: state.aiColor,
          difficulty: state.difficulty,
          seed: Date.now(),
        });
        state.thinking = false;
        if (!move) {
          finish(null, 'draw'); // 无合法落点等同于满盘和棋
          return;
        }
        state.board[move.row][move.col] = state.aiColor;
        afterMove(move.row, move.col, state.aiColor);
      }, thinkDelay(random));
    }

    /** 人类落子回调（由 board-view 上报空位坐标） */
    function onHumanMove(cell) {
      if (!state || state.finished || state.thinking || state.turn !== state.humanColor) return;
      if (!AI.isLegalMove(state.board, cell.row, cell.col)) return;
      unlockAudio();
      state.board[cell.row][cell.col] = state.humanColor;
      afterMove(cell.row, cell.col, state.humanColor);
    }

    /** 开始新对局：保留难度与执子偏好（随机则重新随机） */
    function start(config) {
      stopTimers();
      var humanColor = resolveHumanColor(config.preferredColor, random);
      state = {
        board: AI.createBoard(),
        humanColor: humanColor,
        aiColor: AI.opposite(humanColor),
        turn: 'black',
        difficulty: config.difficulty || 'normal',
        startedAt: Date.now(),
        turnStartedAt: Date.now(),
        thinking: false,
        finished: false,
      };

      boardView.setBoard(state.board);
      boardView.reset();
      boardView.onMove(onHumanMove);
      els.matchOverlay.hidden = true;
      els.resultOverlay.hidden = true;
      els.gameInfo.hidden = false;
      updateTurn();
      renderClock();
      tickTimer = setInterval(renderClock, 500);

      // 人类执白时 AI 执黑先行
      if (state.turn === state.aiColor) scheduleAi();
      return state;
    }

    els.resultButton.addEventListener('click', function () {
      els.resultOverlay.hidden = true; // 再来一局与战绩由 T3-7 接入
    });

    return {
      /** 路由挂载：读取启动参数并开始；卸载时停止所有定时器 */
      mount: function (ctx) {
        var launch = window.Gomoku.aiLaunch;
        var settings = window.Gomoku.SettingsStore.get();
        var config = launch || {
          difficulty: window.Gomoku.AiView.toEngineDifficulty(settings.aiDifficulty),
          preferredColor: settings.preferredColor,
        };
        window.Gomoku.aiLaunch = null;
        start(config);
        if (ctx && ctx.onCleanup) ctx.onCleanup(stopTimers);
      },
      start: start,
      stop: stopTimers,
      getState: function () {
        return state;
      },
    };
  }

  return {
    THINK_MIN: THINK_MIN,
    THINK_MAX: THINK_MAX,
    resolveHumanColor: resolveHumanColor,
    thinkDelay: thinkDelay,
    formatClock: formatClock,
    create: create,
  };
});
