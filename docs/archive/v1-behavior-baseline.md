# v1.0 行为基线（回归比对用）

> 用途：v2.0 改造期间，任何协议/玩法/文案变更必须对照本文档确认是否破坏 v1 行为。
> 提取来源：`server/server.js`、`server/matchmaker.js`、`server/game.js`、`server/board.js`、`server/protocol.js`、`client/app.js`、`client/index.html`。
> 提取时间：2026-11-21（T0-5）

## 1. 协议消息（v1）

### 1.1 客户端 → 服务端

| type | 字段 | 说明 |
|------|------|------|
| `match_request` | （无） | 请求入匹配队列；重复入队返回 `match_waiting`；已在对局中返回 `error` |
| `move` | `row`(0–14), `col`(0–14) | 请求落子 |

### 1.2 服务端 → 客户端

| type | 字段 | 说明 |
|------|------|------|
| `match_waiting` | （无） | 已入队，等待对手 |
| `match_success` | `roomId`, `color`(`black`/`white`) | 匹配成功，下发房间号与己方颜色；先入队者执黑 |
| `turn_start` | `color`, `deadline`(ms 时间戳), `remainingMs` | 新回合开始，客户端据此倒计时 |
| `move` | `row`, `col`, `color` | 服务端确认并广播的落子（权威状态） |
| `move_rejected` | `reason`, `message` | 落子被拒绝，仅发给发起方 |
| `game_over` | `winner`(`black`/`white`), `reason`, `positions?`(仅五连) | 对局结束，广播双方 |
| `opponent_disconnected` | `color` | 对手断线通知 |
| `error` | `message` | 无效消息格式 / 未知消息类型 / 已在对局中 |

### 1.3 move_rejected.reason 取值

| reason | 服务端文案（REASON_TEXT） |
|--------|--------------------------|
| `not_in_room` | 不在对局中 |
| `game_over` | 对局已结束 |
| `out_of_range` | 落子坐标超出棋盘范围 |
| `occupied` | 该位置已有棋子 |
| `not_your_turn` | 还没轮到你落子 |

### 1.4 game_over.reason 取值

| reason | 含义 |
|--------|------|
| `win` | 五连获胜，附带 `positions` 坐标数组 |
| `timeout` | 回合超时判负 |
| `disconnect` | 一方断线，断线方负 |

> v1 无 `draw`（和棋）、无 `resign`（认输）；`game_over.winner` 恒为 `black` 或 `white`，不为 `null`。

### 1.5 error.message 取值

| 触发场景 | message |
|----------|---------|
| JSON 解析失败 / 非对象 | 无效的消息格式 |
| 未知 type | 未知消息类型: ${type} |
| 已在对局中再发 match_request | 已在对局中 |

## 2. 规则与时限

| 项 | v1 行为 |
|----|---------|
| 棋盘 | 15×15，交叉点落子，坐标 0–14 |
| 先手 | 黑方（匹配队列先入队者执黑） |
| 禁手 | 无 |
| 悔棋 | 无入口 |
| 回合时限 | **5 分钟**（`TURN_DURATION_MS = 5 * 60 * 1000`），超时判当前回合方负 |
| 超时后 | 广播 `game_over`，winner 为对方，reason=`timeout` |
| 断线处理 | 一方 `ws.close` → 通知对手 `opponent_disconnected` + `game_over`（断线方负，reason=`disconnect`），随后清理房间 |
| 房间清理 | `game_over` 后由 `room.onEnd` 触发 `cleanupRoom`，幂等；清理后双方可立即重新匹配 |
| 五连判定 | 横、竖、主对角线(↘)、副对角线(↗) 四方向，连续 ≥5 同色即胜 |
| 棋盘满 | v1 无和棋检测，225 子填满后状态未定义（v2 需补 draw） |

## 3. 客户端默认文案

### 3.1 连接状态（connection-status）

| 状态 | 文案 | data-state |
|------|------|------------|
| 初始 / 连接中 | 连接中… | `connecting` |
| 已连接 | 已连接 | `online` |
| 连接失败 | 连接失败 | `offline` |

### 3.2 匹配面板（match-overlay）

| 场景 | hint | button | disabled |
|------|------|--------|----------|
| 初始 HTML | 正在连接服务器… | 开始匹配 | true |
| 未连接 | 尚未连接服务器，请稍后重试 | 开始匹配 | true |
| 可匹配 | 点击下方按钮开始匹配对手 | 开始匹配 | false |
| 匹配中 | 正在匹配，等待对手加入… | 匹配中… | true |
| 断线 | 连接已断开，请刷新页面重试 | 开始匹配 | true |

### 3.3 回合提示（turn-label）

| 状态 | 文案 |
|------|------|
| 对局结束 | 对局已结束 |
| 未开局 | 等待开局… |
| 我方回合 | 轮到你落子 |
| 对手回合 | 等待对手落子 |
| 等待服务端确认 | 等待服务端确认… |

### 3.4 结算弹窗（result-overlay）

| reason | 胜方文案 | 负方文案 |
|--------|----------|----------|
| `win` | 你率先连成五子，赢下本局 | 对手率先连成五子，你落败 |
| `timeout` | 对手超时未落子，你获胜 | 你超时未落子，判负 |
| `disconnect` | 对手断线，你获胜 | 你已断线，判负 |
| 其他/未知 | 对局结束，你获胜 | 对局结束，你落败 |

- 标题：胜 = `你赢了`，负 = `你输了`
- 按钮：`知道了`

### 3.5 倒计时

- 初始显示 `5:00`
- `remainingMs <= 30000` 时 `data-state="low"`（红色警告态）

## 4. 匹配与房间

| 项 | v1 行为 |
|----|---------|
| 匹配策略 | FIFO，先入队执黑，凑齐 2 人即开局 |
| 取消匹配 | **无**（v1 不支持，只能刷新页面） |
| 心跳 | **无**（`ws.isAlive` 赋值但未使用，无 ping/pong） |
| 消息大小限制 | **无**（`ws` 默认无 `maxPayload`） |
| 限流 | **无** |
| 档案透传 | **无**（match_request 不带 profile） |
| 房间号格式 | `room-${递增数字}`，如 `room-1` |
| 服务端启动日志 | `WebSocket server listening on ws://localhost:${PORT}` |

## 5. 客户端技术细节

| 项 | v1 行为 |
|----|---------|
| WS_URL | 硬编码 `ws://10.21.174.122:3000`（`client/app.js:443`） |
| 棋盘渲染 | `client/app.js` 内置 Canvas 绘制（`client/board.js` 为未引用历史文件） |
| 落子动画 | 弹性缩放，黑棋 400Hz / 白棋 500Hz 合成音效 |
| 悬停预览 | 半透明预览，越界/占用/非己方回合时清除 |
| 最近一手标记 | 红色圆圈 |

## 6. v2 改造红线（回归比对）

以下 v1 行为在 v2 中**必须保持兼容**（v1 客户端连 v2 服务端仍可正常对局）：

1. 协议消息 `type` 字段语义不变，旧字段不删不改
2. `match_success` 必须含 `roomId`、`color`
3. `move` 必须含 `row`、`col`、`color`
4. `game_over` 必须含 `winner`、`reason`
5. `move_rejected` 必须含 `reason`、`message`
6. 先入队者执黑
7. 5 分钟回合超时判负
8. 断线判负
9. 15×15、黑先、无禁手、无悔棋
10. 五连四方向判定
