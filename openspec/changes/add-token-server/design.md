## Context

动机见 `proposal.md`，行为约束见 `specs/token-server/spec.md`。

现状与约束：

- profile 存储与解析已在 `packages/token-config/src/store.ts`（`loadProfiles` / `getProfile` / `profileFilePath`），配置目录由 `@agent-cli-toolkit/core` 的 `getConfigDir()` / `ensureConfigDir()` 决定（`XDG_CONFIG_HOME` 可覆盖）。`TokenProfile` 含 `baseUrl`、可选 `claudeBaseUrl`、`token`（见 `packages/token-config/src/types.ts`）。
- 命令分发：`packages/commands/src/run.ts` 按 `args[0]` 分派（当前只有 `token`）；帮助是 `packages/commands/src/help.ts` 里的静态文本；`token` 的命令清单在 `packages/token-config/src/commands/token.ts`。
- 工作区约定（AGENTS.md）：`apps/cli` 只做外壳，命令的解析/调用/实现按命令或领域分包，包间用 `workspace:`，相对导入带 `.js`，`strict` + NodeNext，测试用 `node:test` + `tsx`，根 `pnpm test` 直跑 `packages/*/test/*.test.ts`。
- 运行时 Node >= 20，可用全局 `fetch` 与 `node:http`。

## Goals / Non-Goals

**Goals:**

- 新增顶层命令 `agent-cli token-server`（`start` / `stop` / `switch <profile>`），不影响既有 `token` 命令。
- 本机回环转发的 HTTP 服务器：按路径选上游、注入凭据、透传请求与响应（含 SSE）。
- 激活 profile 持久化，且运行中的服务器每次请求读取磁盘，使 `switch` 无需重启即生效。
- 进程生命周期可管理：后台守护 + pidfile + 日志文件，`stop` 可终止；失败路径不留下半启动状态。
- 全部行为可离线测试（注入上游 fetch + 临时 `XDG_CONFIG_HOME`），不依赖真实云凭据。

**Non-Goals:**

- 不做多用户 / 细粒度授权 / TLS / 非 localhost 监听（仅本机回环 + 单一 API key 鉴权，见决策 9）。
- 不做请求体改写、协议转换（OpenAI ↔ Anthropic 互转）、限流、重试、日志轮转。
- 不实现 `status` / `restart` / 守护进程自启（systemd/launchd）集成。
- 不改 `token-profile.json` 结构，不改 `token use` 语义。

## Decisions

### 1. 新增包 `packages/token-server`

命令与领域按包拆分（AGENTS.md）。`packages/token-server` 承载命令分发、HTTP 服务器、进程管理与状态文件；`packages/commands` 依赖它并在 `run.ts` 注册 `token-server`，`packages/commands` 与根 `tsconfig.json` 增加项目引用。

**备选：** 塞进 `packages/token-config`。否决：该包职责是 `token` 子命令与平台实现，新顶层命令独立成包更符合「按命令分包」，也避免服务器依赖进入 `token` 命令的加载路径。

**备选：** 用 Node 内置 `http` 起服务器的同时引入 `express`/`http-proxy`。否决：AGENTS.md 要求新增运行时依赖先问；内置 `node:http` + 全局 `fetch` 足够。

### 2. 上游转发：`node:http` 入口 + 全局 `fetch`（流式）

入站用 `http.createServer`；上游用全局 `fetch(upstreamUrl, { method, headers, body, duplex: "half", redirect: "manual" })`。请求体用 `Readable.toWeb(req)` 传入（`GET`/`HEAD` 无 body），响应体用 `Readable.fromWeb(upstream.body).pipe(res)` 边收边发，满足 SSE 不缓冲要求。

**备选：** `node:http`/`node:https` 的 `request` 直接 pipe。可行但需手工处理 URL/重定向/头；`fetch` 与仓库既有 `http.ts` 风格一致，且 Node 20 原生支持 `duplex: "half"` 流式请求体。

### 3. 路径路由与上游选择

- `/anthropic` 或 `/anthropic/...` → 上游 base = `profile.claudeBaseUrl`（缺失/空则 `baseUrl`），转发路径 = 去掉 `/anthropic` 前缀（空则 `/`）。
- 其余 → 上游 base = `profile.baseUrl`，路径原样。
- 拼接：`new URL(base)`，将 base 的 pathname 与转发路径用单斜杠拼接，查询串原样带上。

客户端约定（写入 README/帮助）：OpenAI 兼容工具 base 设为 `http://127.0.0.1:8787/v1`；Claude Code / Anthropic 兼容工具 base 设为 `http://127.0.0.1:8787/anthropic`。

**备选：** 按请求路径特征（`/v1/messages` vs `/v1/chat/completions`）猜协议。否决：脆弱且随供应商实现漂移；显式路径前缀更稳定。

### 4. 凭据注入与头处理

转发前的请求上应用两层处理：

