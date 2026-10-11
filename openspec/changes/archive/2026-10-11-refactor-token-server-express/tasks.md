## 1. 依赖

- [x] 1.1 在 `pnpm-workspace.yaml` 的 `catalog` 增加 `express: ^5.3.0` 与 `"@types/express": ^5.0.6`，执行 `pnpm install` 确认安装成功且 `pnpm-lock.yaml` 更新
- [x] 1.2 在 `packages/token-server/package.json` 以 `catalog:` 加入 `express`（dependencies）与 `@types/express`（devDependencies），执行 `pnpm --filter @agent-cli-toolkit/token-server build` 确认通过

## 2. 重写 HTTP 层

- [x] 2.1 用 `express()` 创建 app，令 `createTokenServer(options)` 返回 `createServer(app)`（仍是 `node:http` 的 `Server`），执行 `pnpm typecheck` 通过
- [x] 2.2 用 `app.disable("x-powered-by")` + `app.use(handler)` 兜底承载原单函数逻辑（鉴权门 → profile 解析 → 上游路由 → 转发 → 访问记录/追踪挂钩），执行 `pnpm typecheck` 通过
- [x] 2.3 逐字保留 pathname/search 解析、`/v1` 与 `/anthropic` 前缀剥离、请求头过滤与凭据注入、SSE 流式透传，以及 `req.pipe(capture)` / `Readable.toWeb` / `source.pipe(res)` / `res.once("finish")` 逻辑
- [x] 2.4 增加终态错误处理器 `(err, req, res, next)`：经注入 `log()` 记录并以 500 `text/plain` 结束且不泄露 secret

## 3. 行为兼容验证

- [x] 3.1 `node --import tsx --test packages/token-server/test/server.test.ts` 全绿（路由、鉴权、头过滤、流式、502/503 分支）
- [x] 3.2 `node --import tsx --test packages/token-server/test/access-log.test.ts` 全绿（访问记录与请求/响应体追踪字段及写入时机不变）
- [x] 3.3 `node --import tsx --test packages/token-server/test/lifecycle.test.ts packages/token-server/test/e2e.test.ts packages/token-server/test/command.test.ts packages/token-server/test/use.test.ts` 全绿
- [x] 3.4 在 `packages/token-server/test/server.test.ts` 增加断言：代理响应不含 `x-powered-by` 头，且上游 `content-type` 与状态码原样透传
- [x] 3.5 `pnpm typecheck` 与 `pnpm test` 全绿（含 `packages/commands/test/help.test.ts` 的帮助文本断言）

## 4. 打包与端到端冒烟

- [x] 4.1 `pnpm build` 成功；记录 `dist/main.js` 体积变化，并确认产物自包含（无未打包的 `require("express")` 外部引用）
- [x] 4.2 用真实 CLI 冒烟：隔离 `XDG_CONFIG_HOME` 下 `agent-cli token-server start --foreground --trace-body`，验证 `/v1` 转发、401、SSE 透传、`token-server-access.jsonl` 与 `token-server-access-body.jsonl` 写入正常
- [x] 4.3 `openspec validate refactor-token-server-express` 通过，并确认主 spec 未改动（`openspec validate --specs` 仍通过）

## 5. 去掉 node:http，改用 Express 启动

- [x] 5.1 `server.ts` 移除 `node:http` import，handler 与辅助函数改用 Express 类型，`createTokenServer` 返回 `Application`，`pnpm typecheck` 通过
- [x] 5.2 `lifecycle.ts` 改用 `app.listen(port, serverHost)` 启动并持有 `ReturnType<Application["listen"]>` 句柄（`.address()` / `.close()`），移除 `node:http` import
- [x] 5.3 更新 `test/server.test.ts`、`test/access-log.test.ts`、`test/e2e.test.ts` 的启动辅助，改用 `app.listen(0, "127.0.0.1")`
- [x] 5.4 `pnpm typecheck` 与 `pnpm test` 全绿
- [x] 5.5 重新 `pnpm build` 并重跑真实 CLI 冒烟（401 / `/v1` / `/anthropic` / SSE / 访问日志与体追踪）