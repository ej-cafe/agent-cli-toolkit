## 1. 包与命令骨架

- [x] 1.1 新增 `packages/token-server`（`package.json` 名 `@agent-cli-toolkit/token-server`，scripts `build`/`typecheck` = `tsc -b`，deps 为 `@agent-cli-toolkit/core` 与 `@agent-cli-toolkit/token-config`（均 `workspace:*`），`tsconfig.json` 引用 core / token-config）；在根 `tsconfig.json` 与 `packages/commands/tsconfig.json` 增加项目引用；验证：`pnpm install && pnpm typecheck` 通过
- [x] 1.2 在 `packages/token-config/src/index.ts` 导出 `loadProfiles`、`getProfile`（不改动既有导出与行为）；验证：`pnpm typecheck` 通过，且 `pnpm test` 中既有 token-config 测试不变
- [x] 1.3 实现 `runTokenServerCommand(args)`：分发 `start` / `stop` / `switch <profile>`，`--help`/`-h` 打印用法并退出 0，缺少或未知子命令在 stderr 打印用法并退出 1；在 `packages/commands/src/run.ts` 按 `args[0] === "token-server"` 分派，并像 `token` 一样把 `TokenConfigError` 收敛为 stderr 一行 + 退出 1；验证：`pnpm exec agent-cli token-server --help` 打印用法，`agent-cli token-server bogus` 退出 1

## 2. 激活 profile 与 switch

- [x] 2.1 实现状态模块：`<configDir>/token-server.json` 的 `activeProfile` 读写（原子写；文件缺失、字段缺失或非字符串都视为未设置）；验证：单测覆盖写入后读回、未设置返回 `undefined`、坏内容按未设置处理
- [x] 2.2 实现 `switch <profile>`：先经 `getProfile` 校验存在，成功写盘并退出 0；profile 不存在时报错、退出 1，且原有 `activeProfile` 不被改写；验证：单测（临时 `XDG_CONFIG_HOME`）覆盖成功写入、失败保留原值
- [x] 2.3 `start` 的前置校验：无激活 profile 时报错提示执行 `token-server switch <profile>`、退出 1 且不监听端口；验证：单测断言退出码、错误文案与「未监听」

## 3. 转发服务器

- [x] 3.1 实现 `createTokenServer({ fetchImpl? })`：基于 `node:http`，仅绑定 `127.0.0.1`（监听地址由调用方传入，默认端口 8787），`listen` 失败向调用方抛错；验证：单测以 `listen(0)` 启动后可接受本机请求
- [x] 3.2 实现路径路由：`/anthropic` 前缀请求转发到 `claudeBaseUrl`（缺失/空回退 `baseUrl`），转发路径为去掉 `/anthropic` 前缀（空则 `/`）；其余请求转发到 `baseUrl`，路径原样；查询串原样保留；验证：单测注入假 `fetchImpl`，断言收到的上游 URL 命中三种情形（OpenAI 路径、Anthropic 自定义、Anthropic 回退）
- [x] 3.3 实现头处理：移除入站 `authorization`、`x-api-key`、`host` 与逐跳头，设置 `Authorization: Bearer <token>`，`/anthropic` 路由额外设置 `x-api-key: <token>`；请求方法与请求体原样转发；验证：单测断言上游收到的头与 body，且客户端自带凭据被替换
- [x] 3.4 实现响应透传：状态码与响应头（剔除逐跳头）透传，body 用 `Readable.fromWeb(...).pipe(res)` 边收边发；验证：单测用分块 `text/event-stream` 假上游，断言在假上游结束前客户端已收到首个分块
- [x] 3.5 实现错误分支：无激活 profile 或激活名对应的 profile 不存在 → 503 且不调用 `fetchImpl`；上游 `fetchImpl` reject/超时 → 502；验证：单测断言状态码、未调用上游、响应体与日志不含 token 或 `Authorization`
- [x] 3.6 实现「每请求重读磁盘」：服务器每次请求都重新读取 `token-server.json` 与 `token-profile.json`；验证：单测中同一服务器先 `switch` A 发请求、再 `switch` B 发请求，断言两次上游 URL/token 分别对应 A、B，且未重启服务器

## 4. 进程生命周期

