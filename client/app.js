'use strict';

/**
 * 客户端入口：棋盘绘制（T2-2）、棋子绘制（T2-3）、点击落子（T2-4）、
 * 服务端消息同步（T2-5）、回合提示与倒计时（T2-6）、匹配界面（T2-7）、
 * 对局结果弹窗（T2-8）、WebSocket 连接（T2-1）。
 */

const SIZE = 15; // 15x15 棋盘
const CANVAS_LOGICAL_SIZE = 600; // 画布逻辑尺寸（CSS 负责缩放显示）
const PADDING = 20; // 棋盘最外线到画布边缘的留白
const CELL = (CANVAS_LOGICAL_SIZE - PADDING * 2) / (SIZE - 1); // 相邻交叉点间距
const BOARD_TOP_COLOR = '#e7c88e'; // 木面顶部色
const BOARD_MID_COLOR = '#dbb675'; // 木面中部色
const BOARD_BOTTOM_COLOR = '#cda463'; // 木面底部色
const LINE_COLOR = 'rgba(88, 58, 28, 0.62)'; // 细网格线
const STAR_RADIUS = 3;
const LAST_MOVE_RING_COLOR = '#c0392b'; // 最近一手标记圈
const STONE_RADIUS = CELL * 0.44; // 棋子半径，保证相邻棋子间留有间隙
const DROP_DURATION = 300; // 落子动画时长（毫秒）
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
const resultOverlayEl = document.getElementById('result-overlay');
const resultTitleEl = document.getElementById('result-title');
const resultMessageEl = document.getElementById('result-message');
const resultButtonEl = document.getElementById('result-button');

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
let hoverCell = null; // 当前鼠标悬停的空位交叉点 {row,col}，用于落子预览
let lastMove = null; // 最近一手落子坐标，用于绘制红色标记圈
let hoverScheduled = false; // mousemove 的 rAF 节流标记
let pendingHoverEvent = null; // 待处理的最新 mousemove 事件
let animatingStones = []; // 正在播放落子动画的棋子 [{row,col,color,startTime}]
let animFrameId = null; // 落子动画的 rAF id
let audioCtx = null; // 落子音效的 AudioContext（首次用户交互时初始化）

const LEAVE_CONFIRM_TEXT = '离开将结束当前对局，退出将断开连接并判负。确定继续吗？';

/** 按设备像素比初始化画布，保证高分屏下网格清晰 */
function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(CANVAS_LOGICAL_SIZE * dpr);
  canvas.height = Math.round(CANVAS_LOGICAL_SIZE * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0.5, 0.5);
}

const gridX = (col) => PADDING + col * CELL;
const gridY = (row) => PADDING + row * CELL;

/** 叠加木面纹理：细密竖向木纹 + 少量深色长纹，模拟实木格面 */
function drawWoodGrain() {
  ctx.save();
  for (let i = 0; i < 48; i++) {
    const x = ((i + 0.5) / 48) * CANVAS_LOGICAL_SIZE + Math.sin(i * 1.7) * 3;
    ctx.strokeStyle = `rgba(140, 96, 48, ${0.028 + (i % 4) * 0.011})`;
    ctx.lineWidth = i % 6 === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 5, 200, x - 5, 400, x + Math.sin(i) * 4, CANVAS_LOGICAL_SIZE);
    ctx.stroke();
  }
  ctx.restore();
}

/** 绘制木面底色、木纹、柔和光影、15x15 细网格与星位 */
function drawBoard() {
  ctx.clearRect(0, 0, CANVAS_LOGICAL_SIZE, CANVAS_LOGICAL_SIZE);

  // 木面竖向渐变
  const bg = ctx.createLinearGradient(0, 0, 0, CANVAS_LOGICAL_SIZE);
  bg.addColorStop(0, BOARD_TOP_COLOR);
  bg.addColorStop(0.55, BOARD_MID_COLOR);
  bg.addColorStop(1, BOARD_BOTTOM_COLOR);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, CANVAS_LOGICAL_SIZE, CANVAS_LOGICAL_SIZE);

  drawWoodGrain();

  // 中心柔光，模拟灯下光泽
  const glow = ctx.createRadialGradient(300, 250, 40, 300, 300, 430);
  glow.addColorStop(0, 'rgba(255, 240, 200, 0.22)');
  glow.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CANVAS_LOGICAL_SIZE, CANVAS_LOGICAL_SIZE);

  // 四周轻微暗角，突出木面层次
  const vignette = ctx.createRadialGradient(300, 300, 230, 300, 300, 440);
  vignette.addColorStop(0, 'rgba(116, 76, 36, 0)');
  vignette.addColorStop(1, 'rgba(116, 76, 36, 0.2)');
  ctx.fillStyle = vignette;
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

  // 网格外侧一道浅描边，与木框自然衔接
  const span = gridX(SIZE - 1) - gridX(0);
  ctx.strokeStyle = 'rgba(92, 62, 32, 0.3)';
  ctx.strokeRect(gridX(0) - 8, gridY(0) - 8, span + 16, span + 16);

  // 星位：深棕小圆点
  ctx.fillStyle = 'rgba(74, 48, 22, 0.85)';
  for (const [row, col] of STAR_POINTS) {
    ctx.beginPath();
    ctx.arc(gridX(col), gridY(row), STAR_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  }
}

