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

  return {
    SIZE: SIZE,
    MAX_CANDIDATES: MAX_CANDIDATES,
    NEIGHBOR_RADIUS: NEIGHBOR_RADIUS,
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
  };
});