- [x] 4.1 实现 pidfile 模块：`<configDir>/token-server.pid` 的读写与清理，内容为 `{ pid, host, port }`；验证：单测覆盖写入读回与清理
- [x] 4.2 实现 `start --foreground`：监听成功后写 pidfile（`port` 取 `server.address()` 的实际端口，支持 `--port 0`）并打印监听地址；收到 `SIGTERM`/`SIGINT` 时关闭服务器、清理 pidfile、退出 0；验证：单测/子进程用例断言 pidfile 内容与实际端口一致
- [x] 4.3 实现 `start`（守护）：以 `spawn(process.execPath, [...process.execArgv, process.argv[1], "token-server", "start", "--foreground", "--port", String(port)], { detached: true, stdio: ["ignore", logFd, logFd] })` 启动并 `unref()`，stdio 指向 `<configDir>/token-server.log`，轮询 pidfile 就绪（约 5s 超时，子进程早退即失败并打印日志尾）；pidfile 内 pid 存活时报错「已在运行」；端口占用时退出 1 且不留下 pidfile；验证：单测/集成覆盖就绪、已运行、端口占用三种情形
- [x] 4.4 实现 `stop`：读 pidfile 后发 `SIGTERM` 并等待退出（超时则 `SIGKILL`），清理 pidfile 并退出 0；无 pidfile 或 pid 不存活时报错、退出 1，并清理残留 pidfile；验证：单测覆盖终止成功与未运行两种情形
- [x] 4.5 集成冒烟：临时 `XDG_CONFIG_HOME` + 本机 mock 上游，前台子进程跑 `token-server start --foreground --port 0`，读 pidfile 得到端口，发起转发请求验证凭据注入与响应透传，再用 `token-server stop` 终止并确认 pidfile 被清理；验证：该用例在 `pnpm test` 中通过
- [x] 4.6 `start`（后台与 `--foreground`）启动成功时在 stdout 打印监听地址、OpenAI 兼容 baseUrl（`…/v1`）、Anthropic 兼容 baseUrl（`…/anthropic`）与 API key；守护子进程（`AGENT_CLI_TOKEN_SERVER_DAEMON_CHILD=1`）不打印 key，key 不写入 `token-server.log`；验证：lifecycle 集成测试断言前台/守护 stdout 含 baseUrl 与 key、日志不含 key，`pnpm test` 通过

## 5. 帮助与文档

- [x] 5.1 更新 `packages/commands/src/help.ts`：增加 `token-server start` / `stop` / `switch <profile>` 的用法行与说明（仅监听本机、默认 `127.0.0.1:8787`、`--port` 覆盖、`--foreground`、服务器使用 `switch` 选定的激活 profile）；验证：`pnpm exec agent-cli --help` 输出符合
- [x] 5.2 更新 `packages/commands/test/help.test.ts`：断言帮助包含 `token-server` 三个子命令、默认端口 8787、仅本机监听、激活 profile 来自 `switch`；验证：`pnpm test` 通过
- [x] 5.3 更新根 `README.md`（中文）与 `README.en.md`（如存在）：增加 token-server 用法段落、客户端 baseUrl 约定（OpenAI 兼容用 `http://127.0.0.1:8787/v1`，Anthropic 兼容用 `http://127.0.0.1:8787/anthropic`）、安全边界（仅本机、无鉴权）；验证：描述与实现、帮助文案一致

## 6. 验证

- [x] 6.1 仓库根目录 `pnpm typecheck` 与 `pnpm test` 全部通过（含新增 token-server 测试与既有测试）
- [x] 6.2 `openspec validate add-token-server` 通过
- [x] 6.3 手动冒烟（可选，需真实 profile）：`token-server switch <a>` → `token-server start` → 用 curl 打 OpenAI 兼容路径确认转发 → `token-server switch <b>` → 再次请求确认已切换 → `token-server stop` 确认进程终止且 pidfile 清理；无合适凭据时记录为待验收项

## 7. API key 生成与请求鉴权

- [x] 7.1 `paths.ts` 增加 `apiKeyPath()`（`<configDir>/token-server.key`）；新增 `src/key.ts`：`generateApiKey()`（`tsk_` 前缀 + 32 字节 base64url）、`readApiKey()`（缺失/空文件视为未配置）、`writeApiKey()`（mkdir + 临时文件 + rename + chmod 0600，失败抛 `TokenConfigError`）；验证：`key.test.ts` 覆盖生成/读回/0600/空文件/轮换/写失败
- [x] 7.2 `createTokenServer` 增加 `resolveApiKey` 选项并实现鉴权门：每次请求重读 key，入站 `authorization === "Bearer <key>"` 才放行，否则 401（固定文案，不泄露 key），未配置 key 时全部 401，鉴权失败不调用 `fetchImpl`；验证：`server.test.ts` 新增缺 key / 错 key / 未配置 / 轮换即时生效（重读）用例，并断言日志与 401 body 不含 key
- [x] 7.3 实现 `gen-api-key` 子命令：stdout 仅打印一次 key 与保存路径，重复执行轮换并在 stderr 提示旧 key 失效，多余位置参数报错；验证：`command.test.ts` 新增生成/轮换/多余参数用例
- [x] 7.4 `start` 前置校验补 key：激活 profile 校验之后、启动之前检查 `readApiKey()`，未生成时报错提示 `gen-api-key` 且不启动；同时 `runForeground` 以 `resolveApiKey: readApiKey` 装配服务器；验证：`command.test.ts` 断言报错文案与无 pidfile，`lifecycle.test.ts` 集成用例带 key 启动并通过
- [x] 7.5 拦截入站带 key 的请求的既有测试迁移：全部 `server.test.ts` / `lifecycle.test.ts` 请求补 `Authorization: Bearer <key>`，并新增「服务器 key 不上游、401/503/502 后不调上游」断言；验证：`pnpm test` 全量通过

