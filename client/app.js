'use strict';

/**
 * 客户端入口（T2-7 拆分后）：连接、消息同步、计时、结算与页面状态。
 * 棋盘绘制、悬停预览、落子动画与点击上报由 board-view.js 负责。
 */

const SIZE = 15; // 15x15 棋盘
const DROP_DURATION = 300; // 落子动画时长（毫秒）

const gameInfoEl = document.getElementById('game-info');
const turnLabelEl = document.getElementById('turn-label');
const countdownEl = document.getElementById('countdown');
const matchOverlayEl = document.getElementById('match-overlay');
const resultOverlayEl = document.getElementById('result-overlay');
const resultTitleEl = document.getElementById('result-title');
const resultMessageEl = document.getElementById('result-message');
const resultButtonEl = document.getElementById('result-button');

// 本地棋盘：null 表示空，'black' / 'white' 表示棋子
const board = Array.from({ length: SIZE }, () => Array(SIZE).fill(null));

let socket = null; // WebSocket 连接
let inGame = false; // 是否已进入对局
let myColor = null; // 自己执子颜色，由 match_success 下发
let currentTurn = null; // 当前该谁落子，由 turn_start 下发
let pendingMove = null; // 已发送但未确认的落子，用于被拒绝时回滚
let gameFinished = false; // 对局是否已结束
let countdownTimer = null; // 倒计时刷新定时器
let turnDeadline = null; // 当前回合截止时间（服务端下发）
let searching = false; // 是否正在匹配队列中
let audioCtx = null; // 落子音效的 AudioContext（首次用户交互时初始化）

// 棋盘视图（T2-7）：渲染、悬停、动画与点击上报均由其负责
const boardView = window.Gomoku.BoardView.create(
  document.getElementById('board-canvas'),
  { size: SIZE }
);
boardView.setBoard(board);
boardView.onMove(handleMoveIntent);
window.Gomoku.boardView = boardView;
window.Gomoku.playDropSound = playDropSound;
window.Gomoku.ensureAudioCtx = ensureAudioCtx;

const LEAVE_CONFIRM_TEXT = '离开将结束当前对局，退出将断开连接并判负。确定继续吗？';
const reduceMotionMedia = window.matchMedia('(prefers-reduced-motion: reduce)');
const soundToggleEl = document.getElementById('sound-toggle');
const soundStateEl = document.getElementById('sound-toggle-state');

// 音效与动效偏好（SET-01/02）
let soundEnabled = window.Gomoku.SettingsStore.get().soundEnabled;
let dropDuration = reduceMotionMedia.matches ? 0 : DROP_DURATION;
boardView.setDropDuration(dropDuration);

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
  if (!soundEnabled) return; // SET-01：关闭后落子无声音

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

/**
 * 棋盘点击上报（由 board-view 在空位点击时回调）。
 * 仅在自己回合处理，先本地反馈，最终以服务端广播为准。
 */
function handleMoveIntent(cellPoint) {
  const { row, col } = cellPoint;
  if (!inGame || gameFinished) return;
  if (currentTurn !== myColor) return;
  if (board[row][col] !== null) return;

  ensureAudioCtx(); // 首次用户交互时解锁音频

  board[row][col] = myColor;
  boardView.setLastMove({ row, col });
  boardView.animateMove(row, col, myColor);
  playDropSound(myColor);

  pendingMove = { row, col };
  currentTurn = null; // 等待服务端 turn_start，避免同回合重复落子
  updateTurnLabel();
  sendMessage({ type: 'move', row, col });
}

/**
 * WebSocket 连接：建立与游戏服务端的连接并展示连接状态。
 * 地址解析（T4-8 / PVP-07）：?server= > localStorage > 同主机 > localhost。
 * 非法地址被拒绝并回退，失败提示中包含实际尝试的地址。
 */
const serverConfig = window.Gomoku.SettingsStore.resolveServerUrl({
  search: window.location.search,
  hostname: window.location.hostname,
  protocol: window.location.protocol,
  stored: window.Gomoku.SettingsStore.getServerUrl(),
});

const WS_URL = serverConfig.url;

const statusEl = document.getElementById('connection-status');

