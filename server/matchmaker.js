'use strict';

const { send } = require('./protocol');
const { Board } = require('./board');
const { startTurnTimer } = require('./game');

/**
 * 匹配队列与房间管理。
 * 规则：先进队列者执黑（先手），凑齐 2 人即创建房间并下发 match_success。
 */
class Matchmaker {
  constructor() {
    this.queue = [];
    this.rooms = new Map(); // roomId -> { id, players: [{ ws, color }] }
    this.nextRoomId = 1;
  }

  enqueue(ws) {
    if (ws.roomId) {
      send(ws, { type: 'error', message: '已在对局中' });
      return;
    }
    if (this.queue.includes(ws)) {
      send(ws, { type: 'match_waiting' });
      return;
    }

    this.queue.push(ws);

    if (this.queue.length < 2) {
      send(ws, { type: 'match_waiting' });
      return;
    }

    this.createRoom(this.queue.shift(), this.queue.shift());
  }

  /** 连接断开时移出匹配队列（房间清理由对局逻辑处理） */
  remove(ws) {
    const index = this.queue.indexOf(ws);
    if (index !== -1) this.queue.splice(index, 1);
  }

  /** 销毁房间并清除双方房间标记（断线时调用） */
  destroyRoom(room) {
    for (const player of room.players) {
      player.ws.roomId = null;
    }
    this.rooms.delete(room.id);
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

    for (const player of room.players) {
      send(player.ws, { type: 'match_success', roomId: id, color: player.color });
    }

    // 黑方先手，开局即启动首回合 5 分钟倒计时并广播 turn_start
    startTurnTimer(room);

    console.log(
      `[${new Date().toISOString()}] match created ${id}: client#${first.clientId}(black) vs client#${second.clientId}(white)`
    );

    return room;
  }
}

module.exports = { Matchmaker };
