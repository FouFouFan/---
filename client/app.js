'use strict';

/**
 * 客户端入口：棋盘绘制（T2-2）、棋子绘制（T2-3）、点击落子（T2-4）、
 * 服务端消息同步（T2-5）、回合提示与倒计时（T2-6）、匹配界面（T2-7）、
 * WebSocket 连接（T2-1）。
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
const gameInfoEl = document.getElementById('game-info');
const turnLabelEl = document.getElementById('turn-label');
const countdownEl = document.getElementById('countdown');
const matchOverlayEl = document.getElementById('match-overlay');
const matchHintEl = document.getElementById('match-hint');
const matchButtonEl = document.getElementById('match-button');

// 本地棋盘：null 表示空，'black' / 'white' 表示棋子
const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

let socket = null; // WebSocket 连接（T2-1）
let inGame = false; // 是否已进入对局
let myColor = null; // 自己执子颜色，由 match_success 下发
let currentTurn = null; // 当前该谁落子，由 turn_start 下发
let pendingMove = null; // 已发送但未确认的落子，用于被拒绝时回滚
let gameFinished = false; // 对局是否已结束
let countdownTimer = null; // 倒计时刷新定时器
let turnDeadline = null; // 当前回合截止时间（服务端下发）
let searching = false; // 是否正在匹配队列中

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

/** 重绘棋盘与全部棋子 */
function renderAll() {
  drawBoard();
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const color = board[row][col];
      if (color) drawStone(row, col, color);
    }
  }
}

/**
 * 把鼠标事件换算成最近的棋盘交叉点坐标。
 * 画布可能被 CSS 缩放，因此需要按实际显示尺寸换算回 600×600 逻辑坐标。
 */
function pointToCell(event) {
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (CANVAS_LOGICAL_SIZE / rect.width);
  const y = (event.clientY - rect.top) * (CANVAS_LOGICAL_SIZE / rect.height);

  return {
    row: Math.round((y - PADDING) / CELL),
    col: Math.round((x - PADDING) / CELL),
  };
}

/** 点击落子（T2-4）：仅在自己回合、点击空交叉点时才发送落子请求 */
function handleCanvasClick(event) {
  if (!inGame || gameFinished) return;

  const { row, col } = pointToCell(event);
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE) return;
  if (currentTurn !== myColor) return; // 不是自己的回合
  if (board[row][col] !== null) return; // 该位置已有棋子

  // 本地即时反馈；以服务端广播的结果为最终状态（T2-5 负责同步）
  board[row][col] = myColor;
  drawStone(row, col, myColor);

  pendingMove = { row, col };
  // 等待服务端返回下一回合的 turn_start，避免同一回合重复落子
  currentTurn = null;
  updateTurnLabel();
  sendMessage({ type: 'move', row, col });
}

canvas.addEventListener('click', handleCanvasClick);

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

/** 发送 JSON 消息；未连接时丢弃 */
function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('[ws] not connected, message dropped:', message);
    return;
  }
  socket.send(JSON.stringify(message));
}

