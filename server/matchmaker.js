'use strict';

const { send } = require('./protocol');
const { Board } = require('./board');
const { startTurnTimer, clearTurnTimer } = require('./game');
const { sanitizeProfile } = require('./profile');

/** 协议版本（PVP-04：match_success 下发 protocolVersion） */
const PROTOCOL_VERSION = 2;

/** 队列上限（PVP-09 / NFR-04：≥100 并发连接；超限回 server_busy） */
const QUEUE_LIMIT = 100;

/**
 * 匹配队列与房间管理。
 * 规则：FIFO；先入队者执黑（先手）；同一连接最多一条队列记录；
 * 取消/断线自动出队；房间结束自动清理且清理幂等。
 */
class Matchmaker {
  constructor(options = {}) {
    this.queue = []; // [{ ws, profile }]
    this.rooms = new Map(); // roomId -> { id, players: [{ ws, color, profile }] }
    this.nextRoomId = 1;
    this.queueLimit = options.queueLimit || QUEUE_LIMIT;
    this.turnDurationMs = options.turnDurationMs; // 仅测试传入更短时限
  }

  /** 队列位次（1 起）；不在队列返回 0 */
  positionOf(ws) {
    const index = this.queue.findIndex((entry) => entry.ws === ws);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * 请求入队。重复请求幂等（回 match_waiting），队列满回 server_busy。
   * @param {object} ws WebSocket 连接
   * @param {unknown} [rawProfile] match_request.profile，服务端裁剪后仅存白名单字段
   */
  enqueue(ws, rawProfile) {
    if (ws.roomId && this.rooms.has(ws.roomId)) {
      send(ws, { type: 'error', code: 'already_in_game', message: '已在对局中' });
      return null;
    }

    const queued = this.queue.find((entry) => entry.ws === ws);
    if (queued) {
      send(ws, { type: 'match_waiting', position: this.positionOf(ws) });
      return queued;
    }

    if (this.queue.length >= this.queueLimit) {
      send(ws, { type: 'error', code: 'server_busy', message: '排队人数已满，请稍后再试' });
      return null;
    }

    const entry = { ws, profile: sanitizeProfile(rawProfile) };
    this.queue.push(entry);

    if (this.queue.length < 2) {
      send(ws, { type: 'match_waiting', position: this.positionOf(ws) });
      return entry;
    }

    this.createRoom(this.queue.shift(), this.queue.shift());
    return entry;
  }

  /** 取消匹配：出队并回 match_cancelled；未在队列时同样回执（幂等） */
  cancel(ws) {
    const removed = this.dequeue(ws);
    send(ws, { type: 'match_cancelled' });
    return removed;
  }

  /** 连接断开时移出匹配队列（房间清理由对局逻辑处理） */
  remove(ws) {
    return this.dequeue(ws);
  }

  dequeue(ws) {
    const index = this.queue.findIndex((entry) => entry.ws === ws);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }

  /** 清理房间：幂等，重复调用直接返回 false */
  cleanupRoom(room) {
    if (!room || !this.rooms.has(room.id)) return false;

    clearTurnTimer(room);
    for (const player of room.players) {
      player.ws.inGame = false;
      player.ws.roomId = null;
      player.ws.color = null;
    }
    room.board = null;
    room.turn = null;
    this.rooms.delete(room.id);
    return true;
  }

  createRoom(first, second) {
    const id = `room-${this.nextRoomId++}`;
    const room = {
      id,
      board: new Board(), // 权威棋盘，开局为空
      turn: 'black', // 黑方先手
      finished: false, // 对局是否已结束
      players: [
        { ws: first.ws, color: 'black', profile: first.profile },
        { ws: second.ws, color: 'white', profile: second.profile },
      ],
    };
    room.onEnd = () => this.cleanupRoom(room);

    this.rooms.set(id, room);

    for (const player of room.players) {
      player.ws.roomId = id;
      player.ws.color = player.color;
      player.ws.inGame = true;
    }

    for (const player of room.players) {
      const opponent = room.players.find((p) => p !== player);
      send(player.ws, {
        type: 'match_success',
        roomId: id,
        color: player.color,
        protocolVersion: PROTOCOL_VERSION,
        opponent: opponent.profile, // 仅白名单字段，不含 avatarDataUrl
      });
    }

    // 黑方先手，开局即启动首回合倒计时并广播 turn_start
    startTurnTimer(room, this.turnDurationMs);

    console.log(
      `[${new Date().toISOString()}] match created ${id}: client#${first.ws.clientId}(black) vs client#${second.ws.clientId}(white)`
    );

    return room;
  }
}

module.exports = { Matchmaker, PROTOCOL_VERSION, QUEUE_LIMIT };
