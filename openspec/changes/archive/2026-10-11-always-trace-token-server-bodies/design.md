## Context

动机见 `proposal.md`。当前实现约束（来自代码，非推测）：

- `packages/token-server/src/server.ts` 的 `createTokenServer` 中：`const accessBodyLogger = options.traceRequestBody === true ? createAccessBodyLogger({ path: options.accessBodyLogPath, warn: log }) : undefined;`，转发路径仅在 `accessBodyLogger !== undefined && requestTrace !== undefined` 时写追踪记录。
- `TokenServerOptions` 有可选 `traceRequestBody?: boolean` 与 `accessBodyLogPath?: string`；`accessBodyLogPath()` 指向 `<config>/token-server-access-body.jsonl`。
- `lifecycle.ts` 的 `runForeground(port, printCredentials = false, traceRequestBody = false)` 与 `startDaemon(port, traceRequestBody = false)` 把该值传给 `createTokenServer`；`startDaemon` 在开启时向守护子进程追加 `--trace-body`。`commands/token-server.ts` 的 `start` 解析 `"trace-body": { type: "boolean", default: false }`。
- 追踪记录字段、文本类型白名单、64 KiB 单侧上限、`BodyCapture` 旁路捕获、`res.once("finish")` 写入时机、失败不影响转发——这些由已归档的 `add-token-server-access-log` 定义，本变更不动。
- `openspec/specs/token-server/spec.md` 的「追踪请求体与响应体」要求目前写死「opt-in」「默认必须关闭」。其余 8 个 requirement 均未提及 `--trace-body`（「提供 token-server 命令」只要求 `start` 接受 `--port` 与 `--foreground`）。
- 项目约束：TypeScript `strict` + `verbatimModuleSyntax` + `NodeNext`；相对导入带 `.js`；只用 pnpm；发布产物为自包含单文件 bundle。

## Goals / Non-Goals

**Goals:**

- 请求体与响应体追踪默认开启；不传标志即写入。
- 提供 `--no-trace-body` 关闭途径，可让不需要追踪的场景避免持续落盘原文。
- 追踪的文件、字段、限制、写入时机与关联方式与现状完全一致。
- 主访问记录 schema 不变。

**Non-Goals:**

- 不改追踪记录字段、文本类型白名单、64 KiB 上限、旁路捕获机制。
- 不改主访问记录 `token-server-access.jsonl`。
- 不引入轮转、上限、清理等。
- 不改 `token-server` 的其他子命令与配置格式。

## Decisions

1. **默认开启 + 提供 `--no-trace-body` 关闭，删除 `--trace-body`。** 理由：用户明确要求「默认开启 + `--no-trace-body`」。保留恒真的 `--trace-body` 只会留下无意义的 CLI 面，故删除，由默认值取代；`--no-trace-body` 让不需要追踪的用户仍能避免把原文落盘（隐私逃生舱）。备选：彻底无开关（被用户否，隐私上太强硬）、用环境变量关闭（被否，不如显式标志直观）。
2. **保持独立文件 `token-server-access-body.jsonl`，不把 body 合进主访问记录。** 理由：主访问记录要求明确「不得包含请求体、响应体」，合并会破坏该契约并使严格 schema 变宽；独立文件 + 相同 `time` 关联已是既有设计。
3. **记录范围与写入时机不变：仅已鉴权、进入转发的请求，在 `res.once("finish")` 落盘。** 理由：追踪在「读取请求体前」就被拒绝的请求（401 / 无激活 profile / baseUrl 无效）没有意义，且现状如此；保持 `requestTrace === undefined` 时不写记录。
4. **`TokenServerOptions` 用默认 `true` 的 `traceBody?: boolean`，而非保留 `traceRequestBody` 语义反转。** 理由：字段含义变为「是否追踪」（覆盖请求体与响应体），旧名不准确；`@agent-cli-toolkit/token-server` 是 private 包、不发布，签名变化仅影响本仓库调用方与测试。`accessBodyLogPath` 保留（测试注入用）。
5. **`lifecycle` 参数收窄为 `traceBody = true`。** `runForeground(port, printCredentials = false, traceBody = true)`、`startDaemon(port, traceBody = true)`；`startDaemon` 仅在关闭时向子进程追加 `--no-trace-body`。守护进程与前台进程行为一致，无额外分支。
6. **隐私影响显式记录。** 默认落盘请求/响应原文意味着敏感数据默认持久化；`--no-trace-body` 提供关闭能力，README 与帮助信息提示文件含用户数据。文件轮转/清理沿用原 change 的 deferred open question。

## Risks / Trade-offs

- **敏感数据默认落盘**（prompt、代码、个人数据）→ 默认开启使敏感数据持久化。Mitigation：提供 `--no-trace-body` 逃生舱；在 `proposal.md` 与 README 明确提示文件含用户数据；保留「不记请求/响应头、查询串、token、服务器 key」的既有约束。
- **文件无上限增长** → 长期运行磁盘占用上升。Mitigation：沿用既有 64 KiB/条上限；轮转/清理作为后续变更（本变更不做）。
- **新增对外标志 `--no-trace-body` 并移除 `--trace-body` 属破坏性** → 依赖 `--trace-body` 的脚本会拿到未知标志错误。Mitigation：帮助与 README 同步；该标志引入时间很短、且无外部发布版本包含它。
- **测试依赖 `traceRequestBody`** → 用例语义需从「开启后」改为「默认」并新增关闭用例。Mitigation：`access-log.test.ts` 改为 `traceBody`（默认 true）+ 新增 `traceBody: false` 用例；`lifecycle.test.ts` 新增 `--no-trace-body` 守护进程用例。

## Migration Plan

单次行为变更，无数据/配置迁移。步骤：改 `server.ts` → 改 `lifecycle.ts` / `commands/token-server.ts` → 改测试 → `pnpm typecheck` 与 `pnpm test` 全绿 → 改 help/README → `pnpm build` 与真实 CLI 冒烟（默认写、`--no-trace-body` 不写）。回滚：revert 该变更。

## Open Questions

- 是否在追踪文件上引入轮转 / 大小上限 / 保留最近 N 条？（沿用 `add-token-server-access-log` 的 deferred 项，本变更不做）
- 是否单独开关请求体与响应体？（沿用同一 deferred 项；本变更统一记录两者）