'use strict';

/**
 * 五子棋棋盘绘制模块（独立文件）
 * 画布逻辑尺寸 600×600，15×15 交叉点，间距 40px，四周留白 20px。
 */

const CANVAS_SIZE = 600;
const GRID_COUNT = 15;
const GRID_STEP = 40;
const GRID_MARGIN = 20;
const BACKGROUND_COLOR = '#dcb35c';
const LINE_COLOR = '#333';
const STAR_RADIUS = 4;

// 星位（行, 列），索引从 0 开始
const STAR_POINTS = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
];

const PIECE_RADIUS = 16;
const PIECE_FILL = {
  black: '#1a1a1a',
  white: '#f5f5f5',
};

function gridX(col) {
  return GRID_MARGIN + col * GRID_STEP;
}

function gridY(row) {
  return GRID_MARGIN + row * GRID_STEP;
}

/**
 * 绘制棋盘：木色背景、15×15 网格与 5 个星位。
 * @param {CanvasRenderingContext2D} ctx
 */
function drawBoard(ctx) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.fillStyle = BACKGROUND_COLOR;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;

  for (let i = 0; i < GRID_COUNT; i++) {
    const x = gridX(i);
    const y = gridY(i);

    ctx.beginPath();
    ctx.moveTo(gridX(0), y);
    ctx.lineTo(gridX(GRID_COUNT - 1), y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, gridY(0));
    ctx.lineTo(x, gridY(GRID_COUNT - 1));
    ctx.stroke();
  }

  ctx.fillStyle = '#000';
  for (const [row, col] of STAR_POINTS) {
    ctx.beginPath();
    ctx.arc(gridX(col), gridY(row), STAR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 在交叉点绘制一枚棋子。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} row 行索引 0–14
 * @param {number} col 列索引 0–14
 * @param {'black'|'white'} color 棋子颜色
 */
function drawPiece(ctx, row, col, color) {
  ctx.beginPath();
  ctx.arc(gridX(col), gridY(row), PIECE_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = PIECE_FILL[color];
  ctx.fill();

  ctx.lineWidth = 1;
  ctx.strokeStyle = LINE_COLOR;
  ctx.stroke();
}

/**
 * 根据棋盘数组渲染全部棋子。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number[][]} board 15×15 数组：0 空、1 黑子、2 白子
 */
function renderPieces(ctx, board) {
  for (let row = 0; row < board.length; row++) {
    for (let col = 0; col < board[row].length; col++) {
      const value = board[row][col];
      if (value === 1) {
        drawPiece(ctx, row, col, 'black');
      } else if (value === 2) {
        drawPiece(ctx, row, col, 'white');
      }
    }
  }
}

window.GomokuBoard = { drawBoard, drawPiece, renderPieces };

// 页面加载完成后自动绘制一次棋盘
document.addEventListener('DOMContentLoaded', () => {
  const canvas = document.getElementById('board');
  if (!canvas) return;
  drawBoard(canvas.getContext('2d'));
});
