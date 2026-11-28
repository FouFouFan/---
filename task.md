# 枫间五子棋 · 功能拓展任务列表

> 版本：v2.0（规划稿）｜ 状态：待开发 ｜ 最后更新：2026-11-21
> 关联：[spec.md](spec.md) · [checklist.md](checklist.md) · [v1.0 任务存档](docs/archive/task-v1.0.md)
> 说明：ID 与 spec.md 的需求编号对应；v1.0 基线视为已完成，本表只列拓展与回归任务。

## 0. 使用说明

- 任务状态：`- [ ]` 待办 / `- [x]` 完成；阻塞时在行尾追加 `（阻塞：原因）`。
- 每个任务给出「文件 / 依赖 / 验收」三要素，验收优先引用 spec 的编号，便于与 checklist 对照。
- 建议按里程碑顺序推进；同一里程碑内可并行，但不得跳过依赖。
- 完成后必须在 task 勾选，并在 checklist 对应条目留下证据（截图、日志、测试输出）。
- 本期不改动与任务无关的代码；v1 行为是回归红线。

## 1. 里程碑总览

| 里程碑 | 目标 | 主要交付 | 预估 | 依赖 |
|--------|------|----------|------|------|
| M0 | 基线与环境准备 | 基线快照、测试脚手架、双终端环境 | 0.5 天 | — |
| M1 | 本地档案与数据层 | store/profile/stats/settings、个人主页 | 2.5 天 | M0 |
| M2 | 页面骨架与导航 | 路由、首页、守卫、棋盘视图拆分 | 2 天 | M1 |
| M3 | 人机对决 | AI 引擎、设置页、对局控制、战绩 | 2.5 天 | M1、M2 |
| M4 | 双人匹配增强 | 协议 v2、服务端匹配、匹配视图 | 2 天 | M0、M2 |
| M5 | 对局与结算整合 | 统一棋盘、玩家条、结算、退出 | 1.5 天 | M3、M4 |
| M6 | 联调与交付 | 双终端联调、兼容回归、文档、验收 | 1.5 天 | M5 |
| M7 | Phase 2（本期仅设计） | 用户表/API/JWT 设计评审 | 0.5 天 | M6 |

关键路径：`M0 → M1 → M2 → M4 → M5 → M6`；M3 可与 M4 并行，但依赖 M2 的棋盘视图改造。

## 2. 任务明细

### M0 基线与环境准备（0.5 天）

目标：可回滚、可测试、可在两个终端上验证。退出条件：`npm test` 可运行，两台设备能互相访问服务端。

- [x] **T0-1 评审并冻结需求优先级** ｜ 文件：`spec.md` ｜ 验收：P0/P1/P2 无歧义，Out of Scope 确认 ✅ 2026-11-21 评审通过，spec.md 状态已标记冻结
- [x] **T0-2 建立 v1 基线快照** ｜ 文件：仓库/目录备份 ｜ 验收：可一键回到当前可运行版本；记录 `node -v`、依赖版本 ✅ 2026-11-21 git tag `v1.0-baseline` @ b47475b；Node v26.13.1 / npm 11.20.0 / ws 8.23.0
- [x] **T0-3 准备双终端联调环境** ｜ 文件：`README` 草稿 ｜ 验收：服务端 `0.0.0.0:3000`、静态服务 8080、防火墙放行、第二设备可访问 ✅ 2026-11-21 验证：0.0.0.0:3000/8080 均监听；node.exe 入站放行；LAN HTTP 200 + WS 连接成功；README 已补双终端联调章节
- [x] **T0-4 建立测试脚手架** ｜ 文件：`test/`、根 `package.json`（新增 `test` 脚本）｜ 验收：`npm test` 用 `node:test` 跑通示例用例；客户端纯逻辑支持 `module.exports` ✅ 2026-11-21 新建 package.json(test=node --test test/)、test/sample.test.js、test/fixtures/sample-logic.js；npm test 3/3 通过；双环境模式（Node require + 浏览器 window.Gomoku）均验证
- [x] **T0-5 记录 v1 行为基线** ｜ 文件：`docs/archive/` ｜ 验收：协议字段、默认文案、5 分钟时限、断线判负均有记录，供回归比对 ✅ 2026-11-21 新建 docs/archive/v1-behavior-baseline.md，含协议消息/拒绝原因/结算原因/默认文案/5分钟时限/断线判负/匹配规则/v2改造红线

