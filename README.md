# 五子棋联机对战游戏

两名玩家实时联机的自由五子棋（15×15、无禁手、无悔棋）。采用 C/S 架构：服务端维护权威棋盘并负责落子校验、五连判定、回合超时判负与断线判负；客户端只负责渲染棋盘、上报落子与展示状态，不自行判定胜负。

## 技术栈

| 端 | 技术 |
|----|------|
| 服务端 | Node.js（>= 18）+ [ws](https://github.com/websockets/ws)（WebSocket，JSON 消息） |
| 客户端 | 原生 HTML + Canvas + 原生 JavaScript（零依赖、无需构建） |

## 目录结构

```
gomoku/
├── server/              # 服务端（Node.js）
│   ├── package.json     # 依赖与启动脚本
│   ├── server.js        # WebSocket 服务入口：连接管理、消息分发、房间清理
│   ├── matchmaker.js    # 匹配队列与房间创建/销毁
│   ├── board.js         # 权威棋盘数据结构
│   ├── game.js          # 落子校验、落子广播、胜负判定、回合计时、断线处理
│   └── protocol.js      # JSON 消息序列化/解析
├── client/              # 客户端（静态页面，零依赖）
│   ├── index.html       # 页面结构（棋盘、匹配浮层、结果弹窗）
│   ├── style.css        # 页面样式
│   ├── app.js           # 入口：连接、渲染、点击落子、消息处理、倒计时
│   └── board.js         # 独立棋盘绘制模块（当前页面使用 app.js 内置绘制）
├── docs/                # 文档
├── spec.md              # 需求规格
├── task.md              # 任务列表
└── checklist.md         # 验收清单
```

## 环境要求

- Node.js >= 18 与 npm。

  > 本机说明：Node.js 便携版位于 `C:\Users\81577\.local\nodejs`，已加入用户级 `PATH`。
  > 若新开终端提示找不到 `node`，请重启终端/IDE，或临时执行：
  > `$env:Path = "C:\Users\81577\.local\nodejs;" + $env:Path`

## 启动步骤

1. 启动服务端（默认监听 `ws://localhost:3000`）

   ```powershell
   cd server
   npm install
   npm start
   ```

   如需更换端口，可通过环境变量指定（同时需同步修改 `client/app.js` 中的 `WS_URL`）：

   ```powershell
   $env:PORT = "3000"; npm start
   ```

2. 启动客户端静态服务（任选一种方式，以下以 8080 端口为例）

   ```powershell
   npx serve client -l 8080
   ```

   也可使用 VS Code Live Server 等任意静态服务器。

3. 打开两个浏览器窗口（或普通窗口 + 隐身窗口）访问 `http://localhost:8080`，双方各自点击「开始匹配」，即可进入同一对局。

> 说明：客户端通过 `ws://localhost:3000` 连接服务端，见 `client/app.js` 顶部 `WS_URL`。

## 通信协议

WebSocket + JSON，所有消息均为带 `type` 字段的对象。

### 客户端 → 服务端

| 消息 | 字段 | 说明 |
|------|------|------|
| `match_request` | 无 | 请求进入匹配队列；先入队者执黑 |
| `move` | `row`、`col`（0–14 整数） | 请求在指定交叉点落子 |

### 服务端 → 客户端

| 消息 | 字段 | 说明 |
|------|------|------|
| `match_waiting` | 无 | 已进入匹配队列，等待对手 |
| `match_success` | `roomId`、`color`（`black`/`white`） | 匹配成功，下发房间号与己方颜色 |
| `turn_start` | `color`、`deadline`（毫秒时间戳）、`remainingMs` | 新回合开始，客户端据此倒计时 |
| `move` | `row`、`col`、`color` | 服务端确认并广播的落子（权威状态） |
| `move_rejected` | `reason`、`message` | 落子被拒绝，仅发给发起方；`reason` 见下表 |
| `game_over` | `winner`（`black`/`white`）、`reason`、`positions`（仅五连时） | 对局结束，广播给双方 |
| `opponent_disconnected` | `color` | 对手断线通知 |
| `error` | `message` | 非法消息、重复匹配等错误提示 |

`move_rejected.reason` 取值：

| reason | 含义 |
|--------|------|
| `not_in_room` | 当前不在对局中 |
| `game_over` | 对局已结束 |
| `out_of_range` | 坐标越界或不是 0–14 的整数 |
| `occupied` | 该位置已有棋子 |
| `not_your_turn` | 尚未轮到该玩家落子 |

`game_over.reason` 取值：`win`（五连）、`timeout`（回合超时）、`disconnect`（一方断线）。

### 消息示例

```jsonc
// 匹配成功（己方执黑）
{ "type": "match_success", "roomId": "room-1", "color": "black" }

// 回合开始，5 分钟截止
{ "type": "turn_start", "color": "black", "deadline": 1763100000000, "remainingMs": 300000 }

// 落子同步
{ "type": "move", "row": 7, "col": 7, "color": "black" }

// 落子被拒绝
{ "type": "move_rejected", "reason": "occupied", "message": "该位置已有棋子" }

// 五连结束
{ "type": "game_over", "winner": "black", "reason": "win", "positions": [[7,3],[7,4],[7,5],[7,6],[7,7]] }
```

> 说明：服务端不下发整盘 `game_state` 快照；客户端在 `match_success` 时清空本地棋盘，此后依据逐手 `move` 消息同步。对局结束（五连/超时/断线）后服务端会销毁房间并清除双方对局标记，双方可立即重新匹配。

## 游戏规则要点

- 棋盘固定 15×15，交叉点落子，黑棋先手（先入队者执黑）。
- 每回合限时 5 分钟，超时判负。
- 横向/纵向/两条对角线任一方向连成 5 子即胜。
- 一方断线判负，对局终止。
- 无禁手、无悔棋。

## 交付物

- 服务端源码：`server/`
- 客户端源码：`client/`
- 启动说明：本 README
- 规范文档：`spec.md`、`task.md`、`checklist.md`
