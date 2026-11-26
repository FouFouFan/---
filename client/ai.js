// AI 基础层（T3-1）：棋盘工具、四方向模式评分与候选点生成。
// 全部为纯函数：不读写 DOM、不建立网络连接，输入棋盘不会被修改。
// 双环境：Node require（单元测试）+ 浏览器 window.Gomoku.AI。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Gomoku = root.Gomoku || {};
    root.Gomoku.AI = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SIZE = 15;
  var MAX_CANDIDATES = 60;
  var NEIGHBOR_RADIUS = 2; // 候选点：与任一棋子切比雪夫距离 ≤2

  // 模式分值：五连 ≫ 活四 > 冲四 > 活三 > 眠三 > 活二 > 眠二
  var SCORES = {
    five: 1000000,
    openFour: 100000,
    four: 10000,
    openThree: 1000,
    three: 100,
    openTwo: 50,
    two: 10,
    one: 1,
  };

  // 按优先级匹配；X=己方、O=对手、.=空、#=盘外
  var LINE_RULES = [
    [/XXXXX/, 'five'],
    [/\.XXXX\./, 'openFour'],
    [/XXXX\.|\.XXXX|XXX\.X|XX\.XX|X\.XXX/, 'four'],
    [/\.XXX\./, 'openThree'],
    [/\.XX\.X\.|\.X\.XX\./, 'openThree'],
    [/XXX|XX\.X|X\.XX/, 'three'],
    [/\.XX\./, 'openTwo'],
    [/XX|X\.X/, 'two'],
    [/X/, 'one'],
  ];

  /** 创建空棋盘 */
  function createBoard(size) {
    var n = size || SIZE;
    var board = [];
    for (var row = 0; row < n; row++) board.push(new Array(n).fill(null));
    return board;
  }

  /** 复制棋盘（深拷贝行数组，棋子为字符串/null 无需再拷贝） */
  function cloneBoard(board) {
    return board.map(function (line) {
      return line.slice();
    });
  }

  /** 坐标是否在盘内 */
  function inBounds(board, row, col) {
    return row >= 0 && row < board.length && col >= 0 && col < board[0].length;
  }

  /** 落点是否合法：盘内且为空位 */
  function isLegalMove(board, row, col) {
    return inBounds(board, row, col) && board[row][col] === null;
  }

  /** 全部合法落点 */
  function getLegalMoves(board) {
    var moves = [];
    for (var row = 0; row < board.length; row++) {
      for (var col = 0; col < board[row].length; col++) {
        if (board[row][col] === null) moves.push({ row: row, col: col });
      }
    }
    return moves;
  }

  /** 棋盘是否已下满 */
  function boardIsFull(board) {
    for (var row = 0; row < board.length; row++) {
      for (var col = 0; col < board[row].length; col++) {
        if (board[row][col] === null) return false;
      }
    }
    return true;
  }

  function opposite(color) {
    return color === 'black' ? 'white' : 'black';
  }

  var DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];

  /** 统计 (row,col) 处某颜色在指定方向的连续棋子数（含自身） */
  function countLine(board, row, col, dr, dc, color) {
    var total = 1;
    var r = row + dr;
    var c = col + dc;
    while (inBounds(board, r, c) && board[r][c] === color) {
      total++;
      r += dr;
      c += dc;
    }
    r = row - dr;
    c = col - dc;
    while (inBounds(board, r, c) && board[r][c] === color) {
      total++;
      r -= dr;
      c -= dc;
    }
    return total;
  }

  /** 假设 (row,col) 落子后是否形成五连（含长连） */
  function hasFive(board, row, col, color) {
    for (var i = 0; i < DIRECTIONS.length; i++) {
      var dir = DIRECTIONS[i];
      if (countLine(board, row, col, dir[0], dir[1], color) >= 5) return true;
    }
    return false;
  }

  /**
   * 以 (row,col) 为中心构造 9 格线型字符串。
   * 中心固定视为己方棋子，用于评估「假设落在这里」的价值。
   */
  function lineString(board, row, col, dr, dc, color) {
    var line = '';
    for (var step = -4; step <= 4; step++) {
      if (step === 0) {
        line += 'X';
        continue;
      }
      var r = row + dr * step;
      var c = col + dc * step;
      if (!inBounds(board, r, c)) line += '#';
      else if (board[r][c] === color) line += 'X';
      else if (board[r][c] === null) line += '.';
      else line += 'O';
    }
    return line;
  }

  /** 对单条 9 格线型按优先级取最高模式分 */
  function scoreLine(line) {
    for (var i = 0; i < LINE_RULES.length; i++) {
      if (LINE_RULES[i][0].test(line)) return SCORES[LINE_RULES[i][1]];
    }
    return 0;
  }

  /**
   * 四方向模式评分：以 (row,col) 为空位为前提，评估该点为 color 的价值。
   * 只读棋盘，不假设棋子已写入。
   */
  function evaluatePoint(board, row, col, color) {
    if (!isLegalMove(board, row, col)) return -Infinity;

    var total = 0;
    for (var i = 0; i < DIRECTIONS.length; i++) {
      var dir = DIRECTIONS[i];
      total += scoreLine(lineString(board, row, col, dir[0], dir[1], color));
    }
    return total;
  }

  /** 该点是否在任一已有棋子的切比雪夫距离 radius 内 */
  function nearStone(board, row, col, radius) {
    var r0 = Math.max(0, row - radius);
    var r1 = Math.min(board.length - 1, row + radius);
    var c0 = Math.max(0, col - radius);
    var c1 = Math.min(board[0].length - 1, col + radius);
    for (var r = r0; r <= r1; r++) {
      for (var c = c0; c <= c1; c++) {
        if (board[r][c] !== null) return true;
      }
    }
    return false;
  }

  /**
   * 生成候选点：已有棋子周围 2 格内的空位，按「进攻 + 防守」启发式降序。
   * 空盘返回天元；结果上限 60，排序稳定（同分按 row、col 升序）。
   */
  function generateCandidates(board, color, options) {
    var opts = options || {};
    var radius = typeof opts.radius === 'number' ? opts.radius : NEIGHBOR_RADIUS;
    var limit = typeof opts.limit === 'number' ? opts.limit : MAX_CANDIDATES;
    var center = Math.floor(board.length / 2);
    var hasStone = false;

    for (var row = 0; row < board.length; row++) {
      for (var col = 0; col < board[row].length; col++) {
        if (board[row][col] !== null) hasStone = true;
      }
    }

    if (!hasStone) {
      return [{ row: center, col: center, score: 0 }];
    }

    var foe = opposite(color);
    var candidates = [];
    for (var r = 0; r < board.length; r++) {
      for (var c = 0; c < board[r].length; c++) {
        if (board[r][c] !== null) continue;
        if (!nearStone(board, r, c, radius)) continue;
        var attack = evaluatePoint(board, r, c, color);
        var defend = evaluatePoint(board, r, c, foe);
        candidates.push({ row: r, col: c, score: attack + defend * 0.9 });
      }
    }

    candidates.sort(function (a, b) {
      if (b.score !== a.score) return b.score - a.score;
      if (a.row !== b.row) return a.row - b.row;
      return a.col - b.col;
    });

    return candidates.slice(0, limit);
  }

  // ---------- 搜索与难度（T3-2） ----------

  var DEFAULT_TIME_LIMIT = 800; // 困难档单步上限（毫秒）
  var WIN_SCORE = 10000000;
  var TIMEOUT = { timeout: true };
  /** mulberry32：轻量可复现随机数，同一种子得到同一序列（AI-11） */
  function createRng(seed) {
    var state = (Number(seed) >>> 0) || 0x9e3779b9;
    return function () {
      state += 0x6d2b79f5;
      var t = Math.imul(state ^ (state >>> 15), 1 | state);
      t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 找一步成五的落点；无则返回 null（AI-04） */
  function findWinningMove(board, color) {
    var moves = generateCandidates(board, color, { limit: MAX_CANDIDATES });
    for (var i = 0; i < moves.length; i++) {
      var move = moves[i];
      board[move.row][move.col] = color;
      var win = hasFive(board, move.row, move.col, color);
      board[move.row][move.col] = null;
      if (win) return { row: move.row, col: move.col };
    }
    return null;
  }
  /** 按剩余层数限制分支，控制 4 层搜索规模 */
  function candidateLimit(depth) {
    return depth >= 4 ? 12 : depth === 3 ? 8 : depth === 2 ? 5 : 4;
  }

  /** 叶子评估：己方最佳威胁减去对手最佳威胁（略偏防守） */
  function evaluateBoard(board, color) {
    var mine = generateCandidates(board, color, { limit: 6 })[0];
    var foe = generateCandidates(board, opposite(color), { limit: 6 })[0];
    return (mine ? mine.score : 0) - (foe ? foe.score : 0) * 1.1;
  }
  /** 负极大值 + α-β 剪枝；超出时限抛出 TIMEOUT 由根节点回退 */
  function negamax(board, color, depth, alpha, beta, aiColor, deadline) {
    if (Date.now() > deadline) throw TIMEOUT;
    if (depth === 0) return evaluateBoard(board, aiColor);

    var moves = generateCandidates(board, color, { limit: candidateLimit(depth) });
    if (!moves.length) return 0;
    var best = -Infinity;
    for (var i = 0; i < moves.length; i++) {
      var move = moves[i];
      var score;
      board[move.row][move.col] = color;
      try {
        if (hasFive(board, move.row, move.col, color)) {
          score = color === aiColor ? WIN_SCORE - (10 - depth) : -(WIN_SCORE - (10 - depth));
        } else {
          score = -negamax(board, opposite(color), depth - 1, -beta, -alpha, aiColor, deadline);
        }
      } finally {
        board[move.row][move.col] = null; // 超时抛出时也要撤销，保证棋盘不被污染
      }
      if (score > best) best = score;
      if (best > alpha) alpha = best;
      if (alpha >= beta) break;
    }
    return best;
  }

  /** 根节点搜索；超时或被中断时返回 null，由调用方回退到上一层结果 */
  function searchRoot(board, color, depth, deadline) {
    var moves = generateCandidates(board, color, { limit: candidateLimit(depth) });
    if (!moves.length) return null;
    var bestMove = null, bestScore = -Infinity, alpha = -Infinity;
    try {
      for (var i = 0; i < moves.length; i++) {
        if (Date.now() > deadline) throw TIMEOUT;
        var move = moves[i];
        var score;
        board[move.row][move.col] = color;
        try {
          if (hasFive(board, move.row, move.col, color)) {
            score = WIN_SCORE;
          } else {
            score = -negamax(board, opposite(color), depth - 1, -Infinity, -alpha, color, deadline);
          }
        } finally {
          board[move.row][move.col] = null;
        }
        if (score > bestScore) {
          bestScore = score;
          bestMove = move;
        }
        if (score > alpha) alpha = score;
      }
    } catch (error) {
      if (error === TIMEOUT) return null;
      throw error;
    }
    return bestMove ? { move: { row: bestMove.row, col: bestMove.col }, score: bestScore, depth: depth } : null;
  }

  /** 简单档：Top3 中 30% 概率随机挑一个次优（新手可胜，会漏防活三） */
  function easyMove(candidates, rng) {
    var top = candidates.slice(0, 3);
    var index = top.length > 1 && rng() < 0.3 ? 1 + Math.floor(rng() * (top.length - 1)) : 0;
    return { row: top[index].row, col: top[index].col };
  }
  /** 困难档：迭代加深 2→4 层，超时保留已完成层的最佳落子 */
  function hardMove(board, color, candidates, opts) {
    var limit = typeof opts.timeLimit === 'number' ? opts.timeLimit : DEFAULT_TIME_LIMIT;
    var deadline = Date.now() + limit;
    var best = null;
    for (var depth = 2; depth <= 4; depth += 2) {
      var result = searchRoot(board, color, depth, deadline);
      if (!result) break;
      best = result.move;
    }
    return best || { row: candidates[0].row, col: candidates[0].col };
  }

  /** 选择落子：[options] color/difficulty/seed/timeLimit；满盘返回 null */
  function chooseMove(board, options) {
    var opts = options || {};
    var color = opts.color === 'white' ? 'white' : 'black';
    var difficulty = opts.difficulty || 'normal';
    var rng = createRng(opts.seed === undefined ? Date.now() : opts.seed);
    var candidates = generateCandidates(board, color);
    if (!candidates.length) return null;

    // AI-04：己方一步成五必下；其次对手一步成五必堵
    var winning = findWinningMove(board, color);
    if (winning) return winning;
    var blocking = findWinningMove(board, opposite(color));
    if (blocking) return blocking;

    var move;
    if (difficulty === 'easy') {
      move = easyMove(candidates, rng);
    } else if (difficulty === 'hard') {
      move = hardMove(board, color, candidates, opts);
    } else {
      var result = searchRoot(board, color, 2, Infinity);
      move = result ? result.move : candidates[0];
    }

    // 硬约束：返回前再次校验坐标与空位（AI-03）
    if (!move || !isLegalMove(board, move.row, move.col)) {
      move = { row: candidates[0].row, col: candidates[0].col };
    }
    return move;
  }

  return {
    SIZE: SIZE,
    MAX_CANDIDATES: MAX_CANDIDATES,
    NEIGHBOR_RADIUS: NEIGHBOR_RADIUS,
    DEFAULT_TIME_LIMIT: DEFAULT_TIME_LIMIT,
    SCORES: SCORES,
    DIRECTIONS: DIRECTIONS,
    createBoard: createBoard,
    cloneBoard: cloneBoard,
    inBounds: inBounds,
    isLegalMove: isLegalMove,
    getLegalMoves: getLegalMoves,
    boardIsFull: boardIsFull,
    opposite: opposite,
    countLine: countLine,
    hasFive: hasFive,
    lineString: lineString,
    scoreLine: scoreLine,
    evaluatePoint: evaluatePoint,
    generateCandidates: generateCandidates,
    createRng: createRng,
    findWinningMove: findWinningMove,
    evaluateBoard: evaluateBoard,
    chooseMove: chooseMove,
  };
});