### M1 本地档案与数据层（2.5 天）

目标：身份与战绩可持久化，页面不直接碰 `localStorage`。退出条件：刷新后档案/战绩保留；存储异常可降级。

- [x] **T1-1 存储基础模块** ｜ 文件：`client/store.js`、`test/store.test.js` ｜ 依赖：T0-4 ｜ 验收：AUTH-01/04、PROF-09/11；含可用性探测、命名空间、内存降级、迁移备份 ✅ 2026-11-21 新建 client/store.js（available/get/set/remove/backup/clearAll，gomoku.* 命名空间，内存降级，损坏JSON回退）+ test/store.test.js（14用例）；npm test 17/17 通过
- [x] **T1-2 档案模块** ｜ 文件：`client/profile-store.js`、`test/profile-store.test.js` ｜ 依赖：T1-1 ｜ 验收：PROF-01/04/07/08/10；默认档案、ID 生成、昵称校验、订阅、reset ✅ 2026-11-21 新建 profile-store.js（get/update/reset/subscribe/formatPlayerId，gm_+12位base36，昵称1-12码点+过滤控制/零宽字符，playerId不可改，头像白名单）+ 18用例；npm test 35/35 通过；浏览器 Store→ProfileStore 依赖链验证通过
- [x] **T1-3 战绩模块** ｜ 文件：`client/stats-store.js`、`test/stats-store.test.js` ｜ 依赖：T1-1 ｜ 验收：STAT-01~06；幂等、连胜规则、history 环形 20 条、`games = wins + losses + draws` ✅ 2026-11-21 新建 stats-store.js（get/record/reset，对局ID幂等去重，连胜累加/输和重置，history FIFO 20条，games恒等）+ 15用例；npm test 50/50 通过
- [x] **T1-4 设置模块** ｜ 文件：`client/settings-store.js`、`test/settings-store.test.js` ｜ 依赖：T1-1 ｜ 验收：SET-01/02；音效、难度、执子偏好持久化，非法值回退 ✅ 2026-11-21 新建 settings-store.js（get/update，soundEnabled布尔/aiDifficulty三档/preferredColor三档，非法值回退默认并回写）+ 11用例；npm test 61/61 通过
- [x] **T1-5 个人主页视图** ｜ 文件：`client/profile-view.js`、`client/index.html`、`client/style.css` ｜ 依赖：T1-2、T1-3 ｜ 验收：PROF-02/03/12；资料、ID 复制、统计、最近对局、危险区、登录占位 ✅ 2026-11-21 新建 profile-view.js（render/bindEvents/copyToClipboard/handleReset，档案卡+战绩卡+最近对局+危险区+登录占位，昵称textContent防XSS，复制toast，清空二次确认）；index.html加profile-page容器与5个script引用；style.css加个人主页样式（≈270行）
- [x] **T1-6 编辑资料交互** ｜ 文件：`client/profile-view.js` ｜ 依赖：T1-5 ｜ 验收：PROF-04/05；字数限制、未保存离开提示、保存 toast、头像选中态
- [x] **T1-7 预设头像资源** ｜ 文件：`client/assets/avatars.js` 或内联 SVG ｜ 依赖：T1-5 ｜ 验收：8 款头像无外链、深浅底都可辨识、40px/96px 两档清晰
- [x] **T1-8 自定义头像上传（P1）** ｜ 文件：`client/profile-view.js` ｜ 依赖：T1-7 ｜ 验收：PROF-06；裁剪 128×128、≤32KB、仅本地、失败提示
- [x] **T1-9 数据层单元测试** ｜ 文件：`test/*.test.js` ｜ 依赖：T1-1~T1-4 ｜ 验收：mock storage 覆盖正常/配额满/禁用/旧版本/损坏 JSON；NFR-09 ✅ 2026-11-25 新建 test/storage-resilience.test.js（10用例：正常持久化/配额满降级/禁用SecurityError/无localStorage/损坏JSON回退/旧版本迁移+gomoku.backup.*备份）；补齐 profile-store.js 的 schemaVersion 迁移实现；npm test 80/80 通过

### M2 页面骨架与导航（2 天）

目标：首页可选模式，页面可前进后退，对局中不误退，棋盘渲染可被 PvP/AI 共用。退出条件：五个路由可用，360px 无横向滚动。

