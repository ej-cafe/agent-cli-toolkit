## 1. 访问记录写入

- [x] 1.1 在 `packages/token-server/src/paths.ts` 新增 `accessLogPath()`（返回 `getConfigDir()` 下的 `token-server-access.jsonl`）；`packages/token-server/test/access-log.test.ts` 覆盖其路径拼接，运行 `node --import tsx --test packages/token-server/test/access-log.test.ts` 通过
- [x] 1.2 新增 `packages/token-server/src/access-log.ts`：定义记录类型与字段（`time` / `method` / `path` / `status` / `profile` / `durationMs` / `error`），提供同步追加写入 `appendFileSync(path, line, { flag: "a" })` 的记录函数，写入失败只向 stderr 提示一次且不抛出；单测断言成功追加出一行可解析 JSON，且目标不可写时函数不抛异常，测试通过
- [x] 1.3 在 `packages/token-server/src/server.ts` 增加可选 `resolveProfileName?: () => string | undefined`，在 `handleRequest` 起始处注册 `res.on("finish")` 并在各分支记录失败类别（`invalid_api_key` / `no_active_profile` / `profile_read_failed` / `invalid_base_url` / `upstream_failed`，成功为 `null`），响应结束后写一条记录且 `path` 不含查询串；测试覆盖成功/401/503/502 与不泄露 token、key、请求头、请求体，测试通过
- [x] 1.4 在 `packages/token-server/src/lifecycle.ts` 的 `createTokenServer` 注入 `resolveProfileName: readActiveProfile`，使记录中的 `profile` 为激活 profile 名；测试断言记录含激活 profile 名，测试通过

## 2. 测试

- [x] 2.1 在 `packages/token-server/test/access-log.test.ts` 补齐：写入失败不影响响应、SSE 记录在响应完成后写入、未配置 `resolveProfileName` 时 `profile` 为 `null`；运行 `node --import tsx --test packages/token-server/test/access-log.test.ts` 通过

## 3. 文档

- [x] 3.1 在 `README.md` 的 token-server 段落说明访问记录：文件位置 `token-server-access.jsonl`、JSON Lines 格式、字段、始终开启、不含 token/key，并人工核对描述与实现一致

## 4. 验证（访问记录）

- [x] 4.1 运行 `pnpm typecheck` 通过（`tsc -b`，含各包 emit）
- [x] 4.2 运行 `pnpm test` 全部通过（含新增的访问记录测试）
- [x] 4.3 运行 `openspec validate add-token-server-access-log` 通过（RFC 2119 警告可忽略）

## 5. 请求体追踪（opt-in）

- [x] 5.1 在 `packages/token-server/src/paths.ts` 新增 `accessBodyLogPath()`（返回 `getConfigDir()` 下的 `token-server-access-body.jsonl`）；在 `packages/token-server/test/access-log.test.ts` 覆盖路径拼接，测试通过
- [x] 5.2 新增请求体追踪模块（`packages/token-server/src/access-body-log.ts`）：定义记录类型（`time` / `method` / `path` / `profile` / `contentType` / `body` / `bodyTruncated` / `bodySkipped`）、`BodyCapture`（`Transform`，旁路累计前 64 KiB，转发字节保持完整，`bodyTruncated` 标记超限）与 `createAccessBodyLogger`（同步追加、写入失败只提示一次且不抛出）；判断文本内容类型（`application/json`、`application/x-ndjson`、`text/*`、`application/x-www-form-urlencoded`）
- [x] 5.3 在 `packages/token-server/src/server.ts` 增加可选 `traceRequestBody?: boolean` 与 `accessBodyLogPath?: string`：鉴权与 profile 解析通过后，用 `BodyCapture` 旁路捕获入站请求体再交给上游（不缓冲整个请求体、不改变转发语义）；在 `res.on("finish")` 中与访问记录用同一 `time` 写一条追踪记录；401 / 503 / 500 等拒绝路径不写追踪；未开启时不创建文件
- [x] 5.4 在 `packages/token-server/src/lifecycle.ts` 透传 `traceRequestBody` 到 `createTokenServer`，并让 `startDaemon` 在开启时把 `--trace-body` 传给守护子进程；在 `packages/token-server/src/commands/token-server.ts` 的 `start` 解析 `--trace-body`（布尔，默认 false），同步更新 `packages/commands/src/help.ts` 的用法与标志说明
- [x] 5.5 在 `packages/token-server/test/access-log.test.ts` 补齐请求体追踪用例：开启后记录 JSON 体且 `time` 与访问记录一致；未开启不写文件；超 64 KiB 截断但转发完整；非文本类型只写 `bodySkipped`；`GET` 不写；401 不写；不泄露 key/token/头/查询串/响应体；写入失败不影响转发；运行 `node --import tsx --test packages/token-server/test/access-log.test.ts` 通过
- [x] 5.6 在 `README.md` 的 token-server 段落补充请求体追踪：`--trace-body` 开关、文件位置 `token-server-access-body.jsonl`、字段、文本类型限制与 64 KiB 上限、默认关闭与敏感数据警告，并人工核对描述与实现一致

## 6. 验证（请求体追踪后复跑）

- [x] 6.1 运行 `pnpm typecheck` 通过
- [x] 6.2 运行 `pnpm test` 全部通过（含访问记录与请求体追踪测试）
- [x] 6.3 运行 `openspec validate add-token-server-access-log` 通过（RFC 2119 警告可忽略）
- [x] 6.4 用 `--trace-body` 手动冒烟：启动服务器，发一条 JSON 请求与一条非文本请求，核对 `token-server-access-body.jsonl` 内容、`time` 关联与不泄露敏感信息

## 7. 响应体追踪（补充）

- [x] 7.1 把追踪记录类型从「请求体」扩展为「请求+响应」：`requestContentType` / `requestBody` / `requestBodyTruncated` / `requestBodySkipped` 与 `responseStatus` / `responseContentType` / `responseBody` / `responseBodyTruncated` / `responseBodySkipped`（`packages/token-server/src/access-body-log.ts`）
- [x] 7.2 在 `packages/token-server/src/server.ts` 响应侧用 `BodyCapture` 旁路捕获上游响应体（`Readable.fromWeb(upstream.body).pipe(tee).pipe(res)`），不缓冲完整响应、不阻塞 SSE；追踪开启时即使 `GET`/无请求体也写记录
- [x] 7.3 更新 `packages/token-server/test/access-log.test.ts`：改名后的请求体字段、`GET` 仍记响应体、流式响应体记录、响应体截断/非文本跳过、响应侧不泄露；运行 `node --import tsx --test packages/token-server/test/access-log.test.ts` 通过
- [x] 7.4 更新 `README.md` 与 `packages/commands/src/help.ts` 的请求体追踪说明为「请求体与响应体」，列全新字段与限制

## 8. 验证（响应体追踪后复跑）

- [x] 8.1 运行 `pnpm typecheck` 通过
- [x] 8.2 运行 `pnpm test` 全部通过
- [x] 8.3 运行 `openspec validate add-token-server-access-log` 通过
- [x] 8.4 用 `--trace-body` 手动冒烟：核对请求体与响应体均已记录、`time` 关联、流式响应可追踪、无敏感信息泄露