/**
 * 在交叉点 (row, col) 绘制一枚棋子，支持缩放与垂直位移（用于落子动画）。
 * 以 (gridX(col), gridY(row) - yOffset) 为中心按 scale 缩放绘制。
 * @param {number} row 行索引 0–14
 * @param {number} col 列索引 0–14
 * @param {'black'|'white'} color 棋子颜色
 * @param {number} scale 缩放比例
 * @param {number} yOffset 垂直向下位移（像素），正数表示在交叉点下方
 */
function drawStoneAt(row, col, color, scale, yOffset) {
  const cx = gridX(col);
  const cy = gridY(row) - yOffset;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  // 黑白棋子使用不同渐变，表现立体感
  const gradient = ctx.createRadialGradient(
    cx - STONE_RADIUS / 3,
    cy - STONE_RADIUS / 3,
    STONE_RADIUS / 6,
    cx,
    cy,
    STONE_RADIUS
  );
  if (color === 'black') {
    // 黑子：深色光泽，左上带柔和高光
    gradient.addColorStop(0, '#57504a');
    gradient.addColorStop(0.45, '#26221f');
    gradient.addColorStop(1, '#080706');
  } else {
    // 白子：暖调象牙白，避免纯白刺眼
    gradient.addColorStop(0, '#fffdf6');
    gradient.addColorStop(0.5, '#f4ead6');
    gradient.addColorStop(1, '#d6c7ac');
  }

  ctx.fillStyle = gradient;
  ctx.shadowColor = 'rgba(70, 40, 15, 0.3)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 2;

  ctx.beginPath();
  ctx.arc(cx, cy, STONE_RADIUS, 0, Math.PI * 2);
  ctx.fill();

  // 极细描边，让棋子在木面上更立体
  ctx.shadowColor = 'rgba(0, 0, 0, 0)';
  ctx.strokeStyle = color === 'black' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(120, 96, 60, 0.28)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/** 在交叉点绘制一枚标准棋子（缩放 1、无位移） */
function drawStone(row, col, color) {
  drawStoneAt(row, col, color, 1, 0);
}

/** 缓动：二次减速 */
function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

/** 缓动：带回弹的减速（用于弹性缩放） */
function easeOutBack(t) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * 绘制落子动画中的棋子：从上方落下（yOffset 由大到 0），
 * 缩放从 1.2 弹性回落到 1.0，持续约 DROP_DURATION 毫秒。
 */
function drawAnimatedStone(stone, now) {
  const t = Math.min(1, (now - stone.startTime) / DROP_DURATION);
  const yOffset = (1 - easeOutQuad(t)) * 80; // 从上方 80px 处落下
  const scale = 1 + 0.2 * (1 - easeOutBack(t)); // 1.2 → 1.0 带回弹
  drawStoneAt(stone.row, stone.col, stone.color, scale, yOffset);
}

/** 落子动画主循环：还有动画中的棋子时持续重绘 */
function renderTick() {
  animFrameId = null;
  const now = performance.now();
  animatingStones = animatingStones.filter((s) => now - s.startTime < DROP_DURATION);
  renderAll();
  if (animatingStones.length > 0) scheduleRender();
}

/** 启动落子动画循环（幂等） */
function scheduleRender() {
  if (animFrameId) return;
  animFrameId = requestAnimationFrame(renderTick);
}

/**
 * 为一枚新落下的棋子启动动画并播放音效。
 * 落子方（本地点击或对手落子）统一调用此函数。
 */
function playStoneAnimation(row, col, color) {
  animatingStones.push({ row, col, color, startTime: performance.now() });
  scheduleRender();
  playDropSound(color);
}

/**
 * 初始化并恢复 AudioContext。
 * 必须在用户交互（点击）中调用，以兼容移动端自动播放策略。
 */
function ensureAudioCtx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

/**
 * 落子音效：用 Web Audio API 合成，不依赖外部音频文件。
 * 黑子 400Hz、白子 500Hz，正弦波快速衰减约 100ms。
 */
function playDropSound(color) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;

  const freq = color === 'black' ? 400 : 500;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = 'sine';
  osc.frequency.value = freq;

  const t = ctx.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.3, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);

  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.12);
}

