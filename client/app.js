'use strict';

/**
 * 客户端入口：棋盘绘制（T2-2）、棋子绘制（T2-3）、WebSocket 连接（T2-1）。
 */

const SIZE = 15; // 15x15 棋盘
const CANVAS_LOGICAL_SIZE = 600; // 画布逻辑尺寸（CSS 负责缩放显示）
const PADDING = 20; // 棋盘最外线到画布边缘的留白
const CELL = (CANVAS_LOGICAL_SIZE - PADDING * 2) / (SIZE - 1); // 相邻交叉点间距
const BOARD_COLOR = '#e8c98f';
const LINE_COLOR = '#6b5333';
const STAR_RADIUS = 4;
const STONE_RADIUS = CELL * 0.42; // 棋子半径，保证相邻棋子间留有间隙
// 星位：四角 (3,3)/(3,11)/(11,3)/(11,11) 与天元 (7,7)
const STAR_POINTS = [
  [3, 3],
  [3, 11],
  [7, 7],
  [11, 3],
  [11, 11],
];

const canvas = document.getElementById('board-canvas');
const ctx = canvas.getContext('2d');

/** 按设备像素比初始化画布，保证高分屏下网格清晰 */
function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(CANVAS_LOGICAL_SIZE * dpr);
  canvas.height = Math.round(CANVAS_LOGICAL_SIZE * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0.5, 0.5);
}

const gridX = (col) => PADDING + col * CELL;
const gridY = (row) => PADDING + row * CELL;

/** 绘制木色底、15x15 网格与星位 */
function drawBoard() {
  ctx.clearRect(0, 0, CANVAS_LOGICAL_SIZE, CANVAS_LOGICAL_SIZE);

  ctx.fillStyle = BOARD_COLOR;
  ctx.fillRect(0, 0, CANVAS_LOGICAL_SIZE, CANVAS_LOGICAL_SIZE);

  ctx.strokeStyle = LINE_COLOR;
  ctx.lineWidth = 1;

  for (let i = 0; i < SIZE; i++) {
    ctx.beginPath();
    ctx.moveTo(gridX(0), gridY(i));
    ctx.lineTo(gridX(SIZE - 1), gridY(i));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(gridX(i), gridY(0));
    ctx.lineTo(gridX(i), gridY(SIZE - 1));
    ctx.stroke();
  }

  // 外边框略加粗，突出棋盘边界
  ctx.lineWidth = 2;
  ctx.strokeRect(gridX(0), gridY(0), gridX(SIZE - 1) - gridX(0), gridY(SIZE - 1) - gridY(0));

  ctx.fillStyle = LINE_COLOR;
  for (const [row, col] of STAR_POINTS) {
    ctx.beginPath();
    ctx.arc(gridX(col), gridY(row), STAR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 在交叉点 (row, col) 绘制一枚棋子。
 * @param {number} row 行索引 0–14
 * @param {number} col 列索引 0–14
 * @param {'black'|'white'} color 棋子颜色
 */
function drawStone(row, col, color) {
  const x = gridX(col);
  const y = gridY(row);

  // 黑白棋子使用不同渐变，表现立体感
  const gradient = ctx.createRadialGradient(
    x - STONE_RADIUS / 3,
    y - STONE_RADIUS / 3,
    STONE_RADIUS / 6,
    x,
    y,
    STONE_RADIUS
  );
  if (color === 'black') {
    gradient.addColorStop(0, '#6f6f6f');
    gradient.addColorStop(1, '#0d0d0d');
  } else {
    gradient.addColorStop(0, '#ffffff');
    gradient.addColorStop(1, '#c9c9c9');
  }

  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.25)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, STONE_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * WebSocket 连接（T2-1）：建立与游戏服务端的连接并展示连接状态。
 */
const WS_URL = 'ws://localhost:3000';

const statusEl = document.getElementById('connection-status');

/**
 * @param {string} text 状态文案
 * @param {'connecting'|'online'|'offline'} state 状态样式
 */
function setStatus(text, state) {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function connect() {
  setStatus('连接中…', 'connecting');

  const socket = new WebSocket(WS_URL);

  socket.addEventListener('open', () => {
    console.log('[ws] connected:', WS_URL);
    setStatus('已连接', 'online');
  });

  socket.addEventListener('close', () => {
    console.log('[ws] disconnected');
    setStatus('已断开', 'offline');
  });

  socket.addEventListener('error', () => {
    console.error('[ws] connection error:', WS_URL);
    setStatus('连接失败', 'offline');
  });

  socket.addEventListener('message', (event) => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      console.warn('[ws] invalid message:', event.data);
      return;
    }
    console.log('[ws] message:', message);
  });
}

setupCanvas();
drawBoard();
connect();
