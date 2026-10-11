## Context

见 proposal.md — Why。当前 `packages/token-server/src/server.ts` 是一个纯转发的可注入组件：`createTokenServer` 接收 `resolveProfile` / `resolveApiKey` / `fetchImpl` / `log`，`handleRequest` 对每个请求完成鉴权、路由、转发，并在各失败分支通过 `log` 写一行人类可读文本。`log` 在守护模式下落到配置目录的 `token-server.log`（见 `lifecycle.ts` 的 `logFilePath()`）。现有 `log` 行既包含启动/pid 信息又混有请求行，且没有机器可解析的结构，无法直接查询。

约束：项目禁止新增运行时依赖（AGENTS.md）；server.ts 有意与 `state.ts` / `active-profile.ts` 解耦，以保持可注入、可单测；SSE 转发不得被任何新逻辑阻塞。

## Goals / Non-Goals

**Goals:**
- 每个入站请求（成功与失败）都留下一条结构化、可机器解析、不泄密的访问记录。
- 记录与现有 `token-server.log` 解耦，损坏/缺失/不可写都不影响转发。
- 记录始终开启、无需开关。
- 提供 opt-in 的请求体追踪，用于排查上游/prompt 问题，且与主访问记录隔离。

**Non-Goals:**
- 不新增查看记录的 CLI 子命令（用户直接读取 JSONL 文件）。
- 不做日志轮转、大小上限或保留策略（见 Open Questions）。
- 不引入关闭开关。
- 主访问记录不记录请求/响应体、请求头、查询串、token 或服务器 key；请求体仅在 opt-in 追踪时写入独立文件。
- 不改动转发、鉴权、`switch` / `use` / `start` / `stop` 的任何行为。

## Decisions

### 1. 存储：配置目录下 `token-server-access.jsonl`，JSON Lines 追加写

每行一个 JSON 对象，`getConfigDir()` 下独立文件。相比复用 `token-server.log`：现有文件是人类可读文本且混杂守护进程生命周期消息，无法稳定解析；独立 JSONL 文件可直接被 `jq`、`grep` 等外部工具消费。

备选：SQLite / 二进制索引（新依赖，否决）；纯文本 append（不可解析，否决）。

### 2. 记录字段

`time`（`new Date().toISOString()`）、`method`、`path`（`requestUrl.pathname`，**不含查询串**）、`status`（`res.statusCode`，即返回给客户端者）、`profile`（激活 profile 名或 `null`）、`durationMs`、`error`（失败类别或 `null`）。

不记录查询串，与现有 `log` 行一致，并可避免把可能含密钥的 query 参数落盘。**不记录响应体字节数**：初版曾考虑该字段，但它要求改写 SSE 写出路径以计数，收益低、风险高，改为只保留更能定位问题的 `durationMs`。

失败类别取值固定为：`invalid_api_key`（401）、`no_active_profile` / `profile_read_failed`（503）、`invalid_base_url`（500）、`upstream_failed`（502）；成功为 `null`。用可读字符串而非数字码，便于直接阅读与断言。

### 3. profile 名解析：可选注入项，不改变 `resolveProfile` 契约

`TokenServerOptions` 增加可选 `resolveProfileName?: () => string | undefined`；`lifecycle.ts` 注入 `readActiveProfile`。server.ts 不 import `state.ts`，保持可注入与可单测。缺省时 `profile` 记为 `null`。

备选：把 `resolveProfile` 返回值改为 `{ name, profile }`（会改动 lifecycle、e2e 与既有测试，否决）；在 server 内直接 import `readActiveProfile`（破坏解耦，否决）。

### 4. 记录时机：在 `handleRequest` 起始处挂 `res.on("finish")`

在进入任何分支前注册一次性 `finish` 监听，用局部 `error` 变量在各分支赋值；`finish` 触发时（响应体已完全写出）计算 `durationMs` 与最终 `status` 并写记录。这样天然覆盖 401/503/500/502/成功全部路径，且「响应结束后才写」无需在每个分支重复。SSE 的 `finish` 在上游流结束后触发，期间不触碰写出路径。

写入用同步 `appendFileSync(path, line, { flag: "a" })` 包在 try/catch 中：单行写入极短，避免异步写入在进程退出时丢记录或乱序。失败时用一次性标志只向 stderr 提示一条，之后静默。

备选：异步 `appendFile`（进程退出可能丢尾部记录、并发乱序，否决）；复用 `log`（结构不对，否决）。

### 5. 始终开启、无查看命令

