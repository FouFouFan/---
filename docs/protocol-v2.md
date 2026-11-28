# 通信协议 v2

> 对应 `spec.md` 第 7 章（v2.0 规划稿）。
> 实现位置：`server/protocol.js`、`server/server.js`、`server/matchmaker.js`、`server/game.js`、`server/profile.js`。
> 传输：WebSocket + JSON 文本帧；单条消息 ≤ 8KB。

## 1. 原则

- 每条消息必带 `type`；**只增不改**：新增字段不影响旧字段语义，旧客户端可忽略未知字段。
- 服务端权威：PvP 的落子合法性、胜负、超时、断线、认输均以服务端广播为准。
- 时间戳与期限单位为毫秒；颜色枚举 `black` / `white`；坐标 `row`、`col` 为 0–14 整数。
- 档案仅用于展示，不作鉴权依据（Phase 2 由 JWT 提供身份）。

## 2. 客户端 → 服务端

| 消息 | 字段 | 说明 | 版本 |
|------|------|------|------|
| `match_request` | `profile?`：`{playerId, nickname, avatarId}` | 请求入队；可重复发送（幂等） | v2 新增 `profile` |
| `match_cancel` | 无 | 退出匹配队列 | v2 新增 |
| `move` | `row`、`col` | 请求落子 | v1 |
| `resign` | 无 | 认输 | v2 新增（P1） |
| `auth` | `token` | Phase 2 预留，本期不发送 | Phase 2 |

补充约定：

- `match_request` 已在对局中 → 回 `error{code:"already_in_game"}`；已在队列 → 回 `match_waiting`（幂等，不重复占位）。
- `match_cancel` 未在队列时同样回 `match_cancelled`（幂等）。
- `resign` 在对局外或对局已结束 → 忽略，不再广播 `game_over`。

## 3. 服务端 → 客户端

| 消息 | 字段 | 说明 | 版本 |
|------|------|------|------|
| `match_waiting` | `position?` | 已入队；`position` 为队列位次（从 1 起） | v1 + 可选字段 |
| `match_success` | `roomId`、`color`、`protocolVersion`、`opponent?` | 匹配成功；`opponent` 为 `{playerId, nickname, avatarId}` | v2 新增字段 |
| `match_cancelled` | 无 | 已退出队列 | v2 新增 |
| `turn_start` | `color`、`deadline`、`remainingMs` | 新回合开始（含开局首回合与每次落子后） | v1 |
| `move` | `row`、`col`、`color` | 权威落子广播 | v1 |
| `move_rejected` | `reason`、`message` | 仅发发起方 | v1 |
| `game_over` | `winner`、`reason`、`positions?` | `winner` 可为 `null`（和棋） | v2 扩展 `null` / `draw` / `resign` |
| `opponent_disconnected` | `color` | 对手断线通知 | v1 |
| `error` | `code`、`message` | 错误提示 | v2 新增 `code` |

字段说明：

- `color`：己方执子，`black` 先手。
- `protocolVersion`：当前固定 `2`。
- `opponent`：服务端裁剪后的档案；`playerId` 非法时为 `null`（匿名）。
- `game_over.reason`：`win` / `timeout` / `disconnect` / `resign` / `draw`。
- `game_over.positions`：仅 `reason="win"` 时携带五连坐标数组 `[[row, col], ...]`。
- `move_rejected.reason`：`not_in_room` / `game_over` / `out_of_range` / `occupied` / `not_your_turn`。
- `turn_start.remainingMs`：本回合时限（默认 300000，即 5 分钟）。

## 4. 示例

