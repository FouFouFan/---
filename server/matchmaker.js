'use strict';

const { send } = require('./protocol');
const { Board } = require('./board');
const { startTurnTimer } = require('./game');
const { sanitizeProfile } = require('./profile');

/** 协议版本：v2 新增 opponent / protocolVersion / match_cancel（spec 7.1） */
const PROTOCOL_VERSION = 2;
/** 房间上限：满足 NFR-04「≥32 并发房间」并留出余量 */
const MAX_ROOMS = 64;
/** 队列上限：满足 NFR-04「≥100 并发连接」 */
const MAX_QUEUE = 100;

/**
 * 匹配队列与房间管理（T4-2 / PVP-02~05）。
 * 规则：FIFO，先进队列者执黑（先手）；同一连接最多一条队列记录；
 * 取消/断线自动出队；房间清理幂等；匹配成功下发对手档案（已裁剪）。
 */
class Matchmaker {
  constructor(options = {}) {
    this.queue = []; // ws[]，按入队顺序
    this.rooms = new Map(); // roomId -> room
    this.nextRoomId = 1;
    this.maxRooms = options.maxRooms || MAX_ROOMS;
    this.maxQueue = options.maxQueue || MAX_QUEUE;
  }

  /** 队列位次（1 起），不在队列返回 0 */
  positionOf(ws) {
    const index = this.queue.indexOf(ws);
    return index === -1 ? 0 : index + 1;
  }

  /**
   * 请求匹配（幂等）：重复发送只回 match_waiting，不新增队列记录。
   * @param {object} ws 连接
   * @param {{playerId?:string, nickname?:string, avatarId?:string}} [profile] 客户端档案（服务端裁剪）
   * @returns {object|null} 凑齐两人时返回新房间，否则 null
   */
  enqueue(ws, profile) {
    if (ws.roomId) {
      send(ws, { type: 'error', code: 'already_in_room', message: '已在对局中' });
      return null;
    }

    const position = this.positionOf(ws);
    if (position) {
      send(ws, { type: 'match_waiting', position });
      return null;
    }

    if (this.queue.length >= this.maxQueue) {
      send(ws, { type: 'error', code: 'server_busy', message: '匹配队列已满，请稍后再试' });
      return null;
    }
    if (this.rooms.size >= this.maxRooms) {
      send(ws, { type: 'error', code: 'server_busy', message: '房间数已达上限，请稍后再试' });
      return null;
    }

    ws.profile = sanitizeProfile(profile);
    this.queue.push(ws);

    if (this.queue.length < 2) {
      send(ws, { type: 'match_waiting', position: this.queue.length });
      return null;
    }

    // FIFO：先入队者执黑
    const first = this.queue.shift();
    const second = this.queue.shift();
    return this.createRoom(first, second);
  }

  /**
   * 取消匹配（PVP-02）：出队并回 match_cancelled；已不在队列时同样回执（幂等）。
   * 已进入对局则拒绝，避免误销毁进行中的房间。
   */
  cancel(ws) {
    if (ws.roomId) {
      send(ws, { type: 'error', code: 'already_in_room', message: '对局已开始，无法取消匹配' });
      return false;
    }
    const removed = this.remove(ws);
    send(ws, { type: 'match_cancelled' });
    return removed;
  }

  /** 连接断开/取消时移出匹配队列（房间清理由对局逻辑处理） */
  remove(ws) {
    const index = this.queue.indexOf(ws);
    if (index === -1) return false;
    this.queue.splice(index, 1);
    return true;
  }

  /** 销毁房间并清除双方房间标记；重复调用安全（PVP-05） */
  destroyRoom(room) {
    if (!room || !this.rooms.has(room.id)) return false;
    for (const player of room.players) {
      player.ws.roomId = null;
      player.ws.color = null;
    }
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
        { ws: first, color: 'black' },
        { ws: second, color: 'white' },
      ],
    };

    this.rooms.set(id, room);

    for (const player of room.players) {
      player.ws.roomId = id;
      player.ws.color = player.color;
    }

    // PVP-04：双方各收到对手信息（已裁剪，仅展示用）
    for (const player of room.players) {
      const opponent = room.players.find((p) => p !== player);
      send(player.ws, {
        type: 'match_success',
        roomId: id,
        color: player.color,
        protocolVersion: PROTOCOL_VERSION,
        opponent: opponent.ws.profile || sanitizeProfile(null),
      });
    }

    // 黑方先手，开局即启动首回合 5 分钟倒计时并广播 turn_start
    startTurnTimer(room);

    console.log(
      `[${new Date().toISOString()}] match created ${id}: client#${first.clientId}(black) vs client#${second.clientId}(white)`
    );

    return room;
  }
}

module.exports = { Matchmaker, PROTOCOL_VERSION, MAX_ROOMS, MAX_QUEUE };
