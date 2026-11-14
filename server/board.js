'use strict';

const SIZE = 15;
const EMPTY = null;

/**
 * 服务端权威棋盘：15x15 二维数组，行/列索引范围 0–14。
 * 单元格取值：EMPTY(null) | 'black' | 'white'
 */
class Board {
  constructor(size = SIZE) {
    this.size = size;
    this.reset();
  }

  reset() {
    this.grid = Array.from({ length: this.size }, () => new Array(this.size).fill(EMPTY));
  }

  isInside(row, col) {
    return (
      Number.isInteger(row) &&
      Number.isInteger(col) &&
      row >= 0 &&
      row < this.size &&
      col >= 0 &&
      col < this.size
    );
  }

  get(row, col) {
    return this.grid[row][col];
  }

  set(row, col, color) {
    this.grid[row][col] = color;
  }

  isEmpty(row, col) {
    return this.grid[row][col] === EMPTY;
  }

  /** 返回棋盘的深拷贝快照，供 game_state 广播使用 */
  snapshot() {
    return this.grid.map((row) => row.slice());
  }
}

module.exports = { Board, SIZE, EMPTY };
