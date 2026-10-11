## ADDED Requirements

### Requirement: 记录代理访问数据

系统必须为每个到达转发服务器的入站请求（无论成功还是失败）追加一条访问记录到配置目录下的 `token-server-access.jsonl`，一条 JSON 对象占一行（JSON Lines），文件缺失时按需创建，记录跨重启保留。

每条记录必须包含：`time`（ISO 8601 时间戳）、`method`（HTTP 方法）、`path`（请求路径，不含查询串）、`status`（返回给客户端的状态码）、`profile`（本次请求使用的激活 profile 名；未解析到时为 `null`）、`durationMs`（请求处理耗时毫秒）、`error`（失败类别；成功时为 `null`）。失败类别必须至少区分：鉴权失败（401）、无激活 profile 或读取 profile 失败（503）、上游 baseUrl 无效（500）、上游请求失败（502）。

访问记录不得包含：profile 的 token、服务器 API key、`Authorization` 或 `x-api-key` 头值、任何入站或出站请求头、请求体、响应体以及查询串。请求体与响应体内容只能经「追踪请求体与响应体」要求写入独立文件。

访问记录必须始终开启，不提供关闭开关。访问记录必须在响应结束后写入，且写入失败不得改变响应、不得中断服务器或影响后续请求；写入失败最多在 stderr 提示一次。记录写入不得阻塞上游响应的流式转发。

系统不提供查看访问记录的 CLI 子命令。

#### Scenario: 成功转发记录一条

- **WHEN** 服务器有可用激活 profile，客户端携带正确 key 请求 `POST /v1/chat/completions` 且上游返回 200
- **THEN** 访问日志新增一行 JSON，其 `method` 为 `POST`、`path` 为 `/v1/chat/completions`、`status` 为 200、`profile` 为激活 profile 名、`error` 为 `null`，且含 `time` 与数值 `durationMs`

#### Scenario: 鉴权失败记录 401

- **WHEN** 客户端未携带或携带错误的服务器 key 请求转发路径
- **THEN** 响应为 401，且访问日志新增一行 `status` 为 401、`error` 标识鉴权失败、且未发起上游请求的记录

#### Scenario: 无激活 profile 记录 503

- **WHEN** 没有可用的激活 profile，客户端携带正确 key 请求转发路径
- **THEN** 响应为 503，且访问日志新增一行 `status` 为 503、`profile` 为 `null`、`error` 标识无激活 profile 的记录

#### Scenario: 上游失败记录 502

- **WHEN** 激活 profile 的上游地址不可达或请求超时
- **THEN** 响应为 502，且访问日志新增一行 `status` 为 502、`error` 标识上游失败的记录

#### Scenario: 访问记录不包含敏感信息与请求/响应体

- **WHEN** 任意请求通过代理，访问日志写入记录
- **THEN** 记录中不出现 profile 的 token、服务器 API key、`Authorization` 或 `x-api-key` 头值、请求头、响应头、请求体、响应体与查询串

#### Scenario: 写入失败不影响响应

- **WHEN** 访问日志文件不可写（例如所在目录不可写）
- **THEN** 系统仍按原状态码与响应体应答请求，服务器继续处理后续请求，最多在 stderr 提示一次，且不抛出错误

#### Scenario: 记录在响应完成后写入

- **WHEN** 上游返回 `text/event-stream` 分块响应
- **THEN** 访问记录在该响应结束后才写入，且记录写入不阻断已到达分块的转发

#### Scenario: 始终记录且无查看子命令

- **WHEN** 未设置任何开关，服务器处理请求
- **THEN** 访问记录照常写入，且不存在用于查看记录的 `token-server` 子命令

### Requirement: 追踪请求体与响应体

系统必须提供 opt-in 的请求体与响应体追踪：只有在 `token-server start --trace-body` 开启时，才把已通过鉴权、进入转发阶段的入站请求的请求体与上游响应体追加到配置目录下的 `token-server-access-body.jsonl`（一条 JSON 对象占一行，JSON Lines，跨重启保留）。默认必须关闭；未开启时不得创建或写入该文件。追踪记录与主访问记录用相同的 `time` 关联。