/** 把剩余毫秒格式化为 m:ss */
function formatDuration(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/** 刷新剩余时间显示（以服务端下发的截止时间为准） */
function tickCountdown() {
  if (turnDeadline === null) return;

  const remaining = Math.max(0, turnDeadline - Date.now());
  countdownEl.textContent = formatDuration(remaining);
  countdownEl.dataset.state = remaining <= 30000 ? 'low' : 'normal';
}

/** 开始（或重置）本回合倒计时 */
function startCountdown(deadline) {
  turnDeadline = deadline;
  if (countdownTimer) clearInterval(countdownTimer);

  tickCountdown();
  countdownTimer = setInterval(tickCountdown, 200);
}

/** 停止倒计时 */
function stopCountdown() {
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  turnDeadline = null;
}

/** 更新回合提示文字 */
function updateTurnLabel() {
  if (gameFinished) {
    turnLabelEl.textContent = '对局已结束';
  } else if (!inGame) {
    turnLabelEl.textContent = '等待开局…';
  } else if (currentTurn === myColor) {
    turnLabelEl.textContent = '轮到你落子';
  } else if (currentTurn) {
    turnLabelEl.textContent = '等待对手落子';
  } else if (pendingMove) {
    turnLabelEl.textContent = '等待服务端确认…';
  } else {
    turnLabelEl.textContent = '等待开局…';
  }
}

/**
 * 处理服务端消息：同步对局状态（T2-5）。
 */
function handleGameMessage(message) {
  switch (message.type) {
    case 'match_success':
      inGame = true;
      gameFinished = false;
      searching = false;
      myColor = message.color;
      currentTurn = null;
      pendingMove = null;
      stopCountdown();
      hideMatchPanel();
      gameInfoEl.hidden = false;
      countdownEl.textContent = '5:00';
      countdownEl.dataset.state = 'normal';
      updateTurnLabel();
      for (const row of board) row.fill(null);
      renderAll();
      break;

    case 'match_waiting':
      searching = true;
      showMatchPanel('正在匹配，等待对手加入…', '匹配中…', true);
      break;

    case 'turn_start': {
      currentTurn = message.color;
      const deadline =
        typeof message.deadline === 'number' ? message.deadline : Date.now() + (message.remainingMs || 0);
      startCountdown(deadline);
      updateTurnLabel();
      break;
    }

    case 'move':
      applyMove(message.row, message.col, message.color);
      break;

    case 'move_rejected':
      rollbackPendingMove();
      console.warn('[game] move rejected:', message.reason, message.message);
      if (message.reason === 'occupied' || message.reason === 'out_of_range') {
        // 落子未被接受，仍是我方回合，允许重新选择落点
        currentTurn = myColor;
      }
      break;

    case 'game_over':
      gameFinished = true;
      currentTurn = null;
      stopCountdown();
      updateTurnLabel();
      console.log('[game] over:', message.winner, message.reason);
      break;

    default:
      break;
  }
}

/** 应用服务端广播的落子（服务端为权威状态） */
function applyMove(row, col, color) {
  board[row][col] = color;
  if (pendingMove && pendingMove.row === row && pendingMove.col === col) {
    pendingMove = null;
  }
  renderAll();
}

/** 落子被服务端拒绝时，撤销本地先行绘制的棋子 */
function rollbackPendingMove() {
  if (!pendingMove) return;
  board[pendingMove.row][pendingMove.col] = null;
  pendingMove = null;
  renderAll();
}

/** 显示匹配面板 */
function showMatchPanel(hint, buttonText, buttonDisabled) {
  matchOverlayEl.hidden = false;
  matchHintEl.textContent = hint;
  matchButtonEl.textContent = buttonText;
  matchButtonEl.disabled = buttonDisabled;
}

/** 隐藏匹配面板 */
function hideMatchPanel() {
  matchOverlayEl.hidden = true;
}

matchButtonEl.addEventListener('click', () => {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    showMatchPanel('尚未连接服务器，请稍后重试', '开始匹配', true);
    return;
  }

  searching = true;
  showMatchPanel('正在匹配，等待对手加入…', '匹配中…', true);
  sendMessage({ type: 'match_request' });
});

function connect() {
  setStatus('连接中…', 'connecting');

  socket = new WebSocket(WS_URL);

  socket.addEventListener('open', () => {
    console.log('[ws] connected:', WS_URL);
    setStatus('已连接', 'online');
    if (searching) {
      showMatchPanel('正在匹配，等待对手加入…', '匹配中…', true);
    } else if (!inGame) {
      showMatchPanel('点击下方按钮开始匹配对手', '开始匹配', false);
    }
  });

  socket.addEventListener('close', () => {
    console.log('[ws] disconnected');
    setStatus('已断开', 'offline');
    if (searching) {
      searching = false;
      showMatchPanel('连接已断开，请刷新页面重试', '开始匹配', true);
    }
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
    handleGameMessage(message);
  });
}

setupCanvas();
renderAll();
connect();
