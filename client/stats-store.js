// 战绩模块（STAT-01~06）
// 依赖 Store（client/store.js）。双环境：Node require + 浏览器 window.Gomoku.StatsStore。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var Store = require('./store.js');
    module.exports = factory(Store);
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.StatsStore = factory(root.Gomoku.Store);
  }
})(typeof self !== 'undefined' ? self : this, function (Store) {
  'use strict';

  var STATS_KEY = 'gomoku.stats.v1';
  var SCHEMA_VERSION = 1;
  var HISTORY_LIMIT = 20;
  var VALID_RESULTS = ['win', 'loss', 'draw'];
  var VALID_MODES = ['pvp', 'ai'];
  var VALID_COLORS = ['black', 'white'];

  function createDefaultStats() {
    return {
      schemaVersion: SCHEMA_VERSION,
      wins: 0,
      losses: 0,
      draws: 0,
      currentStreak: 0,
      longestStreak: 0,
      history: [],
    };
  }

  /** games 恒等于 wins + losses + draws */
  function getGames(stats) {
    return stats.wins + stats.losses + stats.draws;
  }

  function get() {
    var stats = Store.get(STATS_KEY, null);
    if (!stats || typeof stats !== 'object') {
      stats = createDefaultStats();
      Store.set(STATS_KEY, stats);
    }
    // 防御性补全
    stats.wins = stats.wins || 0;
    stats.losses = stats.losses || 0;
    stats.draws = stats.draws || 0;
    stats.currentStreak = stats.currentStreak || 0;
    stats.longestStreak = stats.longestStreak || 0;
    if (!Array.isArray(stats.history)) stats.history = [];
    return stats;
  }

  /**
   * 记录一局结果（STAT-02 幂等 / STAT-03 统计 / STAT-04 连胜 / STAT-05 history）。
   * result: { id, mode, color, turns, reason? }
   * - id: 对局唯一标识（服务端 roomId），用于幂等去重
   * - mode: 'pvp' | 'ai'
   * - color: 'black' | 'white'
   * - turns: 回合数
   * - result 内部由 'win'|'loss'|'draw' 决定（通过 reason 推断？不，直接传 result 字段更清晰）
   *
   * 实际接口：result 参数含 { id, mode, result, color, turns, reason? }
   */
  function record(result) {
    if (!result || typeof result !== 'object') return get();

    var id = result.id;
    var mode = result.mode;
    var outcome = result.result;
    var color = result.color;
    var turns = result.turns;

    // 校验必要字段
    if (typeof id !== 'string' || id.length === 0) return get();
    if (VALID_MODES.indexOf(mode) === -1) return get();
    if (VALID_RESULTS.indexOf(outcome) === -1) return get();
    if (VALID_COLORS.indexOf(color) === -1) return get();
    if (typeof turns !== 'number' || turns < 0) turns = 0;

    var stats = get();

    // 幂等：同一对局 ID 已记录则不重复计数（STAT-02）
    for (var i = 0; i < stats.history.length; i++) {
      if (stats.history[i].id === id) {
        return stats;
      }
    }

    // 更新计数（STAT-03）
    if (outcome === 'win') {
      stats.wins += 1;
      stats.currentStreak += 1;
      if (stats.currentStreak > stats.longestStreak) {
        stats.longestStreak = stats.currentStreak;
      }
    } else if (outcome === 'loss') {
      stats.losses += 1;
      stats.currentStreak = 0;
    } else {
      // draw：和棋中断连胜（spec 4.1 细则）
      stats.draws += 1;
      stats.currentStreak = 0;
    }

    // history 环形 20 条（STAT-05）
    stats.history.unshift({
      id: id,
      mode: mode,
      result: outcome,
      color: color,
      turns: turns,
      endedAt: Date.now(),
    });
    if (stats.history.length > HISTORY_LIMIT) {
      stats.history = stats.history.slice(0, HISTORY_LIMIT);
    }

    Store.set(STATS_KEY, stats);
    return stats;
  }

  /** 清空战绩（STAT-06） */
  function reset() {
    var stats = createDefaultStats();
    Store.set(STATS_KEY, stats);
    return stats;
  }

  return {
    STATS_KEY: STATS_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    HISTORY_LIMIT: HISTORY_LIMIT,
    get: get,
    record: record,
    reset: reset,
    getGames: getGames,
  };
});
