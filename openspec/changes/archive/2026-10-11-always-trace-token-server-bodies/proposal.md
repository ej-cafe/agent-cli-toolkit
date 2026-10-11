## Why

`add-token-server-access-log` 引入的请求体/响应体追踪是 opt-in 的：必须给 `token-server start` 加 `--trace-body`，才把请求体与响应体写入 `token-server-access-body.jsonl`，默认关闭。实际排查转发问题时，需要这些内容时才想起没开开关，而问题往往不可复现。追踪的价值在于事后可用，因此默认开启；同时保留一个关闭途径 `--no-trace-body`，以便不需要时避免把请求/响应原文持续落盘。

## What Changes

- **默认开启追踪**：不改任何标志时，已通过鉴权、进入转发阶段的入站请求，其请求体与上游响应体始终追加到配置目录下 `token-server-access-body.jsonl`（JSON Lines，跨重启保留），与主访问记录用相同 `time` 关联。
- **新增 `--no-trace-body` 关闭标志**：`token-server start` 接受该标志；关闭时不创建也不写入 `token-server-access-body.jsonl`；后台启动会把该标志传给守护进程。
- **删除 `--trace-body` 标志**：`token-server start` 不再接受该标志（由默认开启取代）。
- **类型收窄**：`TokenServerOptions.traceRequestBody` 改为默认 `true` 的 `traceBody`；`lifecycle` 的 `runForeground` / `startDaemon` 增加 `traceBody` 参数，关闭时构造 `--no-trace-body`。
- **其余行为全部不变**：文件位置、13 个字段、文本类型白名单、单侧 64 KiB 截断、`GET`/`HEAD` 请求体为 `null` 但记录响应体、流式响应旁路捕获、拒绝路径不记录、写入失败不影响转发、不泄露凭据。
- 帮助信息与 README 同步：说明追踪默认开启、`--no-trace-body` 关闭，并提示文件含用户数据。
- 主访问记录 `token-server-access.jsonl` 的 schema 不变：请求体/响应体仍只写入独立文件。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-server`：修改「追踪请求体与响应体」要求——从 opt-in 改为默认开启、提供 `--no-trace-body` 关闭、移除 `--trace-body`。文件位置、字段、限制与写入时机不变。

## Impact

- 代码：`packages/token-server/src/server.ts`（`traceBody?: boolean`，默认 true，`false` 时不创建 body logger）、`packages/token-server/src/lifecycle.ts`（`runForeground` / `startDaemon` 增加 `traceBody = true`，关闭时向守护子进程追加 `--no-trace-body`）、`packages/token-server/src/commands/token-server.ts`（`start` 解析 `--no-trace-body`、用法行）、`packages/token-server/src/paths.ts`（注释）、`packages/commands/src/help.ts`、`README.md`。
- 测试：`packages/token-server/test/access-log.test.ts`（默认写入 + `traceBody: false` 不写入）、`packages/token-server/test/lifecycle.test.ts`（默认守护进程记录、`--no-trace-body` 守护进程不记录）、`packages/commands/test/help.test.ts`（含 `--no-trace-body`、不含 `--trace-body`）。
- **默认行为变更**：未加开关的服务器现在也会写入 `token-server-access-body.jsonl`，磁盘占用与落盘的用户数据范围扩大。无数据迁移，文件首次写入时自动创建；回滚即恢复原 opt-in 行为。
- 隐私：追踪文件含请求/响应原文（可能含 prompt、代码、个人数据）；默认开启，可用 `--no-trace-body` 关闭。文件轮转/清理仍为待议项。