1. **鉴权门**（见决策 9）：读取 `token-server.key`（无文件视为未配置），入站 `Authorization` 必须恰好等于 `Bearer <key>`，否则 401 且不发起上游请求；key 不进入后续任何处理。
2. **凭据替换**：删除入站 `authorization`、`x-api-key`、`host`，以及逐跳头 `connection`、`keep-alive`、`proxy-*`、`transfer-encoding`、`upgrade`、`te`、`trailer`。始终设置 `Authorization: Bearer <token>`；`/anthropic` 路由额外设置 `x-api-key: <token>`。请求方法、查询串、请求体不改。

响应侧：透传状态码与响应头（剔除逐跳头），由 Node 负责分帧。

**理由：** OpenAI 兼容上游用 `Authorization: Bearer`，Anthropic 兼容上游用 `x-api-key`；两者都设可同时覆盖。入站客户端的服务器 key 在校验后即被替换为激活 profile 的真实 token，既保证「客户端必须持 key 才能用」，又保证上游只见真实凭据。

### 5. 激活 profile：`token-server.json` + 每次请求读取

激活 profile 名写入 `<configDir>/token-server.json` 的 `activeProfile`（原子写）。`switch` 先经 `getProfile(name)`（不存在即 `TokenConfigError`）再落盘。服务器在每个请求处理开始时读取 `token-server.json` 与 `token-profile.json`：

- 无 `activeProfile`，或该名字在 profile 文件中不存在 → 503，文案提示执行 `token-server switch <profile>`，不发起上游请求。
- 否则用该 profile 的 `baseUrl`/`claudeBaseUrl`/`token` 转发。

**理由：** 用磁盘作为唯一事实源可让 `switch` 与运行中的服务器解耦，无需 IPC / 控制端口；「切换立即生效」通过每请求重读自然满足。

**备选：** 服务器内存持有激活 profile + 控制端点（HTTP/Unix socket）接收切换。否决：多一个需鉴权的控制面与并发状态，收益不足。

### 6. 进程生命周期：detached 子进程 + pidfile + 就绪轮询

- `token-server start [--port <port>] [--foreground]`：
  1. 读取激活 profile，缺失 → 报错（提示先 `switch`）退出 1。
  2. 读取 `token-server.key`，未生成 → 报错（提示先 `gen-api-key`）退出 1。
  2. 若 `token-server.pid` 内的 pid 存活 → 报错「已在运行」退出 1。
  3. 非前台：`spawn(process.execPath, [...process.execArgv, process.argv[1], "token-server", "start", "--foreground", "--port", String(port)], { detached: true, stdio: ["ignore", logFd, logFd] })`，`child.unref()`；轮询 pidfile 出现（约 5s 超时），期间子进程退出即视为失败（打印日志文件尾并退出 1）。
  4. 前台：直接在当前进程 `listen`。
- 子进程/前台监听成功后写 `token-server.pid`（`{ pid, host, port }`，`port` 用 `server.address()` 的实际值以支持 `0`），`start` 打印监听地址并退出 0。
- 监听失败（如 `EADDRINUSE`）→ 不写 pidfile，报错退出 1。
- `stop`：读 pidfile；不存在或 pid 不存活 → 清理残留 pidfile、报错退出 1；否则 `SIGTERM`，等待退出（超时则 `SIGKILL`），清理 pidfile，退出 0。
- 服务器收到 `SIGTERM`/`SIGINT`：关闭连接、清理自身 pidfile、退出 0。
- 守护进程 stdout/stderr 重定向到 `<configDir>/token-server.log`；前台模式写 stderr。

**`--foreground` 的理由：** 既便于调试/容器托管，也让守护路径的集成测试可复用同一入口（测试以子进程跑 `--foreground`，再用 `stop` 或信号收尾）。

**备选：** 用 `fork` + IPC 就绪握手。否决：`fork` 不保留 `tsx` 等 `execArgv` 场景需额外处理；pidfile 轮询已能判定「已监听」，实现更简单且可观测（pidfile 本身是产物）。

### 7. 测试缝

- 上游 `fetch`：`createTokenServer({ fetchImpl })` 可注入假 fetch，断言上游 URL/方法/头（凭据注入）与返回；默认用全局 `fetch`。
- 服务器：`createTokenServer()` 返回 `http.Server`，测试用 `listen(0)` 拿临时端口，起真实本机请求，或直接对 handler 调用。
- 状态/进程：`switch` 走真实文件（临时 `XDG_CONFIG_HOME`）；`stop` / `start` 的失败分支用「写假 pidfile（指向当前进程或不存在的 pid）」或真实短命子进程覆盖；一条集成用例用 `--foreground` 子进程 + 本机 mock 上游跑通 start→请求→stop。
- 断言不泄露：捕获 stdout/stderr 断言不含 token 与 `Authorization`。

### 8. `token-config` 只增导出，不改行为

`packages/token-config/src/index.ts` 增加导出：`loadProfiles`、`getProfile`（供服务器读取 profile），以及 `applyClaudeCode` / `applyDsh` / `applyOpenCode` / `applyPi` / `inspectTool` / `skipMessage` / `toolLabel` 与类型 `AgentTool` / `ToolAbsence` / `ToolPresence`（供 `token-server use` 复用工具配置写入与存在性检查）。不改变任何既有导出与行为，不需要 `token-config` 的 spec delta。