```jsonc
// 入队（v2 带档案；v1 可省略 profile）
{ "type": "match_request",
  "profile": { "playerId": "gm_k3f9a2x7q1z0", "nickname": "枫客-q1z0", "avatarId": "maple" } }

// 等待中（第 1 位）
{ "type": "match_waiting", "position": 1 }

// 匹配成功（己方执黑）
{ "type": "match_success", "roomId": "room-7", "color": "black",
  "protocolVersion": 2,
  "opponent": { "playerId": "gm_9m2b1c8d4e5f", "nickname": "竹影", "avatarId": "bamboo" } }

// 回合开始
{ "type": "turn_start", "color": "black", "deadline": 1763700300000, "remainingMs": 300000 }

// 落子广播
{ "type": "move", "row": 7, "col": 7, "color": "black" }

// 五连结束
{ "type": "game_over", "winner": "black", "reason": "win",
  "positions": [[7, 3], [7, 4], [7, 5], [7, 6], [7, 7]] }

// 和棋
{ "type": "game_over", "winner": null, "reason": "draw" }

// 认输（对手视角）
{ "type": "game_over", "winner": "white", "reason": "resign" }

// 断线（留在房间的一方视角）
{ "type": "opponent_disconnected", "color": "white" }

// 限流
{ "type": "error", "code": "rate_limited", "message": "消息过于频繁，请稍后再试" }
```

## 5. 兼容矩阵

| 客户端 | 服务端 | 结果 |
|--------|--------|------|
| v1 | v2 | 可对局；忽略新字段；无取消、无对手信息（显示「对手」）、无和棋/认输 |
| v2 | v1 | 可对局；`opponent` 缺失时显示「对手」；取消按钮提示不支持；心跳/限流缺失 |
| v2 | v2 | 全功能 |

服务端兼容措施：

- `match_request` 不带 `profile` 时按匿名默认档案处理（`{playerId:null, nickname:"棋客", avatarId:"maple"}`）。
- 新增字段均为可选，v1 客户端可安全忽略。

## 6. 错误码

| code | 含义 |
|------|------|
| `invalid_message` | JSON 解析失败或非对象 |
| `unknown_type` | 未知消息类型 |
| `already_in_game` | 已在对局中 |
| `already_in_queue` | 已在队列中（通常以幂等 `match_waiting` 响应；保留给冲突场景） |
| `not_in_room` | 不在房间内 |
| `invalid_profile` | 档案字段非法（服务端会降级为匿名，不阻断匹配） |
| `rate_limited` | 超过消息频率限制 |
| `server_busy` | 房间数达到上限 |
| `auth_required` | Phase 2：需要登录 |
| `auth_failed` | Phase 2：token 无效/过期 |

## 7. 服务端档案校验

- `playerId`：匹配 `/^gm_[a-z0-9]{6,20}$/`，否则视为匿名（输出 `null`）。
- `nickname`：字符串，去除 C0/C1 控制字符与首尾空白后裁剪到 24 个 UTF-16 单元；空则 `棋客`。
- `avatarId`：必须属于 8 个预设值（`maple`、`bamboo`、`plum`、`pine`、`crane`、`moon`、`mountain`、`stream`），否则 `maple`。
- 忽略并**不转发** `avatarDataUrl` 或任何未知字段；单条消息 ≤ 8KB。
- 档案仅用于展示，不作为鉴权依据（Phase 2 由 JWT 提供身份）。

## 8. 连接与防护参数

| 项目 | 取值 | 行为 |
|------|------|------|
| 单条消息上限 | 8192 字节 | 超限由 `ws` 直接关闭连接（close code 1009） |
| 消息频率 | 20 条 / 5 秒（每连接） | 超限回 `error{code:"rate_limited"}`，该条不进入业务处理 |
| 心跳 | 每 30 秒 `ping` | 连续 2 次未收到 `pong` 即 `terminate`，按断线判负并通知对手 |
| 匹配队列上限 | 100 | 超出回 `error{code:"server_busy"}` |
| 回合计时 | 5 分钟/回合 | 超时判当前回合方负，`reason:"timeout"` |
| 房间清理 | 对局结束即清理 | 清理幂等，双方可立即重新匹配 |
