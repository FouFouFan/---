'use strict';

/**
 * 客户端入口（T2-1）：建立与游戏服务端的 WebSocket 连接并展示连接状态。
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

connect();
