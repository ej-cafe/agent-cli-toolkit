## Context

动机见 `proposal.md`。当前实现约束（来自代码，非推测）：

- `packages/token-server/src/server.ts` 用 `createServer(handler)`（`node:http`），单 async 处理器内顺序完成：解析 URL → 注册 `res.once("finish")`（写访问记录 / 追踪）→ 鉴权 → 解析 profile → 解析上游 URL → 构造转发头与流式 body → `fetch` 上游 → `writeHead` 并 `pipe` 响应。
- 调用方（`lifecycle.ts` 与 `test/server.test.ts`、`test/access-log.test.ts`、`test/e2e.test.ts`）用 Express `app.listen(port, host)` 启动，并持有其返回的 `http.Server` 句柄用于 `.address()` / `.close()`；`createTokenServer` 只返回未监听的 `Application`。
- `openspec/specs/token-server/spec.md` 是行为契约（9 个 requirement）；本 change 为纯重构，`skip_specs: true`。
- 项目约束：TypeScript `strict` + `verbatimModuleSyntax` + `module`/`moduleResolution` 为 `NodeNext`；相对导入带 `.js`；只用 pnpm；发布产物是自包含单文件 bundle（`scripts/bundle.mjs` 无 `external`）。

## Goals / Non-Goals

**Goals:**

- Express 作为唯一的 HTTP 层，让路由/鉴权/转发/日志关注点显式化。
- `server.ts` 完全不依赖 `node:http`，只通过 Express API 组装与暴露服务。
- 现有可观察行为与现有测试逐条保持。

**Non-Goals:**

- 不改 spec、CLI 命令、帮助文本、配置文件格式与日志/追踪字段。
- 不引入 body parser、CORS、压缩、模板、session 等中间件。
- 不改 daemon / pidfile / 前后台生命周期。
- 不做响应头改写或性能调优。

## Decisions

1. **Express 5（`^5.3.0`）而非 4。** 理由：当前维护版本，支持 Node ≥ 18（本仓库 `engines.node >= 20`），无阻碍项；4.x 已进入维护期。备选：继续手写 `node:http`（因可读性/扩展性诉求被否）、Fastify/Koa（用户指定 Express）。
2. **`createTokenServer` 返回 Express `Application`，由调用方用 `app.listen()` 启动。** 理由：要求「完全使用 Express，不直接依赖 `node:http`」。`app.listen()` 内部即 `http.createServer(this).listen(...)`，因此仍需在调用方持有其返回的 `http.Server` 句柄用于 `.address()` / `.close()`；`createTokenServer` 自身不监听（否则测试无法用端口 0、CLI 也无法先拿到句柄）。句柄类型以 `ReturnType<Application["listen"]>` 表达，使源代码不出现 `node:http`。备选：`createServer(app)` 返回未监听 server（被否：直接依赖 `node:http`）。
3. **`app.use(handler)` 兜底而非显式路由表。** 理由：现行为是「任何路径都转发」；`app.use` 匹配全部路径且不改写 `req.url`。Express 5 的 `app.all("*")` 因 path-to-regexp v8 通配语法变化不可用。仍用 `new URL(req.url ?? "/", "http://127.0.0.1")` 解析 pathname/search，不使用 `req.path`/`req.query`，逐字复现现有转发路径与访问日志 `path`。
4. **显式关闭会引入可观察差异的默认项。** `app.disable("x-powered-by")`；不注册任何 body parser；沿用原有响应头处理（丢弃逐跳头与 `content-length`/`content-encoding`）。不使用 `res.send`/`res.json`，保持 `writeHead` + `end`/`pipe`。
5. **终态错误处理器。** Express 5 会把 async handler 的 rejection 交给错误中间件，而现状是未被捕获的 promise（行为未定义）。新增 `(err, req, res, next)` 终态处理器：经注入的 `log()` 记录、以 500 `text/plain` 结束、不泄露任何 secret。仅在 spec 未定义的内部异常路径生效。
6. **依赖与打包。** `express` 与 `@types/express` 加入 pnpm `catalog` 并以 `catalog:` 引用（与 `esbuild`/`tsx`/`typescript` 风格一致）。esbuild 无 `external`，express 及其被 require 的传递依赖会打进 `dist/main.js`；体积增大，但发布包仍自包含。
7. **流式与追踪机制不变。** `req`（`IncomingMessage`）与上游 `Readable.fromWeb(upstream.body)` 仍是原生流，`req.pipe(capture)`、`source.pipe(res)`、`res.once("finish")`、`BodyCapture` 逻辑保持不变，SSE 仍不缓冲。

## Risks / Trade-offs

- **Express 覆盖 `res.writeHead`** → 代理响应的状态码/头可能出现细微差异。Mitigation：新增断言覆盖代理响应的 status 与 headers（上游 `content-type` 原样透传、无 `x-powered-by`、逐跳头被丢弃）。
- **引入首个第三方运行时依赖（含大量传递依赖）** → 供应链面与 bundle 体积增大。Mitigation：只用 express 核心，不加其他中间件；锁定 `^5`；在任务中记录体积变化。
- **`req.url` 解析差异**（Express 的 `req.path` 会做处理/解码）→ 可能改变转发路径与访问日志 `path`。Mitigation：Decision 3，继续用 `new URL(req.url)`。
- **Express 5 的 async rejection 处理**改变异常路径行为。Mitigation：Decision 5 的终态错误处理器。
- **`verbatimModuleSyntax` + CJS express 的默认导入**。Mitigation：`module: NodeNext` 下 `esModuleInterop` 默认为真，`import express from "express"` 在类型与运行时均可解析；以 `pnpm typecheck` 验证，失败则改用 `createRequire` 显式加载。

## Migration Plan

单次重构，无数据或配置迁移。步骤：加依赖 → 重写 `server.ts` → `pnpm typecheck` 与 `pnpm test` 全绿 → `pnpm build` 与真实 CLI 冒烟。回滚：revert 该变更（无副作用残留）。

## Open Questions

- 是否在后续 change 中更新 help/README 说明服务器基于 Express（本 change 刻意不改文档）。