/** 重绘棋盘与全部棋子，并在空位上叠加悬停预览，叠加落子动画 */
function renderAll() {
  drawBoard();
  const now = performance.now();
  const animatingSet = new Set(
    animatingStones.map((s) => `${s.row},${s.col}`)
  );
  for (let row = 0; row < SIZE; row++) {
    for (let col = 0; col < SIZE; col++) {
      const color = board[row][col];
      // 正在播放落子动画的棋子交由动画帧绘制，避免与静态绘制重叠
      if (color && !animatingSet.has(`${row},${col}`)) drawStone(row, col, color);
    }
  }
  for (const stone of animatingStones) {
    drawAnimatedStone(stone, now);
  }
  // 最近一手：红色标记圈（落子动画播放完毕后再出现）
  if (lastMove && !animatingSet.has(`${lastMove.row},${lastMove.col}`)) {
    drawLastMoveMarker(lastMove.row, lastMove.col);
  }
  // 仅在自己回合、悬停于空位时显示半透明预览棋
  if (
    hoverCell &&
    inGame &&
    !gameFinished &&
    currentTurn === myColor &&
    board[hoverCell.row][hoverCell.col] === null
  ) {
    drawHoverPreview(hoverCell.row, hoverCell.col, myColor);
  }
}

/**
 * 绘制悬停预览：以 0.5 透明度画一枚当前玩家颜色的棋子。
 * 用 save/restore 包裹，避免污染全局绘图状态。
 */
function drawHoverPreview(row, col, color) {
  ctx.save();
  ctx.globalAlpha = 0.5;
  drawStone(row, col, color);
  ctx.restore();
}

/** 绘制最近一手的红色标记圈 */
function drawLastMoveMarker(row, col) {
  ctx.save();
  ctx.strokeStyle = LAST_MOVE_RING_COLOR;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(gridX(col), gridY(row), STONE_RADIUS + 4.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
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

  // 激活音频上下文（首次用户交互，兼容移动端自动播放策略）
  ensureAudioCtx();

  // 本地即时反馈；以服务端广播的结果为最终状态（T2-5 负责同步）
  board[row][col] = myColor;
  lastMove = { row, col };
  playStoneAnimation(row, col, myColor); // 落子动画 + 音效

  pendingMove = { row, col };
  hoverCell = null; // 落子后清除悬停预览
  // 等待服务端返回下一回合的 turn_start，避免同一回合重复落子
  currentTurn = null;
  updateTurnLabel();
  sendMessage({ type: 'move', row, col });
}

canvas.addEventListener('click', handleCanvasClick);

/** 根据鼠标位置更新悬停预览，并按需重绘 */
function updateHover(event) {
  // 不在自己回合、对局未进行时不显示预览
  if (!inGame || gameFinished || currentTurn !== myColor) {
    if (hoverCell) {
      hoverCell = null;
      renderAll();
    }
    return;
  }

  const { row, col } = pointToCell(event);
  // 越界或已占用的位置不显示预览
  if (row < 0 || row >= SIZE || col < 0 || col >= SIZE || board[row][col] !== null) {
    if (hoverCell) {
      hoverCell = null;
      renderAll();
    }
    return;
  }

  // 仅在交叉点变化时重绘，减少无意义重绘
  if (!hoverCell || hoverCell.row !== row || hoverCell.col !== col) {
    hoverCell = { row, col };
    renderAll();
  }
}

/** mousemove 处理：用 requestAnimationFrame 节流，避免高频重绘卡顿 */
function handleCanvasMouseMove(event) {
  pendingHoverEvent = event;
  if (hoverScheduled) return;
  hoverScheduled = true;
  requestAnimationFrame(() => {
    hoverScheduled = false;
    if (pendingHoverEvent) {
      updateHover(pendingHoverEvent);
      pendingHoverEvent = null;
    }
  });
}

canvas.addEventListener('mousemove', handleCanvasMouseMove);
canvas.addEventListener('mouseleave', () => {
  if (hoverCell) {
    hoverCell = null;
    renderAll();
  }
});

/**
 * WebSocket 连接（T2-1）：建立与游戏服务端的连接并展示连接状态。
 */
const WS_URL = 'ws://10.21.174.122:3000';

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

  // 回合指示圆点跟随当前落子方颜色
  gameInfoEl.dataset.turn = inGame && currentTurn ? currentTurn : '';
}

