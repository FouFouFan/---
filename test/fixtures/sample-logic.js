// 示例纯逻辑模块 —— 演示「浏览器 <script> + Node require」双环境模式
// 真实模块（store / profile-store / stats-store / ai 等）将在 M1/M3 按此模式实现。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // Node 环境：供 node:test 直接 require
    module.exports = factory();
  } else {
    // 浏览器环境：挂载到全局命名空间 window.Gomoku.SampleLogic
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.SampleLogic = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 一个最小的纯函数示例：棋盘坐标合法性校验
  function isValidCell(row, col) {
    return Number.isInteger(row) && Number.isInteger(col)
      && row >= 0 && row < 15 && col >= 0 && col < 15;
  }

  return {
    isValidCell: isValidCell
  };
});
