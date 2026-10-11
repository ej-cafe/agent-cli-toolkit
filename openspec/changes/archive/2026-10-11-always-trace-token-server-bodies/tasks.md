## 1. 规格与代码

- [x] 1.1 更新本变更 spec delta：追踪默认开启，提供 `--no-trace-body` 关闭，移除 `--trace-body`
- [x] 1.2 `packages/token-server/src/server.ts`：`TokenServerOptions` 改 `traceBody?: boolean`（默认 true）；仅当 `traceBody === false` 时不创建 body logger
- [x] 1.3 `packages/token-server/src/lifecycle.ts`：`runForeground(port, printCredentials = false, traceBody = true)` 与 `startDaemon(port, traceBody = true)`；关闭时向守护子进程追加 `--no-trace-body`
- [x] 1.4 `packages/token-server/src/commands/token-server.ts`：`start` 解析 `--no-trace-body`，`traceBody = !values["no-trace-body"]`，用法行加 `[--no-trace-body]`；`packages/token-server/src/paths.ts` 注释改为「默认写入，`--no-trace-body` 时关闭」
- [x] 1.5 `packages/commands/src/help.ts`：用法行加 `[--no-trace-body]`，新增该标志说明，`token-server` 段改为「默认追踪请求体与响应体，`--no-trace-body` 关闭」

## 2. 测试

- [x] 2.1 `packages/token-server/test/access-log.test.ts`：`StartOptions` 改 `traceBody`（默认透传 `true`），保留「默认即写入」断言，新增 `traceBody: false` 时不创建追踪文件
- [x] 2.2 `packages/token-server/test/lifecycle.test.ts`：保留默认守护进程写入请求体与响应体；新增 `--no-trace-body` 守护进程不写追踪文件
- [x] 2.3 `packages/commands/test/help.test.ts`：断言含 `--no-trace-body`、不含 `--trace-body`

## 3. 文档与验证

- [x] 3.1 `README.md`：文件清单与用法行加 `--no-trace-body`，追踪段落改为默认开启并说明关闭标志，保留敏感数据提示
- [x] 3.2 `pnpm typecheck` 与 `pnpm test` 全绿
- [x] 3.3 `pnpm build` 成功，产物自包含（无未打包的 `require("express")`）
- [x] 3.4 真实 CLI 冒烟：默认（不带开关）写入 `token-server-access-body.jsonl`；`--no-trace-body` 不写；401 不写追踪；`time` 关联；无凭据泄露
- [x] 3.5 `openspec validate always-trace-token-server-bodies` 与 `openspec validate --specs` 通过