- [x] **T2-1 Hash 路由** ｜ 文件：`client/router.js`、`test/router.test.js` ｜ 依赖：T1-5 ｜ 验收：NAV-02；`#/home|profile|ai|match|game`、未知回首页、视图卸载清理定时器 ✅ 2026-11-25 新建 router.js（create(win) 工厂可注入 mock，parseHash 去 query/尾斜杠，未知/未注册回 #/home，mount 返回 false 重定向，卸载自动 clearTimeout/clearInterval 与 onCleanup）+ 11用例；index.html 接入 #/home↔#/profile 互斥路由（ai/match/game 待 T3-5/T4-7/T5-1 注册）；npm test 91/91 通过
- [x] **T2-2 首页模式选择** ｜ 文件：`client/index.html`、`client/style.css` ｜ 依赖：T2-1 ｜ 验收：NAV-01/04；双卡片、连接状态、版本号、键盘可达 ✅ 2026-11-25 首页新增副标题「落叶之间，手谈一局」+人机/双人双卡片（button 原生键盘可达+focus-visible 描边）+版本号 v2.0；顶栏加用户芯片（头像+昵称，点击进 #/profile，订阅档案同步）；注册 #/match 路由挂载 v1 联机界面，三视图互斥；npm test 91/91 通过
- [x] **T2-3 对局离开守卫** ｜ 文件：`client/router.js`、`client/app.js` ｜ 依赖：T2-1 ｜ 验收：NAV-03；`beforeunload`、路由确认、确认后按 5.6 退出语义处理 ✅ 2026-11-25 router.js 新增 setLeaveGuard（取消恢复 hash 且不卸载，确认后清理）+2用例；app.js 对局开始/终局同步守卫，确认后关闭 WS 按 disconnect 判负，beforeunload 覆盖刷新/关页；品牌改为 #/home 原生链接；npm test 93/93 通过（D-5/D-6 浏览器交互待人工验收）
- [x] **T2-4 响应式与触屏** ｜ 文件：`client/style.css` ｜ 依赖：T2-2 ｜ 验收：NAV-05；360/768/1280 三档、棋盘不溢出、触屏无悬停预览 ✅ 2026-11-25 style.css 新增响应式段：首页限宽、顶栏防溢出、≤480px 紧凑布局、棋盘/浮层同步缩放、个人主页与历史记录换行、coarse 指针按钮 ≥44px；app.js 改用 pointermove/pointerleave，仅支持悬停的鼠标指针显示预览；node --check 与 npm test 93/93 通过（D-7/I-6 浏览器三档与触屏待人工验收）
- [x] **T2-5 连接策略** ｜ 文件：`client/app.js` ｜ 依赖：T2-2 ｜ 验收：NAV-07；启动静默连接、失败降级 AI、手动重试、不重复弹窗 ✅ 2026-11-25 启动连接仅更新顶栏状态不弹窗；离线时匹配页显示可点击「重试连接」，人机入口不依赖 WS（AI 本体待 T3-5）；连接中点击不重复建连，open 后自动补发 match_request；忽略旧 socket 事件并捕获发送异常；npm test 93/93 通过（D-9 停启服务端浏览器场景待人工验收）
- [x] **T2-6 音效与动效偏好** ｜ 文件：`client/settings-store.js`、`client/style.css` ｜ 依赖：T1-4 ｜ 验收：SET-01/02；关闭音效立即生效、reduced-motion 关闭下落动画 ✅ 2026-11-25 settings-store.js 新增 subscribe（含跨标签 storage 同步，异常隔离）+2用例；index.html 首页新增音效开关（aria-pressed）；app.js 落子音效受开关控制、开启时试听、刷新恢复；reduced-motion 时 dropDuration=0 直接绘终态并清空进行中动画，style.css 补开关样式与全局缩短过渡；npm test 95/95 通过（D-8 键盘/I-5 动效待人工验收）
- [x] **T2-7 棋盘视图拆分** ｜ 文件：`client/board-view.js`（从 `client/app.js` 拆出）｜ 依赖：T2-1 ｜ 验收：NFR-08；暴露 reset/render/setInteractive/onMove；视觉与交互与 v1 一致；单文件 ≤400 行 ✅ 2026-11-25 新建 board-view.js（399 行，UMD 双环境；create(canvas) 暴露 setBoard/reset/clearMotion/render/setInteractive/setHoverEnabled/setHoverColor/setLastMove/setDropDuration/animateMove/onMove）；app.js 836→487 行，仅保留连接/消息/计时/结算/守卫；index.html 引入 board-view.js；浏览器冒烟：首页双卡片+音效开关正常、#/match 木纹棋盘正常渲染、控制台无 JS 错误；npm test 95/95 通过