**理由：** `token-server use` 的写入逻辑与 `token use` 完全一致（同样的文件结构、同样的跳过规则、同样的 `--model` 校验），复制实现会让两处漂移；直接复用 `apply*` 函数并把服务器场景表达为「合成 profile」（`token = 生成的 key`，`baseUrl / claudeBaseUrl = 本地服务器地址`，`models` 照抄原 profile）即可。

### 9. 服务器 API key 鉴权

- `token-server gen-api-key` 用 `crypto.randomBytes(32)` 生成 key（前缀 `tsk_` + base64url），原子写入 `<configDir>/token-server.key`（0600），stdout 仅打印一次；重复执行 = 轮换（旧 key 立即失效，stderr 提示）。
- 服务器每次请求重读 `token-server.key`（与激活 profile 同频），校验入站 `authorization === "Bearer " + key`，否则 401（不发起上游）。未配置 key 时全部 401。
- `start` / `start --foreground` / `use` 前置校验 key 存在，否则报错退出 1 并提示 `gen-api-key`，避免「启动即全 401」的困惑。

**理由：** 客户端（Claude Code / pi 等）会把 key 当 apiKey 写入本地配置且 HTTP 有别的进程可在本机访问，纯回环绑定不足以区分「谁在调用」；单 key + 每次请求重读让轮换即时生效，与激活 profile 的机制同构，不引入控制面。

**备选：** 无鉴权（最初版本）→ 被用户需求否决；密钥放 `token-server.json` → 与激活 profile 混存（该文件非 0600），独立 `token-server.key` 0600 更清晰。

### 10. `use` 命令复用 `token-config` 的 apply 逻辑

`token-server use <profile>` 的执行顺序：
1. `getProfile(name)`（缺失 → `TokenConfigError`）。
2. `readApiKey()`（缺失 → 报错提示 `gen-api-key`）。
3. 选择工具（`--all` / `--tool` 重复标志 / 交互问答，语义与 `token use` 一致）。
4. 端口 = pidfile 的 `port`（存在）否则 8787；构造合成 profile（见决策 8）。
5. `inspectTool` 过滤：缺失工具跳过（stderr 提示），不创建目录、不改写现有文件。
6. `resolveModel` 校验（与 `token use` 相同：id 属于 profile 且至少一个模型型工具存在）。
7. 对就绪工具调用 `applyClaudeCode` / `applyOpenCode` / `applyDsh` / `applyPi`。
8. 全部成功后才 `writeActiveProfile(name)`。

pi 的 `defaultModel` 取 `--model ?? profile.models[0]?.id`（空模型列表时报错），与 `token use` 一致。

**理由：** 一个命令完成「激活 + 写配置」避免两步误操作（先 switch 忘 use，或 use 忘了 switch）；写入失败不落激活值，保持可重试。

## Risks / Trade-offs

- **守护进程 `spawn` 依赖 `process.argv[1]` 与 `process.execArgv`** → 在 `tsx`/`pnpm dev` 下需带上 `execArgv` 才能加载 TS；已在 spawn 时 `[...process.execArgv, process.argv[1], ...]`。若某些包装场景 `argv[1]` 不是入口，`start` 报错并提示查看日志；`--foreground` 是可靠退路。
- **本机单 key 鉴权** → 仅绑定 `127.0.0.1` + 每次请求校验 `Authorization: Bearer <key>`；key 由 `gen-api-key` 生成并轮换，日志/错误/帮助不含 key。若需更强隔离（TLS / 绑定 Unix socket / 多用户 key）可后续变更。
- **每请求重读磁盘 JSON** → 低频、文件小，开销可接受；换取切换即时生效与实现简单。若将来成为热点可加 mtime 缓存。
- **`fetch` + `duplex: "half"` 的 Node 版本要求** → `engines.node >= 20` 已满足；设计里固定该用法，避免回退到全缓冲。
- **pidfile 残留/pid 复用** → `stop` 与 `start` 都以 `kill(pid, 0)` 校验存活；不存活即清理并按「未运行」处理；记录端口便于人工核对。
- **token / key 泄露** → 不记录请求头，错误信息不含 token 或 key（401 体为固定文案，不含 key）；日志只记方法/路径/上游状态码；测试显式断言。
- **端口 8787 冲突** → `start --port` 可覆盖；占用时明确报错退出 1。

## Migration Plan

无数据迁移：新增命令与新增配置文件（`token-server.json` / `token-server.pid` / `token-server.log` / `token-server.key`），不改 `token-profile.json` 与既有命令。升级即可用。回滚：卸载/忽略新命令并删除这四个文件即可，不影响既有 profile 与 `token` 命令。

## Open Questions

- 是否增加 `token-server status`（打印 pid/端口/激活 profile）——可后续独立变更，不影响本设计。
- 日志是否轮转/限长——当前仅追加，后续可加，不需要改本 spec。
- `use` 是否支持 `--base-url <url>` 显式覆盖本地服务器地址——当前未纳入（用户未要求）；如需要可后续变更。
