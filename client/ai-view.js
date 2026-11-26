// 人机设置页（T3-5 / AI-01）：难度分段、执子选择、偏好记忆与规则说明。
// 只读写 SettingsStore，不建立 WebSocket；开始按钮写入启动参数并进入 #/game。
// 双环境：Node require（可测静态方法）+ 浏览器 window.Gomoku.AiView。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.AiView = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DIFFICULTIES = [
    { id: 'easy', name: '简单', desc: '单层贪心，适合入门，偶尔会漏防' },
    { id: 'medium', name: '普通', desc: '两层搜索，能堵活三与冲四' },
    { id: 'hard', name: '困难', desc: '四层 α-β，会主动制造威胁' },
  ];
  var COLORS = [
    { id: 'black', name: '执黑', desc: '先手' },
    { id: 'white', name: '执白', desc: '后手' },
    { id: 'auto', name: '随机', desc: '开局时随机分配' },
  ];
  var RULE_TEXT = '15×15 · 无禁手 · 黑先 · 不计时判负';

  /** 设置存储用 medium，AI 引擎用 normal；在此统一映射 */
  function toEngineDifficulty(value) {
    return value === 'medium' ? 'normal' : value;
  }

  function difficultyButtons(active) {
    return DIFFICULTIES.map(function (item) {
      var on = item.id === active;
      return (
        '<button type="button" class="segment' + (on ? ' is-active' : '') +
        '" data-difficulty="' + item.id + '" aria-pressed="' + on + '">' +
        '<span class="segment-name">' + item.name + '</span>' +
        '<span class="segment-desc">' + item.desc + '</span></button>'
      );
    }).join('');
  }

  function colorButtons(active) {
    return COLORS.map(function (item) {
      var on = item.id === active;
      return (
        '<button type="button" class="segment segment-color' + (on ? ' is-active' : '') +
        '" data-color="' + item.id + '" aria-pressed="' + on + '">' +
        '<span class="segment-name">' + item.name + '</span>' +
        '<span class="segment-desc">' + item.desc + '</span></button>'
      );
    }).join('');
  }

  /** 生成设置页 HTML（静态文案，无需转义用户输入） */
  function html(settings) {
    return (
      '<div class="ai-panel">' +
      '<h2 class="ai-title">人机对决</h2>' +
      '<p class="ai-subtitle">本地引擎 · 断网也能下</p>' +
      '<div class="ai-group"><h3 class="ai-label">难度</h3>' +
      '<div class="segment-group" id="ai-difficulty-group">' +
      difficultyButtons(settings.aiDifficulty) +
      '</div></div>' +
      '<div class="ai-group"><h3 class="ai-label">执子</h3>' +
      '<div class="segment-group segment-group-colors" id="ai-color-group">' +
      colorButtons(settings.preferredColor) +
      '</div></div>' +
      '<button type="button" class="ai-start" id="ai-start">开始对局</button>' +
      '<p class="ai-rules">' + RULE_TEXT + '</p>' +
      '</div>'
    );
  }

  /**
   * 挂载到 #ai-page。
   * @param {HTMLElement} rootEl 容器
   * @param {{navigate: Function}} ctx 路由上下文
   */
  function mount(rootEl, ctx) {
    var settings = window.Gomoku.SettingsStore.get();
    rootEl.innerHTML = html(settings);

    rootEl.querySelectorAll('[data-difficulty]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = window.Gomoku.SettingsStore.update({ aiDifficulty: btn.dataset.difficulty });
        rootEl.innerHTML = html(next);
        mount(rootEl, ctx); // 重新绑定，保持选中态
      });
    });

    rootEl.querySelectorAll('[data-color]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var next = window.Gomoku.SettingsStore.update({ preferredColor: btn.dataset.color });
        rootEl.innerHTML = html(next);
        mount(rootEl, ctx);
      });
    });

    rootEl.querySelector('#ai-start').addEventListener('click', function () {
      var current = window.Gomoku.SettingsStore.get();
      // 启动参数由 T3-6 的人机对局控制消费
      window.Gomoku.aiLaunch = {
        difficulty: toEngineDifficulty(current.aiDifficulty),
        preferredColor: current.preferredColor,
        autoStart: true,
      };
      ctx.navigate('game');
    });
  }

  return {
    DIFFICULTIES: DIFFICULTIES,
    COLORS: COLORS,
    RULE_TEXT: RULE_TEXT,
    toEngineDifficulty: toEngineDifficulty,
    html: html,
    mount: mount,
  };
});
