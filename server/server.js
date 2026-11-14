'use strict';

const { WebSocketServer } = require('ws');
const { parse, send } = require('./protocol');
const { Matchmaker } = require('./matchmaker');

const PORT = Number(process.env.PORT) || 3000;

const wss = new WebSocketServer({ port: PORT });
const matchmaker = new Matchmaker();

let nextClientId = 1;

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

wss.on('listening', () => {
  log(`WebSocket server listening on ws://localhost:${PORT}`);
});

wss.on('connection', (ws, req) => {
  ws.clientId = nextClientId++;
  ws.isAlive = true;

  log(`client#${ws.clientId} connected from ${req.socket.remoteAddress}:${req.socket.remotePort}`);

  ws.on('message', (raw) => {
    const msg = parse(raw);
    if (!msg) {
      send(ws, { type: 'error', message: '无效的消息格式' });
      return;
    }

    switch (msg.type) {
      case 'match_request':
        log(`client#${ws.clientId} requests match`);
        matchmaker.enqueue(ws);
        break;
      default:
        send(ws, { type: 'error', message: `未知消息类型: ${msg.type}` });
    }
  });

  ws.on('close', (code, reason) => {
    matchmaker.remove(ws);
    log(`client#${ws.clientId} disconnected (code=${code}, reason=${reason.toString() || '-'})`);
  });

  ws.on('error', (err) => {
    log(`client#${ws.clientId} error: ${err.message}`);
  });
});

wss.on('error', (err) => {
  log(`server error: ${err.message}`);
});

process.on('SIGINT', () => {
  log('shutting down...');
  wss.close(() => process.exit(0));
});
