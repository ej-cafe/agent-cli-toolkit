## Why

`token-server` 的转发服务器是手写的 `node:http` 处理器（`packages/token-server/src/server.ts`，约 360 行）：鉴权门、prefix 剥离路由、请求头过滤、凭据注入、流式转发、访问日志与请求/响应体追踪全部挤在同一个 async 函数里。路由与中间件关注点没有显式结构，复查与后续扩展成本高。引入成熟的路由/中间件层可以让这些关注点显式化。

## What Changes

- 用 Express 5 重写 `packages/token-server/src/server.ts` 的 HTTP 层：用 `express()` app 承载请求处理，`createTokenServer(options)` 返回 Express `Application`，启动交给调用方（`app.listen`）。`server.ts` 不再 import `node:http`。
- 严格保持可观察行为不变：`/v1` 与 `/anthropic` 前缀剥离及上游 URL 拼接、查询串原样转发、`Authorization: Bearer <key>` / `x-api-key: <key>` 鉴权门、`401/503/500/502` 分支、请求头过滤（`authorization` / `x-api-key` / `host` / 逐跳头）、凭据注入、上游状态码与响应头/响应体透传、SSE 不缓冲边收边发、访问记录与请求/响应体追踪的全部字段与写入时机。
- 关闭 Express 会引入差异的默认行为：禁用 `x-powered-by`，不使用任何 body parser / `express.json()`，保留原始请求流与上游流之间的旁路捕获（`req.pipe(capture)`、`source.pipe(res)`）。
- 新增依赖：`express@^5.3.0`（运行时，由 esbuild 打进 `dist/main.js`）、`@types/express@^5`（开发）。
- **BREAKING**：无。对外 CLI 命令、帮助文本、spec 行为与配置文件格式均不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

（无）纯实现重构，spec 定义的外部行为契约不变；本 change 在 `.openspec.yaml` 声明 `skip_specs: true`。

## Impact

- 代码：重写 `packages/token-server/src/server.ts`（不依赖 `node:http`）；`lifecycle.ts` 改用 `app.listen` 启动并持有其返回的 server 句柄；更新三处测试启动辅助（`server` / `access-log` / `e2e` 测试）；`packages/token-server/package.json`（新增 deps/devDeps）；`pnpm-workspace.yaml`（catalog 增加 express 与 @types/express）。`commands/token-server.ts`、`paths.ts`、`access-log.ts`、`access-body-log.ts` 与 `packages/commands/src/help.ts` 不改。
- 依赖：首次引入第三方运行时依赖；`dist/main.js` 体积增大（express 及被 require 的传递依赖被打包），但发布包仍自包含、无安装期依赖。
- 测试：现有 token-server 测试（`server` / `access-log` / `lifecycle` / `e2e` / `command` / `use`）与 `pnpm typecheck`、`pnpm test` 必须全绿，作为行为兼容的判据。
- 系统：无 spec / CLI / 文档行为变化。