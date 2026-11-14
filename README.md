# 五子棋联机对战游戏

两名玩家实时联机的自由五子棋（15×15、无禁手、无悔棋）。采用 C/S 架构：服务端维护权威棋盘并负责落子校验、五连判定、回合超时判负与断线判负；客户端只负责渲染棋盘、上报落子与展示状态。

## 技术栈

| 端 | 技术 |
|----|------|
| 服务端 | Node.js（>= 18）+ [ws](https://github.com/websockets/ws)（WebSocket，JSON 消息） |
| 客户端 | 原生 HTML + Canvas + 原生 JavaScript（零依赖、无需构建） |

## 目录结构

```
gomoku/
├── server/          # 服务端（Node.js）
│   ├── package.json
│   └── ...
├── client/          # 客户端（静态页面，后续由服务端或本地静态服务器托管）
├── docs/            # 文档
├── spec.md          # 需求规格
├── task.md          # 任务列表
└── checklist.md     # 验收清单
```

## 环境要求

- Node.js >= 18 与 npm。

  > 本机说明：Node.js 便携版位于 `C:\Users\81577\.local\nodejs`，已加入用户级 `PATH`。
  > 若新开终端提示找不到 `node`，请重启终端/IDE，或临时执行：
  > `$env:Path = "C:\Users\81577\.local\nodejs;" + $env:Path`

## 启动步骤

> 待完善：服务端与客户端实现后补充具体命令。

1. 启动服务端
   ```powershell
   cd server
   npm install
   npm start
   ```
2. 启动客户端（待实现）
3. 打开两个客户端实例完成匹配

## 通信协议

WebSocket + JSON，消息类型见 [spec.md](spec.md) 第 4 节：`match_request`、`match_success`、`move`、`move_rejected`、`game_state`、`turn_start`、`game_over`、`opponent_disconnected`。

> 待完善：实现后在此补充各消息字段说明与示例。

## 游戏规则要点

- 棋盘 15×15，交叉点落子，黑棋先手。
- 每回合限时 5 分钟，超时判负。
- 横向/纵向/两条对角线任一方向连成 5 子即胜。
- 一方断线判负，对局终止。

## 交付物

- 服务端源码：`server/`
- 客户端源码：`client/`
- 启动说明：本 README
- 规范文档：`spec.md`、`task.md`、`checklist.md`