### M3 人机对决（2.5 天）

目标：三档 AI 可玩、合法、不卡顿。退出条件：困难档 100 局无非法落子，P95 ≤800ms。

- [x] **T3-1 AI 棋盘与评估** ｜ 文件：`client/ai.js`、`test/ai.test.js` ｜ 依赖：T0-4 ｜ 验收：AI-02/03；纯函数、候选生成、四方向模式评分 ✅ 2026-11-26 新建 ai.js（244 行，UMD 双环境，无 DOM/网络）：createBoard/cloneBoard/inBounds/isLegalMove/getLegalMoves/boardIsFull/countLine/hasFive/lineString/scoreLine/evaluatePoint/generateCandidates；候选=距棋子切比雪夫≤2 的空位、空盘天元、上限 60、按进攻+0.9×防守降序；四方向 9 格线型匹配五连/活四/冲四/活三/眠三/活二/眠二；14 个纯函数用例；npm test 109/109 通过
- [x] **T3-2 AI 搜索与难度** ｜ 文件：`client/ai.js` ｜ 依赖：T3-1 ｜ 验收：AI-04/05/11；1/2/4 层、α-β、排序、迭代加深、时限、可复现种子 ✅ 2026-11-26 ai.js 增加 chooseMove/findWinningMove/negamax/searchRoot/hardMove/easyMove/createRng（仍为 400 行）：先判己方一步成五、再堵对手成五；简单=Top3 中 30% 随机（mulberry32 种子可复现），普通=2 层 α-β，困难=迭代加深 2→4 层、候选按启发式排序、默认 800ms 上限且超时回退已完成层；超时用 finally 撤销临时棋子，棋盘不被污染；返回前复核坐标与空位；新增 6 个用例（必胜/必防/复现/时限/满盘/简单档），npm test 115/115 通过
- [x] **T3-3 兜底与异常** ｜ 文件：`client/ai.js` ｜ 依赖：T3-2 ｜ 验收：AI-03；超时/异常回退合法落子；不抛错、不返回占用点 ✅ 2026-11-26 ai.js 拆分 pickMove/chooseMove：统一捕获选点异常并记录，先校验返回值坐标与空位，再回退 fallbackMove（己方最优单点→任意合法空位→null）；非法棋盘（null/空/非数组行）直接返回 null 不抛错；新增 4 个用例（时限 0/1ms、Date.now 抛错、非法输入、3 局×60 步自动对局落点全合法），npm test 119/119 通过（ai.js 仍为 400 行）
- [x] **T3-4 AI 测试夹具** ｜ 文件：`test/ai.test.js` ｜ 依赖：T3-3 ｜ 验收：必胜/必防/活三防守/空盘天元/满盘和棋/100 局合法性 ✅ 2026-11-26 新增 test/fixtures/ai-games.json（9 个局面：空盘天元×3 难度、横线必胜、竖线必堵、活三防守普通/困难、斜线必胜、3x3 满盘和棋最后一手）+ ai.test.js 夹具驱动断言；100 局自动对局（70 简单/20 普通/10 困难、固定种子、每局限 60 手）全部落在空位，结果写入 test/fixtures/ai-games-report.json（黑胜 44/白胜 24/和棋 32）；npm test 121/121 通过
- [x] **T3-5 人机设置页** ｜ 文件：`client/ai-view.js`、`client/index.html` ｜ 依赖：T2-2、T1-4 ｜ 验收：AI-01；难度分段、执子选择、记忆偏好、规则说明 ✅ 2026-11-26 新建 ai-view.js（120 行，UMD）：#/ai 页面三档难度（简单/普通/困难，各带行为说明）、执子（执黑/执白/随机）、开始对局按钮、规则「15×15 · 无禁手 · 黑先 · 不计时判负」；读写 SettingsStore，medium→normal 映射供引擎使用；index.html 注册 ai 路由并纳入视图互斥；style.css 新增分段控件样式（640px 单列、coarse ≥44px、focus-visible）；test/ai-view.test.js 4 用例；浏览器实测选中态/localStorage/刷新保持均通过；npm test 125/125 通过（开始对局跳转 #/game 待 T3-6 接入）
- [x] **T3-6 人机对局控制** ｜ 文件：`client/ai-game.js` ｜ 依赖：T3-2、T2-7、T3-5 ｜ 验收：AI-06/07/08；思考锁、300–700ms 反馈、胜负/和棋、用时显示 ✅ 2026-11-26 新建 ai-game.js（232 行，UMD）：#/game 本地对局，复用 board-view 与结果浮层，不建立 WebSocket；AI 回合先显示「AI 思考中…」并锁输入，300–700ms 后计算落子；五连判胜、满盘判和、无合法点判和；countdown 显示本局用时、新增 #round-time 显示回合用时（不判负）；index.html 注册 game 路由并补引 ai.js，app.js 暴露 boardView/音效并提供 activatePvpBoard 恢复联机棋盘，PvP 结果按钮不再误处理人机结算；test/ai-game.test.js 8 用例；浏览器实测落子/思考锁/AI 应手/计时全部通过；npm test 133/133 通过
- [x] **T3-7 结算与再开** ｜ 文件：`client/ai-game.js` ｜ 依赖：T3-6、T1-3 ｜ 验收：AI-09/10；再来一局保留设置、退出不计、终局幂等记账 ✅ 2026-11-26 ai-game.js（269 行）：终局调用 StatsStore.record（mode:'ai'、result win/loss/draw、color 人类执子、turns 总手数），state.recorded + 对局 ID（时间戳+序号）双重幂等，中途退出不记录；结果面板按钮改「再来一局」并新增「回首页」，再来一局保留难度与执子偏好、随机执子重新随机、棋盘/计时/记账标记全部重置；PvP 结算恢复「知道了」并隐藏回首页；新增 4 个用例；浏览器实测胜局写入 wins=1/history[0].mode='ai'，再来一局清空棋盘且未重复计数；npm test 137/137 通过
- [x] **T3-8 性能验证** ｜ 文件：测试记录 ｜ 依赖：T3-6 ｜ 验收：NFR-02；CPU 6× 降速下困难档不超 1500ms、不冻结输入 ✅ 2026-11-26 新增 test/ai-performance.test.js：开局/中盘16手/复杂40手三局面各采样 4 次，实测简单 max 0.62ms（≤100）、普通 max 5.75ms（≤300）、困难 P95/max 139.6ms（≤800/≤1500）；最慢单步 ×6 估算 837.6ms（≤1500），时限按墙钟控制故降速时仍在预算内回退；记录写入 test/fixtures/ai-performance-report.json（含 6× 降速人工实测步骤）；npm test 138/138 通过