## 8. use 指令（基于激活 profile 指向本地服务器）

- [x] 8.1 `packages/token-config/src/index.ts` 增加导出 `applyClaudeCode` / `applyDsh` / `applyOpenCode` / `applyPi` / `inspectTool` / `skipMessage` / `toolLabel` 与类型 `AgentTool` / `ToolAbsence` / `ToolPresence`（不改行为）；验证：`pnpm typecheck` 通过，token-config 既有测试不变
- [x] 8.2 新增 `src/use.ts`：`runTokenServerUse(args)`——不接收 profile 位置参数（多余位置参数报错），基于 `switch` 确定的激活 profile（名字 + 模型列表），无激活 profile 时报错提示 `switch <profile>`；`--all` / `--tool`（可重复） / 交互问答三选一（语义与 `token use` 一致），`--model <id>` 校验（id 属于激活 profile 且仅对 claude-code/dsh/pi 生效），端口取 pidfile 的 `port` 否则 8787，构造合成 profile（token = 生成的 key，baseUrl = `…/v1`，claudeBaseUrl = `…/anthropic`），`inspectTool` 跳过缺失工具，不调用 `writeActiveProfile`（激活值保持不变）；验证：`use.test.ts` 覆盖四工具写入 + 激活值不变、运行中端口、未生成 key、无激活 profile、激活 profile 被删除、多余位置参数、未知模型、跳过缺失工具
- [x] 8.3 在 `commands/token-server.ts` 注册 `use` 分发并更新 usage 文案（去掉 `<profile>` 参数）；验证：`command.test.ts` 断言 usage 含 `use` / `gen-api-key`
- [x] 8.4 更新 `packages/commands/src/help.ts` 与 `help.test.ts`：用法行补充 `use` / `gen-api-key`，说明 API key 鉴权与 use 不设定激活 profile；README 中/英补 `gen-api-key` / `use` 用法与安全边界（无 token 与 key 泄露）；验证：`help.test.ts` 与 `pnpm test` 全量通过

## 9. 变更收敛与验证

- [x] 9.1 更新 `proposal.md` / `spec.md` / `design.md`：新增 API key 鉴权与 `use` 的 requirement / 场景 / 决策，移除「不做鉴权」非目标；验证：`openspec validate add-token-server` 通过
- [x] 9.2 仓库根 `pnpm typecheck` 与 `pnpm test` 全量通过（含新增 key / use / 生命周期用例）
- [x] 9.3 项目内冒烟（可选，需真实 profile）：`gen-api-key` → `start` → 无 key 请求 401 → 带 key 请求转发 → `use --all` 写配置 → 轮换后旧 key 401；无合适凭据时记录为待验收项
- [x] 9.4 use 语义收敛：`use` 不再接收 `<profile>` 参数、不再写激活值，改为基于 `switch` 确定的激活 profile；同步 `spec.md`（use 需求/场景、激活 profile 需求、帮助信息）、`proposal.md`、`help.ts` 与 README 中/英、`use.test.ts`（8 条）、`help.test.ts`；验证：`use.test.ts` / `help.test.ts` / `pnpm test` 全量通过，`openspec validate add-token-server` 通过
- [x] 9.5 x-api-key 鉴权适配：服务器鉴权门同时接受 `Authorization: Bearer <key>` 与 `x-api-key: <key>`（Anthropic 风格客户端 Claude Code / OpenCode 发后者）；`server.test.ts` 新增 x-api-key 正确/缺失/错误/混合用例；同步 `help.ts`、README 中/英、`spec.md`（鉴权需求、401 场景、API key 需求、帮助信息）与 `design.md`（鉴权门、决策 9、风险）；验证：`pnpm typecheck` 与 `pnpm test` 全量通过，`openspec validate add-token-server` 通过
- [x] 9.6 仅 Claude Code 走 claudeBaseUrl：`use` 写入时仅 claude-code 指向 `/anthropic`，opencode / dsh / pi 一律指向 `/v1`（`applyTools` 对非 claude 工具传入去掉 `claudeBaseUrl` 的合成 profile，令 `applyOpenCode` 回退 `baseUrl`）；同步 `help.ts`、README 中/英、`spec.md`（use 需求与场景）、`proposal.md`、`use.test.ts`（opencode 断言 baseURL 为 `/v1`，含 pidfile 端口用例）；验证：`use.test.ts` / `pnpm test` 全量通过，`openspec validate add-token-server` 通过