// 非法 ?server= 已回退：记录并提示实际使用的地址（PVP-07）
if (serverConfig.notice) {
  console.warn('[ws]', serverConfig.notice);
  statusEl.textContent = '地址无效，已回退';
  statusEl.dataset.state = 'offline';
  statusEl.title = serverConfig.notice;
}

/**
 * @param {string} text 状态文案
 * @param {'connecting'|'online'|'offline'} state 状态样式
 */
function setStatus(text, state) {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

/** 音效开关外观：与 SettingsStore 保持一致（SET-01） */
function renderSoundToggle() {
  soundToggleEl.setAttribute('aria-pressed', String(soundEnabled));
  soundToggleEl.dataset.state = soundEnabled ? 'on' : 'off';
  soundStateEl.textContent = soundEnabled ? '开' : '关';
}

function applySettings(settings) {
  soundEnabled = settings.soundEnabled !== false;
  renderSoundToggle();
}

soundToggleEl.addEventListener('click', () => {
  applySettings(window.Gomoku.SettingsStore.update({ soundEnabled: !soundEnabled }));
  if (soundEnabled) playDropSound('black'); // 开启时试听一声
});

// 订阅设置，刷新后恢复；跨标签页修改也即时同步
window.Gomoku.SettingsStore.subscribe(applySettings);
applySettings(window.Gomoku.SettingsStore.get());

/** 跟随系统动效偏好：关闭下落动画并结束进行中的动画（SET-02） */
function applyMotionPreference() {
  dropDuration = reduceMotionMedia.matches ? 0 : DROP_DURATION;
  boardView.setDropDuration(dropDuration);
  if (dropDuration === 0) boardView.render();
}

if (reduceMotionMedia.addEventListener) {
  reduceMotionMedia.addEventListener('change', applyMotionPreference);
}

/** 发送 JSON 消息；未连接时丢弃，序列化/发送异常仅记录错误 */
function sendMessage(message) {
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    console.warn('[ws] not connected, message dropped:', message);
    return;
  }
  try {
    socket.send(JSON.stringify(message));
  } catch (error) {
    console.error('[ws] send failed:', error, message);
  }
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

/** 棋盘交互只在己方回合开启（含悬停预览） */
function syncBoardInteraction() {
  const myTurn = inGame && !gameFinished && currentTurn === myColor;
  boardView.setInteractive(myTurn);
  boardView.setHoverEnabled(myTurn);
  boardView.setHoverColor(myColor);
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
  syncBoardInteraction();
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
  boardView.clearMotion();
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
 * 处理服务端消息：同步对局状态。
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
      matchView.showFound();
      hideResultPanel();
      gameInfoEl.hidden = false;
      countdownEl.textContent = '5:00';
      countdownEl.dataset.state = 'normal';
      for (const row of board) row.fill(null);
      boardView.reset();
      updateTurnLabel();
      syncLeaveGuard();
      break;

    case 'match_waiting':
      searching = true;
      matchView.showWaiting();
      break;

    case 'match_cancelled':
      searching = false;
      matchView.hide();
      window.Gomoku.router.navigate('home');
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
      stopCountdown();
      boardView.clearMotion();
      updateTurnLabel();
      syncLeaveGuard();
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
    boardView.animateMove(row, col, color);
    playDropSound(color);
  }
  boardView.setLastMove({ row, col });
  boardView.render();
}

/** 落子被服务端拒绝时，撤销本地先行绘制的棋子 */
function rollbackPendingMove() {
  if (!pendingMove) return;
  board[pendingMove.row][pendingMove.col] = null;
  pendingMove = null;
  boardView.setLastMove(null);
  boardView.render();
}

/** 匹配视图（T4-7）：等待时长、取消、重试与断线提示 */
const matchView = window.Gomoku.MatchView.create({
  root: matchOverlayEl,
  onStart: startMatch,
  onCancel: cancelMatch,
  onRetry: () => {
    ensureAudioCtx();
    connect();
  },
  onHome: () => {
    searching = false;
    matchView.hide();
    window.Gomoku.router.navigate('home');
  },
});