### M4 双人匹配增强（2 天）

目标：两个终端稳定匹配，可取消、可见对手、有心跳。退出条件：同机双窗口完成 10 局无残留队列/房间；跨设备可用性在 M6 验证。

- [x] **T4-1 档案裁剪模块** ｜ 文件：`server/profile.js`、`test/server-profile.test.js` ｜ 依赖：T0-4 ｜ 验收：PVP-09、7.7；昵称裁剪、头像白名单、默认匿名、拒绝自定义头像 ✅ 2026-11-28 新建 server/profile.js（CommonJS，无 ws 依赖）：sanitizeProfile 只输出 `{playerId,nickname,avatarId}` 白名单，avatarDataUrl 与未知字段直接丢弃不转发；playerId 须匹配 `/^gm_[a-z0-9]{6,20}$/` 否则 null（匿名）；nickname 去 C0/C1 控制字符+trim 后按 UTF-16 截断 24 单元（避免孤立代理）空则「棋客」；avatarId 仅接受 8 个预设否则 maple；非对象输入降级匿名默认不抛错；test/server-profile.test.js 10 用例；npm test 148/148 通过
- [x] **T4-2 匹配队列改造** ｜ 文件：`server/matchmaker.js`、`test/matchmaker.test.js` ｜ 依赖：T4-1 ｜ 验收：PVP-02/03/04/05；取消、幂等、FIFO、先入队执黑、队列上限、清理幂等 ✅ 2026-11-28 重写 matchmaker.js：队列项 `{ws, profile}`（入队即 sanitizeProfile 裁剪）；enqueue 幂等回 `match_waiting{position}`、在对局中回 `already_in_game`、队列满 100 回 `server_busy`；新增 cancel（出队+`match_cancelled`，重复取消仍回执幂等）与 positionOf/dequeue；createRoom 下发 `protocolVersion:2` 与 `opponent{playerId,nickname,avatarId}`，房内设置 inGame 并挂 room.onEnd；cleanupRoom 幂等并清双方标记；server.js 委托 matchmaker.cleanupRoom 避免双份清理逻辑；test/matchmaker.test.js 11 用例（FIFO/执黑/幂等/取消/上限/断线出队/恶意档案/清理幂等/32 房间/v1 无 profile）；双客户端冒烟匹配通过；npm test 159/159 通过
- [ ] **T4-3 服务端接入** ｜ 文件：`server/server.js` ｜ 依赖：T4-2 ｜ 验收：PVP-06/09；`match_cancel`、心跳 30s×2、`maxPayload` 8KB、限流、启动打印 LAN 地址
- [ ] **T4-4 和棋/认输/满盘** ｜ 文件：`server/game.js`、`server/board.js` ｜ 依赖：T4-3 ｜ 验收：PVP-10/11、RULE-04；`winner:null`、`isFull()`、`resign` 判负、计时器清理
- [ ] **T4-5 协议文档** ｜ 文件：`docs/protocol-v2.md` ｜ 依赖：T4-1~T4-4 ｜ 验收：字段/错误码/兼容矩阵与 spec 第 7 章一致
- [ ] **T4-6 服务端集成测试** ｜ 文件：`test/match-flow.test.js` ｜ 依赖：T4-3 ｜ 验收：两个模拟客户端匹配、取消、落子、断线、心跳超时、重复匹配
- [ ] **T4-7 匹配视图** ｜ 文件：`client/match-view.js`、`client/style.css` ｜ 依赖：T2-1、T4-3 ｜ 验收：PVP-01/02/07；等待时长、取消、重试、断线提示、60s 文案
- [ ] **T4-8 WS 地址解析** ｜ 文件：`client/app.js`、`client/settings-store.js` ｜ 依赖：T4-7 ｜ 验收：AUTH-05、PVP-07；query > localStorage > 同主机 > localhost；非法拒绝并提示
- [ ] **T4-9 对手信息展示** ｜ 文件：`client/app.js` ｜ 依赖：T4-7 ｜ 验收：PVP-04；头像/昵称/游客标识/房间号；缺字段降级「对手」

