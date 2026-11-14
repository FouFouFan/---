'use strict';

const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;

const wss = new WebSocketServer({ port: PORT });

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

  ws.on('close', (code, reason) => {
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
