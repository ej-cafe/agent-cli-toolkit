## Why

现有 `token use` 通过改写各 CLI 工具（Claude Code、OpenCode、DeepSeek Harness、pi）的本地配置来切换凭据，每换一套 profile 都要重新写配置并重启工具。需要一个常驻的本地转发代理：客户端把 baseUrl 指向本机端口，服务器按当前激活 profile 注入凭据并转发到上游，从而在不改工具配置、不重启工具的情况下切换凭据。

## What Changes

- 新增顶层命令 `agent-cli token-server`，子命令 `start`、`stop`、`switch <profile>`、`use`、`gen-api-key`。
- `gen-api-key`：用 `crypto` 生成随机 key（`tsk_` 前缀 + base64url），持久化到配置目录下 `token-server.key`（0600 权限），并在生成时仅打印一次；重复执行 = 轮换，旧 key 立即失效。
- `start`：先校验存在激活 profile 且已生成 API key；后台守护启动本地 HTTP 转发服务器，默认监听 `127.0.0.1:8787`（`--port` 覆盖）；写 pidfile（`pid`/`host`/`port`），日志写配置目录；已运行、端口占用、无激活 profile、未生成 key 时报错。
- `stop`：按 pidfile 终止守护进程并清理 pidfile；未运行时报错。
- `switch <profile>`：校验 profile 存在后把「激活 profile」持久化到配置目录；运行中的服务器在下一次请求即使用新 profile（无需重启）。
- `use`：基于 `switch` 已确定的激活 profile（名字与其模型列表）把选中工具的 baseUrl 指向本地服务器、apiKey 写为生成的服务器 key；工具选择（`--all` / `--tool` / 交互问答）与 `token use` 语义一致，缺失工具跳过且不创建配置目录；Claude Code 写 `…/anthropic`，OpenCode / dsh / pi 写 `…/v1`；端口取运行中 pidfile 的实际端口，否则默认 `8787`。`use` 自身不设定也不改变激活 profile
- 服务器鉴权：每个请求必须携带 `Authorization: Bearer <key>`（`gen-api-key` 生成），缺失或不匹配 → 401 且不发起上游请求；匹配后移除入站 `authorization` / `x-api-key` / `host` 等头，按激活 profile 注入 `Authorization: Bearer <token>`，`/anthropic` 路由额外注入 `x-api-key`；保留方法、查询串与请求体；响应（含 SSE）流式透传。
- 转发语义：`/anthropic/*` → `claudeBaseUrl ?? baseUrl`（去掉 `/anthropic` 前缀），其余路径 → `baseUrl`（路径原样）。
- 错误语义：无激活 profile → 503；上游请求失败 → 502；未配置/错误 key → 401；错误响应与日志不得包含 token 或 key。
- `agent-cli --help` 与根 `README.md`（中/英）增加 `token-server` 说明。
- 不改 `token-profile.json` 结构与 `token use` 等既有命令行为；`token-server` 只读取 profile，不修改它。

## Capabilities

### New Capabilities

- `token-server`: 本地凭据注入转发服务器，以及 `token-server start|stop|switch|use|gen-api-key` 的命令分发、API key 生成与鉴权、激活 profile 持久化与切换、进程生命周期与安全边界。

### Modified Capabilities

- `token-config`: 新增导出 `applyClaudeCode` / `applyDsh` / `applyOpenCode` / `applyPi` / `inspectTool` / `skipMessage` / `toolLabel` 与类型 `AgentTool` / `ToolAbsence` / `ToolPresence`，供 `token-server use` 复用其工具配置写入与存在性检查；不改动任何既有导出与行为，不需要 `token-config` 的 spec delta。

## Impact

- 代码：新增包 `packages/token-server`（命令分发、HTTP 服务器、进程管理、状态与 key 文件）；`packages/commands/src/run.ts` 注册 `token-server`，`packages/commands/src/help.ts` 与 `packages/commands/test/help.test.ts` 更新；根 `tsconfig.json` 与 `packages/commands/tsconfig.json` 增加项目引用；`packages/token-config/src/index.ts` 增加导出（不改行为）。
- 依赖：无新增运行时依赖（使用 Node 内置 `node:http`、全局 `fetch`、`node:crypto`）。
- 配置目录（`getConfigDir()`）新增 `token-server.json`（激活 profile）、`token-server.pid`（运行态，退出后清理）、`token-server.log`（守护进程日志）、`token-server.key`（API key，0600，`gen-api-key` 生成）；不触碰 `token-profile.json`。
- 安全：仅监听 `127.0.0.1`，请求必须携带 `Authorization: Bearer <key>`（未生成 key 时全部拒绝）；token 与 key 不写入日志、不出现在错误响应或 `--help`。
- 兼容：`token` 子命令与既有测试不受影响；`token-server` 为新增命令，无破坏性变更。
