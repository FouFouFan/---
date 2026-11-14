'use strict';

/**
 * 发送 JSON 消息。ws 已关闭时静默忽略。
 */
function send(ws, message) {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(message));
}

/**
 * 解析客户端消息，失败返回 null。
 */
function parse(raw) {
  try {
    const data = JSON.parse(raw.toString());
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

module.exports = { send, parse };