/** 开始匹配：未连接则先连接，连上后自动入队 */
function startMatch() {
  ensureAudioCtx(); // 首次用户交互时解锁音频上下文
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    searching = true;
    matchView.showConnecting();
    connect();
    return;
  }

  searching = true;
  matchView.showWaiting();
  sendMessage({ type: 'match_request' });
}

/** 取消匹配：队列中则发 match_cancel，否则直接回首页（PVP-02） */
function cancelMatch() {
  if (socket && socket.readyState === WebSocket.OPEN && searching) {
    matchView.showCancelling();
    sendMessage({ type: 'match_cancel' });
    return;
  }
  searching = false;
  matchView.hide();
  window.Gomoku.router.navigate('home');
}

/** 对局结束原因文案（按胜负区分） */
const RESULT_REASON_TEXT = {
  win: { won: '你率先连成五子，赢下本局', lost: '对手率先连成五子，你落败' },
  timeout: { won: '对手超时未落子，你获胜', lost: '你超时未落子，判负' },
  disconnect: { won: '对手断线，你获胜', lost: '你已断线，判负' },
};

/** 显示对局结果弹窗，以服务端下发的 winner/reason 为准 */
function showResultPanel(winner, reason) {
  const won = winner === myColor;
  const text = RESULT_REASON_TEXT[reason] || {
    won: '对局结束，你获胜',
    lost: '对局结束，你落败',
  };

  resultTitleEl.textContent = won ? '你赢了' : '你输了';
  resultTitleEl.dataset.state = won ? 'win' : 'lose';
  resultMessageEl.textContent = won ? text.won : text.lost;
  resultButtonEl.textContent = '知道了'; // 人机结算会改为「再来一局」，联机恢复默认
  const resultHomeBtn = document.getElementById('result-home-button');
  if (resultHomeBtn) resultHomeBtn.hidden = true;
  resultOverlayEl.hidden = false;
}

/** 隐藏对局结果弹窗 */
function hideResultPanel() {
  resultOverlayEl.hidden = true;
}

resultButtonEl.addEventListener('click', () => {
  // 人机对局的结果浮层由 ai-game.js 自行处理（T3-6）
  if (window.Gomoku.router && window.Gomoku.router.currentName() === 'game') return;
  hideResultPanel();
  if (!inGame) {
    // 对局已结束：回到匹配入口，便于直接开始下一局
    matchView.showReady();
  }
});

function connect() {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }

  // 启动及重试均只更新状态，不弹 alert，也不自动循环重连（自动恢复由 T5-5 交付）。
  setStatus('连接中…', 'connecting');
  if (!inGame && !searching) matchView.showConnecting();
  const ws = new WebSocket(WS_URL);
  socket = ws;

  ws.addEventListener('open', () => {
    if (socket !== ws) return;
    console.log('[ws] connected:', WS_URL);
    setStatus('已连接', 'online');
    if (searching) {
      matchView.showWaiting();
      sendMessage({ type: 'match_request' });
    } else if (!inGame) {
      matchView.showReady();
    }
  });

  ws.addEventListener('close', () => {
    if (socket !== ws) return;
    console.log('[ws] disconnected');
    socket = null;
    setStatus('已断开', 'offline');
    searching = false;
    if (!inGame) {
      matchView.showFailed('无法连接 ' + WS_URL + '，可重试连接；人机模式不受影响');
    }
  });

  ws.addEventListener('error', () => {
    if (socket !== ws) return;
    console.error('[ws] connection error:', WS_URL);
    setStatus('连接失败', 'offline');
  });

  ws.addEventListener('message', (event) => {
    if (socket !== ws) return;
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

boardView.render();
connect();

/** 从人机对局返回联机页时，恢复 PvP 的棋盘引用与点击回调（T3-6） */
function activatePvpBoard() {
  boardView.setBoard(board);
  boardView.onMove(handleMoveIntent);
  const roundTimeEl = document.getElementById('round-time');
  if (roundTimeEl) roundTimeEl.hidden = true;
  countdownEl.title = '回合剩余时间';
  updateTurnLabel();
  boardView.render();
}
window.Gomoku.activatePvpBoard = activatePvpBoard;