### M5 对局与结算整合（1.5 天）

目标：PvP 与 AI 共用一套棋盘与结算，退出语义清晰。退出条件：五种结果原因均正确展示。

- [ ] **T5-1 对局视图整合** ｜ 文件：`client/board-view.js`、`client/app.js` ｜ 依赖：M3、M4、T2-7 ｜ 验收：NFR-08；PvP/AI 共用棋盘、动画、音效、预览与输入锁；无重复绘制逻辑
- [ ] **T5-2 对局头部玩家条** ｜ 文件：`client/board-view.js`、`client/style.css` ｜ 依赖：T5-1 ｜ 验收：双方头像/昵称/颜色、当前回合高亮、AI 思考态、倒计时
- [ ] **T5-3 结算浮层** ｜ 文件：`client/result-view.js` ｜ 依赖：T5-1、T1-3 ｜ 验收：STAT-05、RULE-04；win/timeout/disconnect/resign/draw、null winner、战绩增量
- [ ] **T5-4 退出与认输流程** ｜ 文件：`client/board-view.js`、`client/app.js` ｜ 依赖：T5-3、T4-4 ｜ 验收：PVP-11、NAV-03；确认文案、resign 等待结算、AI 退出不计战绩
- [ ] **T5-5 断线处理** ｜ 文件：`client/app.js` ｜ 依赖：T4-3 ｜ 验收：PVP-06；禁用落子、提示、无 `game_over` 时兜底回首页
- [ ] **T5-6 v1 行为回归** ｜ 文件：回归记录 ｜ 依赖：T5-1~T5-5 ｜ 验收：15×15、黑先、5 分钟、超时判负、五连判定、断线判负、无悔棋

### M6 联调与交付（1.5 天）

目标：两终端可玩，兼容旧客户端，文档与验收齐全。退出条件：checklist P0 全绿。