记录逻辑无条件执行，不提供 `--no-access-log` 或配置开关；也不新增 `token-server log` 子命令。查看方式为直接读取 `token-server-access.jsonl`，由 README 说明路径与格式。这样不改变对外 CLI 命令。

### 6. 请求体与响应体追踪：opt-in、独立文件、转发时旁路捕获

- **开关**：`token-server start --trace-body`（`startDaemon` 也会把该标志传给守护子进程）。默认关闭；关闭时不创建、不写入追踪文件。请求体与响应体均含用户数据，不适合像访问记录那样无条件落盘。
- **存储**：独立文件 `token-server-access-body.jsonl`（新增 `accessBodyLogPath()`），避免把主访问记录撑大、破坏其可查询性，也让「主记录不含请求/响应体」这条安全约束继续成立。用相同 `time` 关联两条记录。
- **字段**：`time` / `method` / `path` / `profile` / `requestContentType` / `requestBody` / `requestBodyTruncated` / `requestBodySkipped` / `responseStatus` / `responseContentType` / `responseBody` / `responseBodyTruncated` / `responseBodySkipped`。
- **捕获方式**：请求侧与响应侧各用一个 `BodyCapture`（`Transform`）旁路累计前 64 KiB。请求侧 `req.pipe(tee)` 后交给上游；响应侧 `Readable.fromWeb(upstream.body).pipe(tee).pipe(res)`。两侧都保留完整转发、不缓冲完整内容。超过上限只截断**记录**，转发字节保持完整。
- **内容类型**：两侧各自判断——仅文本类（`application/json`、`application/x-ndjson`、`text/*`、`application/x-www-form-urlencoded`）写 body；其他类型 body 为 `null`、skipped 记内容类型。
- **拒绝路径不追踪**：401 / 503 / 500 在读取请求体前返回，因此不产生追踪记录（也避免记录未鉴权者的数据）。`GET` / `HEAD` 无请求体，请求体字段为 `null`，但**仍记响应体**。
- **写入时机与失败**：与访问记录一致，在 `res.on("finish")` 中写，此时请求体已转发、响应体已全量经过旁路 `Transform`，流式响应也已结束。失败只提示一次且不影响转发。

备选：把请求/响应体内联进主访问记录（撑大日志、破坏安全约束，否决）；始终开启（敏感数据无条件落盘，否决）；为记录而先缓冲完整请求/响应体（大上传与 SSE 内存爆炸、破坏流式，否决）。

## Risks / Trade-offs

- [访问日志无限增长] → 本变更不做轮转；用户可自行删除该文件。已记录为 Open Question。
- [`appendFileSync` 在请求路径上阻塞事件循环] → 单条记录很小、每请求一次；对本地开发代理可接受；已评估异步方案的丢记录风险更大。
- [多请求并发追加在极端情况下交错] → 每条记录一次 `write`，本地文件系统上小写入实际原子；个别损坏行只影响该行，读取方可跳过。
- [某些上游把 API key 放在查询串] → 记录 `path` 不含查询串，降低泄露面。
- [「响应结束后才写」使 `durationMs` 包含流式时长] → 这是有意选择：它反映客户端实际体验的端到端耗时。
- [访问日志目录不可写] → try/catch 吞掉，仅提示一次，不影响转发（spec 已要求）。

- [追踪泄露敏感数据] → opt-in、默认关闭；只记文本类型；只写入独立文件；不记头/查询串；README 明确警告。
- [大请求/响应体撑爆内存或日志] → 两侧旁路 `Transform` 各只留前 64 KiB，转发不受影响，超限标对应 truncated。
- [记录响应体会破坏流式转发] → 响应侧用旁路 `Transform` 边转发边捕获（不缓冲完整内容），SSE 分块仍即时下发。
- [`--trace-body` 改变启动参数面] → 仅 `start` 新增一个默认 false 的布尔标志，不改变既有标志行为。

## Migration Plan

纯新增：无数据迁移。发布后服务器首次写入时自动创建 `token-server-access.jsonl`；仅在 `--trace-body` 开启时自动创建 `token-server-access-body.jsonl`。回滚：删除对应文件并回退代码即可，无残留状态。

## Open Questions

- 是否需要在后续变更中加入轮转/大小上限或保留最近 N 条？
- 是否需要在后续变更中提供查看命令（如 `token-server log`）或关闭开关？当前明确不做。
- 请求/响应体追踪是否需要脱敏（屏蔽 `api_key` / `token` / `password` 字段）或把上限做成可配置？当前固定 64 KiB、不脱敏。
- 是否需要分别开关请求体与响应体（如 `--trace-body` / `--trace-response`）？当前单一 `--trace-body` 同时控制两者。