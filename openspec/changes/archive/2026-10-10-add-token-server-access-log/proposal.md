## Why

`token-server` 已经代理本机所有 AI 客户端流量，但除运行日志外没有任何可查询的访问记录。出问题时无法回答「刚才哪个客户端、请求了哪个路径、成功还是失败、耗时多少」，也无法事后审计代理使用情况。部分排查场景（上游报错、模型不认参数、prompt 出问题）还需要看到**请求体内容**，但请求体往往含用户数据，不适合无条件落盘。

## What Changes

- `token-server` 为每个入站请求（成功与失败都包括）追加一条结构化访问记录到配置目录下 `token-server-access.jsonl`（JSON Lines，跨重启保留）。
- 每条访问记录包含：时间戳（ISO 8601）、HTTP 方法、请求路径（不含查询串）、返回给客户端的状态码、激活 profile 名（无则为 `null`）、耗时毫秒、错误类别（成功为 `null`）。
- 访问记录**不得**包含 token、服务器 API key、`Authorization`/`x-api-key` 头值、请求头、请求体、响应体，也不写查询串。
- 记录始终开启，不提供关闭开关；**不新增查看子命令**，用户直接读取该 JSONL 文件（如 `jq`、`cat`）。
- 记录写入失败**不得**影响响应或中断服务器，最多在 stderr 提示一次；记录在响应完成后写入，不阻塞流式转发。
- 不复用现有 `token-server.log`；访问记录写入独立文件。
- **请求体与响应体追踪（opt-in）**：`token-server start --trace-body` 开启后，已通过鉴权、进入转发阶段的请求会把入站请求体与上游响应体追加到配置目录下独立文件 `token-server-access-body.jsonl`（JSON Lines），与主访问记录用相同 `time` 关联。默认**关闭**。请求体与响应体各自只记文本类内容类型（`application/json`、`text/*`、`application/x-www-form-urlencoded`、`application/x-ndjson`），其他类型只记对应的 skipped 字段；单侧超过 64 KiB 截断并置 truncated；记录响应状态与响应内容类型；不记请求/响应头、查询串、token 或服务器 key。追踪在转发时旁路捕获，不缓冲完整内容、不阻塞流式转发；写入失败同样不影响转发。
- 在 README 记录两个文件的位置与格式。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-server`: 新增「记录代理访问数据」与「追踪请求体与响应体」两条要求。

## Impact

- 代码：`packages/token-server/src/server.ts`、新增访问记录写入模块、`packages/token-server/src/paths.ts`（新增访问记录与请求体追踪文件路径）、`packages/token-server/src/lifecycle.ts`（注入 profile 名解析、请求体追踪开关）、`packages/token-server/src/commands/token-server.ts`（`start --trace-body`）、`packages/commands/src/help.ts`、`README.md`。
- 行为：新增两个本地文件与一个 opt-in 标志；不改变现有转发、鉴权、`switch` / `use` / `stop` 行为，默认路径（未加 `--trace-body`）不写请求体。
- 依赖：仅使用 Node 内置模块（`node:fs`、`node:stream`），无新增运行时依赖。