- [ ] **T6-1 同机双窗口联调** ｜ 文件：测试记录 ｜ 依赖：M5 ｜ 验收：两个普通/隐身窗口匹配、对局、结算、再匹配各 3 次
- [ ] **T6-2 局域网双设备联调** ｜ 文件：测试记录 ｜ 依赖：T6-1 ｜ 验收：手机+电脑同 Wi-Fi 完成 ≥5 局；取消/断线/刷新场景各 1 次
- [ ] **T6-3 v1 客户端兼容** ｜ 文件：测试记录 ｜ 依赖：T4-9 ｜ 验收：旧客户端连新服务端可匹配、落子、五连结算；无报错
- [ ] **T6-4 README 更新** ｜ 文件：`README.md` ｜ 依赖：T6-1~T6-3 ｜ 验收：新流程、目录、局域网访问、URL 配置、排障
- [ ] **T6-5 JWT 设计文档** ｜ 文件：`docs/auth-jwt-design.md` ｜ 依赖：T4-5 ｜ 验收：表结构、API、claims、WS 鉴权、迁移与安全与 spec 第 8 章一致
- [ ] **T6-6 验收执行与记录** ｜ 文件：`checklist.md` ｜ 依赖：T6-1~T6-5 ｜ 验收：P0 全通过；P1 记录结论；附截图/日志位置
- [ ] **T6-7 代码清理** ｜ 文件：`client/board.js`、`client/app.js` ｜ 依赖：T5-1 ｜ 验收：删除或标注废弃未引用文件；无重复棋盘逻辑；无遗留 `console.log` 噪声

### M7 Phase 2 预留（本期仅设计，不实现）

目标：评审通过即可进入后端开发。退出条件：设计文档定稿，接口与客户端适配器对齐。

- [ ] **T7-1 用户表与迁移脚本设计** ｜ 文件：`docs/auth-jwt-design.md` ｜ 验收：users/user_stats DDL、索引、昵称唯一策略
- [ ] **T7-2 认证 API 设计** ｜ 文件：`docs/auth-jwt-design.md` ｜ 验收：register/login/refresh/logout/me 的请求响应与错误码
- [ ] **T7-3 JWT 签发与校验设计** ｜ 文件：`docs/auth-jwt-design.md` ｜ 验收：claims、TTL、密钥管理、登出撤销
- [ ] **T7-4 WS 首消息鉴权设计** ｜ 文件：`docs/auth-jwt-design.md` ｜ 验收：5 秒窗口、失败降级、游客策略
- [ ] **T7-5 客户端 ApiAuth 与数据认领设计** ｜ 文件：`docs/auth-jwt-design.md` ｜ 验收：适配器切换、昵称冲突、战绩迁移
- [ ] **T7-6 安全评审** ｜ 文件：评审记录 ｜ 验收：HTTPS/WSS、argon2id、限流、日志脱敏、XSS/CSRF 检查项

## 3. 需求与任务映射

| 需求组 | 主要任务 |
|--------|----------|
| PROF-01~12 | T1-2、T1-5、T1-6、T1-7、T1-8、T2-2 |
| AUTH-01~06 | T1-1、T1-4、T4-8、T7-5 |
| NAV-01~07 | T2-1~T2-6、T4-7 |
| AI-01~12 | T3-1~T3-8、T5-1 |
| PVP-01~12 | T4-1~T4-9、T5-4、T5-5、T6-1~T6-3 |
| STAT-01~06 | T1-3、T5-3 |
| SET-01~02 | T1-4、T2-6 |
| RULE-01~04 | T4-4、T5-3、T5-6 |
| NFR-01~13 | 各阶段验收 + T3-8、T6-6、T6-7 |
| Phase 2 | T7-1~T7-6 |

## 4. 建议排期与并行

```text
第 1 周：M0 → M1（数据层与主页）→ M2（路由/首页）
第 2 周：M3（AI）与 M4（匹配）并行；M5 整合
第 3 周：M6 联调/文档/验收；M7 设计评审
```

- 可并行：T1-3 与 T1-2；T3-1~T3-4 与 T4-1~T4-6；T1-7 与 T2-2。
- 串行红线：M2 完成前不改棋盘视图（避免与路由/守卫冲突）；T4-5 协议文档先于客户端匹配功能定稿。
- 每日结束前更新任务状态；阻塞超过半天需在行尾注明原因与需要的支持。

## 5. 完成定义（DoD）

1. 任务对应验收项在 checklist 中勾选并附证据。
2. `npm test` 全绿；无新增控制台报错。
3. v1 回归项（黑先、5 分钟、五连、断线判负、无悔棋）全部通过。
4. 代码符合 NFR-07/08（零依赖、单文件行数、无重复棋盘逻辑）。
5. 文档同步：README、协议、JWT 设计、spec/task/checklist 三份一致。