每条追踪记录必须包含：`time`（与对应访问记录一致的 ISO 8601 时间戳）、`method`、`path`（不含查询串）、`profile`（激活 profile 名或 `null`）、`requestContentType`（入站 `content-type` 或 `null`）、`requestBody`（请求体文本或 `null`）、`requestBodyTruncated`（是否因超出上限被截断）、`requestBodySkipped`（跳过原因，未跳过时为 `null`）、`responseStatus`（返回给客户端的状态码）、`responseContentType`（上游 `content-type` 或 `null`）、`responseBody`（响应体文本或 `null`）、`responseBodyTruncated`（是否因超出上限被截断）、`responseBodySkipped`（跳过原因，未跳过时为 `null`）。

请求体与响应体的追踪必须各自遵守以下限制：

- 只追踪文本类内容类型（`application/json`、`application/x-ndjson`、`text/*`、`application/x-www-form-urlencoded`）；其他内容类型只写对应的 skipped 字段（值为内容类型），body 为 `null`。
- `GET` / `HEAD` 没有请求体，请求体字段为 `null`，但必须照常记录响应体。
- 请求体或响应体单侧超过 64 KiB 时只保留前 64 KiB 并置对应的 truncated 为 `true`，转发给上游与客户端的内容保持完整。
- 必须记录流式响应（如 `text/event-stream`）、与之对应的上游响应体在转发时旁路捕获，且不缓冲、不阻塞分块转发。
- 未通过鉴权、无激活 profile 或 baseUrl 无效的请求在读取请求体前即被拒绝，因此不产生追踪记录。
- 追踪记录不得包含服务器 API key、profile 的 token、`Authorization` 或 `x-api-key` 头值、其他请求头或响应头、查询串。
- 追踪写入失败不得改变响应、不得中断服务器或影响后续请求，最多在 stderr 提示一次。
- 追踪不得缓冲整个请求体或响应体：必须在转发的同时捕获。

#### Scenario: 未开启追踪时不写请求体/响应体

- **WHEN** 以不带 `--trace-body` 的方式启动服务器并处理请求
- **THEN** 不创建也不写入 `token-server-access-body.jsonl`，主访问记录照常写入

#### Scenario: 开启追踪时记录请求体与响应体

- **WHEN** 以 `--trace-body` 启动，客户端携带正确 key 发送 `POST /v1/chat/completions` 且请求 `content-type` 为 `application/json`、上游返回 200 与文本响应
- **THEN** 追踪文件新增一行，其 `requestBody` 与 `responseBody` 均为原始文本、`responseStatus` 为 200、两个 skipped 字段均为 `null`、两个 truncated 均为 `false`，且 `time` 与对应访问记录一致

#### Scenario: 超上限时截断单侧内容

- **WHEN** 开启追踪且请求体或响应体超过 64 KiB
- **THEN** 对应的 body 字段只含前 64 KiB 且 truncated 为 `true`，而转发给上游/客户端的内容保持完整

#### Scenario: 非文本内容类型只记跳过原因

- **WHEN** 开启追踪且请求或响应 `content-type` 为 `image/png` 等非文本类型
- **THEN** 对应 body 为 `null`、skipped 为该内容类型，且不写入任何字节

#### Scenario: GET 请求仍记录响应体

- **WHEN** 开启追踪且客户端发送 `GET /v1/models`，上游返回文本响应
- **THEN** 追踪记录的请求体字段为 `null`，且 `responseBody` 为上游响应文本

#### Scenario: 记录流式响应体

- **WHEN** 开启追踪且上游返回 `text/event-stream` 分块响应
- **THEN** 响应体在转发时旁路捕获，追踪记录在该响应结束后写入，且不阻断已到达分块的转发

#### Scenario: 追踪不泄露凭据

- **WHEN** 开启追踪且请求携带查询串与自定义请求/响应头
- **THEN** 追踪记录不含服务器 API key、profile 的 token、`Authorization` / `x-api-key` 头值、其他请求或响应头或查询串

#### Scenario: 未鉴权请求不写追踪

- **WHEN** 开启追踪但客户端未携带或携带错误的服务器 key
- **THEN** 响应为 401，且 `token-server-access-body.jsonl` 不为该请求写入记录

#### Scenario: 追踪写入失败不影响转发

- **WHEN** 开启追踪但 `token-server-access-body.jsonl` 不可写
- **THEN** 系统仍按原状态码与响应体应答请求，服务器继续处理后续请求，最多在 stderr 提示一次，且不抛出错误