/** 仅在有效对局中启用路由离开守卫，终局后立即解除。 */
function syncLeaveGuard() {
  const router = window.Gomoku && window.Gomoku.router;
  if (router) router.setLeaveGuard(inGame && !gameFinished ? confirmLeaveGame : null);
}

/** 路由/后退确认：取消则留局；确认后按 5.6 降级为断线，由服务端判负。 */
function confirmLeaveGame() {
  if (!inGame || gameFinished) return true;
  if (!window.confirm(LEAVE_CONFIRM_TEXT)) return false;

  inGame = false;
  gameFinished = true;
  searching = false;
  currentTurn = null;
  pendingMove = null;
  hoverCell = null;
  animatingStones = [];
  stopCountdown();
  updateTurnLabel();
  syncLeaveGuard();

  // resign 尚未由服务端交付；当前关闭连接，服务端按 disconnect 判负。
  if (socket && socket.readyState === WebSocket.OPEN) socket.close();
  return true;
}

/** 刷新/关页提示；只有用户确认离开并由浏览器卸载后，连接才会断开。 */
function handleBeforeUnload(event) {
  if (!inGame || gameFinished) return;
  event.preventDefault();
  event.returnValue = '';
}

window.addEventListener('beforeunload', handleBeforeUnload);

/**
 * 处理服务端消息：同步对局状态（T2-5）。
 */
function handleGameMessage(message) {
  switch (message.type) {
    case 'match_success':
      inGame = true;
      gameFinished = false;
      searching = false;
      hoverCell = null;
      lastMove = null;
      animatingStones = [];
      myColor = message.color;
      currentTurn = null;
      pendingMove = null;
      stopCountdown();
      hideMatchPanel();
      hideResultPanel();
      gameInfoEl.hidden = false;
      countdownEl.textContent = '5:00';
      countdownEl.dataset.state = 'normal';
      updateTurnLabel();
      syncLeaveGuard();
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
      inGame = false;
      currentTurn = null;
      hoverCell = null;
      animatingStones = [];
      stopCountdown();
      updateTurnLabel();
      syncLeaveGuard();
      renderAll(); // 重绘以清除残留的悬停预览
      showResultPanel(message.winner, message.reason);
      console.log('[game] over:', message.winner, message.reason);
      break;

    default:
      break;
  }
}

/** 应用服务端广播的落子（服务端为权威状态） */
function applyMove(row, col, color) {
  const isOwnEcho =
    pendingMove && pendingMove.row === row && pendingMove.col === col;
  board[row][col] = color;
  if (isOwnEcho) {
    // 自己落子的服务端回显：点击时已播放过动画与音效，不再重复
    pendingMove = null;
  } else {
    // 对手落子：播放落子动画与音效
    playStoneAnimation(row, col, color);
  }
  lastMove = { row, col };
  renderAll();
}

/** 落子被服务端拒绝时，撤销本地先行绘制的棋子 */
function rollbackPendingMove() {
  if (!pendingMove) return;
  board[pendingMove.row][pendingMove.col] = null;
  pendingMove = null;
  lastMove = null;
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

/** 对局结束原因文案（按胜负区分） */
const RESULT_REASON_TEXT = {
  win: { won: '你率先连成五子，赢下本局', lost: '对手率先连成五子，你落败' },
  timeout: { won: '对手超时未落子，你获胜', lost: '你超时未落子，判负' },
  disconnect: { won: '对手断线，你获胜', lost: '你已断线，判负' },
};

/** 显示对局结果弹窗（T2-8），以服务端下发的 winner/reason 为准 */
function showResultPanel(winner, reason) {
  const won = winner === myColor;
  const text = RESULT_REASON_TEXT[reason] || {
    won: '对局结束，你获胜',
    lost: '对局结束，你落败',
  };

  resultTitleEl.textContent = won ? '你赢了' : '你输了';
  resultTitleEl.dataset.state = won ? 'win' : 'lose';
  resultMessageEl.textContent = won ? text.won : text.lost;
  resultOverlayEl.hidden = false;
}

/** 隐藏对局结果弹窗 */
function hideResultPanel() {
  resultOverlayEl.hidden = true;
}

resultButtonEl.addEventListener('click', () => {
  hideResultPanel();
  if (!inGame) {
    // 对局已结束：回到匹配入口，便于直接开始下一局
    showMatchPanel('点击下方按钮开始匹配对手', '开始匹配', false);
  }
});

matchButtonEl.addEventListener('click', () => {
  ensureAudioCtx(); // 首次用户交互时解锁音频上下文
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
