## Purpose

提供一个本机常驻的凭据注入转发服务器，让 AI 客户端把 baseUrl 指向本地端口即可使用当前激活 token profile，并通过 `token-server switch` 在运行中切换 profile，而无需改写客户端配置或重启客户端。

## ADDED Requirements

### Requirement: 提供 token-server 命令

`agent-cli` 必须提供顶层命令 `token-server`，含子命令 `start`、`stop`、`switch <profile>`、`use`、`gen-api-key`。`token-server start` 必须接受可选的 `--port <port>` 与 `--foreground`。缺少子命令或给出未知子命令时，必须在 stderr 打印用法并以非零退出码结束。

#### Scenario: 分发 start

- **WHEN** 用户执行 `agent-cli token-server start`
- **THEN** 系统启动本地转发服务器

#### Scenario: 分发 stop

- **WHEN** 用户执行 `agent-cli token-server stop`
- **THEN** 系统停止运行中的本地转发服务器

#### Scenario: 分发 switch

- **WHEN** 用户执行 `agent-cli token-server switch <profile>`
- **THEN** 系统把该 profile 设为激活 profile

#### Scenario: 分发 use

- **WHEN** 用户执行 `agent-cli token-server use [--all | --tool <id>] [--model <id>]`
- **THEN** 系统基于当前激活 profile 把选中工具的配置指向本地服务器

#### Scenario: 分发 gen-api-key

- **WHEN** 用户执行 `agent-cli token-server gen-api-key`
- **THEN** 系统生成并持久化服务器 API key

#### Scenario: 未知子命令

- **WHEN** 用户执行 `agent-cli token-server bogus`
- **THEN** stderr 打印用法并以非零退出码结束

#### Scenario: 缺少子命令

- **WHEN** 用户执行 `agent-cli token-server`
- **THEN** stderr 打印用法并以非零退出码结束

### Requirement: 本地转发服务器

系统必须提供仅监听本机回环地址 `127.0.0.1` 的 HTTP 转发服务器，默认端口 `8787`，可用 `start --port <port>` 覆盖。

系统必须按路径路由：以 `/anthropic` 开头（`/anthropic` 本身或 `/anthropic/...`）的请求转发到激活 profile 的 `claudeBaseUrl`，当 `claudeBaseUrl` 缺失或为空时回退到 `baseUrl`，转发路径为去掉 `/anthropic` 前缀后的剩余路径（剩余为空时按 `/` 处理）；其余请求转发到激活 profile 的 `baseUrl`，路径原样保留。查询串必须原样转发。

系统必须在转发前校验入站鉴权：已配置 API key（由 `gen-api-key` 生成，见「API key 生成与请求鉴权」）时，入站 `Authorization` 头必须恰好等于 `Bearer <key>`，或入站 `x-api-key` 头必须恰好等于 `<key>`（分别对应 OpenAI 风格与 Anthropic 风格客户端），否则以 401 响应且不得发起上游请求；未配置任何 key 时，所有请求都必须以 401 拒绝。校验通过后，系统必须移除入站请求的 `authorization`、`x-api-key`、`host` 以及逐跳头（如 `connection`、`keep-alive`、`transfer-encoding`、`upgrade`），并设置 `Authorization: Bearer <激活 profile 的 token>`；对 `/anthropic` 路由还必须同时设置 `x-api-key: <激活 profile 的 token>`。请求方法、查询串与请求体必须原样转发，不得改写请求体，且不得把入站的服务器 key 透传给上游。

系统必须透传上游响应的状态码与响应体，包括 `text/event-stream` 流式响应，且必须边收边发，不得缓冲到响应结束再发送。

无可用的激活 profile 时，系统必须以 503 响应且不得发起上游请求。上游请求失败（网络错误或超时）时，系统必须以 502 响应。任何错误响应体与服务器日志都不得包含 token、API key 或 `Authorization` 值。

#### Scenario: 默认监听与端口覆盖

- **WHEN** 用户执行 `agent-cli token-server start`（未指定 `--port`）
- **THEN** 服务器监听 `127.0.0.1:8787`；当指定 `--port <port>` 时监听该端口

#### Scenario: OpenAI 兼容路径转发到 baseUrl

- **WHEN** 客户端请求 `http://127.0.0.1:8787/v1/chat/completions?x=1`
- **THEN** 系统把该请求转发到 `<激活 profile 的 baseUrl>/v1/chat/completions?x=1`

#### Scenario: Anthropic 兼容路径转发到 claudeBaseUrl

- **WHEN** 激活 profile 设置了非空 `claudeBaseUrl`，客户端请求 `http://127.0.0.1:8787/anthropic/v1/messages`
- **THEN** 系统把该请求转发到 `<claudeBaseUrl>/v1/messages`

#### Scenario: Anthropic 路由回退 baseUrl

- **WHEN** 激活 profile 未设置 `claudeBaseUrl`，客户端请求 `http://127.0.0.1:8787/anthropic/v1/messages`
- **THEN** 系统把该请求转发到 `<baseUrl>/v1/messages`

#### Scenario: 注入凭据头

- **WHEN** 客户端请求携带 `authorization: Bearer <服务器 key>`（通过鉴权），或携带 `x-api-key: <服务器 key>`
- **THEN** 系统移除这些入站头，以激活 profile 的 token 设置 `Authorization: Bearer <token>`，对 `/anthropic` 路由同时设置 `x-api-key: <token>`，且服务器 key 不出现在上游请求中

#### Scenario: 流式透传上游响应

- **WHEN** 上游返回 `Content-Type: text/event-stream` 的分块响应
- **THEN** 系统随上游分块到达即写入客户端响应，不等待上游结束

#### Scenario: 无激活 profile 时返回 503

- **WHEN** 尚未 `switch` 任何 profile，且客户端携带正确 key 请求转发路径
- **THEN** 系统以 503 响应且不发起上游请求

#### Scenario: 未携带或携带错误的 key 返回 401

- **WHEN** 客户端未携带 `Authorization` 头或 `x-api-key` 头、携带的 `Bearer <key>` 或 `x-api-key` 与已配置 key 不匹配，或服务器尚未生成 key
- **THEN** 系统以 401 响应且不发起上游请求，响应体与日志不泄露 key

#### Scenario: 上游失败返回 502

- **WHEN** 激活 profile 的上游地址不可达或请求超时
- **THEN** 系统以 502 响应

#### Scenario: 不泄露 token

- **WHEN** 转发失败或写入日志与错误响应
- **THEN** 输出中不出现 profile 的 token，也不出现 `Authorization` 值

### Requirement: 激活 profile 与切换

系统必须把激活 profile 名称持久化到配置目录下 `token-server.json` 的 `activeProfile` 字段。

`token-server switch <profile>` 必须在 profile 存在时写入该字段并以退出码 0 结束；profile 不存在时必须报错、以非零退出码结束，且不得改变原有激活值。`token-server use` 不得改变该字段（见「use 命令」）。

运行中的服务器必须在每次请求时读取当前激活 profile 及其内容（每次请求都反映磁盘上的最新值），使切换后的下一个请求即使用新的 profile，无需重启服务器。

`start` 在不存在激活 profile 时必须以非零退出码结束并提示先执行 `token-server switch <profile>`，且不得启动服务器。

#### Scenario: switch 持久化激活 profile

- **WHEN** 用户执行 `agent-cli token-server switch work` 且 profile `work` 存在
- **THEN** `token-server.json` 的 `activeProfile` 为 `work`

#### Scenario: switch 不存在的 profile

- **WHEN** 用户执行 `agent-cli token-server switch missing` 且该 profile 不存在
- **THEN** 系统报错并以非零退出码结束，且原有 `activeProfile` 不变

#### Scenario: 运行中切换立即生效

- **WHEN** 服务器正在运行且激活 profile 为 A，用户切换到 profile B
- **THEN** 切换后的下一个请求使用 profile B 的 baseUrl 与 token，无需重启

#### Scenario: start 无激活 profile

- **WHEN** 用户执行 `agent-cli token-server start` 且尚未设置激活 profile
- **THEN** 系统报错提示先运行 `token-server switch <profile>`，以非零退出码结束，且不启动服务器

### Requirement: API key 生成与请求鉴权

系统必须提供 `token-server gen-api-key`：用安全随机源生成前缀为 `tsk_` 的 key，原子写入配置目录下 `token-server.key`（文件权限 0600），并在生成时把 key 打印到 stdout（仅本次生成打印一次），随后以退出码 0 结束。重复执行 `gen-api-key` 必须视为轮换：新 key 覆盖旧 key 并立即生效，stderr 提示旧 key 已失效。`gen-api-key` 不得接受多余的位置参数，多余参数时报错并以非零退出码结束。

运行中的服务器必须在每次请求时重新读取 `token-server.key` 并校验入站 `Authorization: Bearer <key>` 或 `x-api-key: <key>`（缺失或不匹配 → 401 且不发起上游请求，见「本地转发服务器」），使轮换后的下一个请求立即生效；key 不得出现在日志、错误响应或帮助文本中。

`token-server start`、`start --foreground` 与 `token-server use` 在尚未生成 API key 时必须以非零退出码报错，提示先执行 `agent-cli token-server gen-api-key`，且不得启动服务器或改写任何工具配置。

#### Scenario: gen-api-key 生成并持久化

- **WHEN** 用户执行 `agent-cli token-server gen-api-key`
- **THEN** stdout 打印一个 `tsk_` 前缀的 key（仅一次），`token-server.key` 以 0600 权限保存该 key，命令以退出码 0 结束

#### Scenario: gen-api-key 轮换

- **WHEN** 用户已执行过一次 `gen-api-key`，再次执行
- **THEN** 新 key 覆盖旧 key、旧 key 立即失效，stderr 提示旧 key 已失效

#### Scenario: 服务器拒绝无 key 的请求

- **WHEN** 已生成 key，客户端请求未携带 `Authorization` 头
- **THEN** 系统以 401 响应且不发起上游请求

#### Scenario: start 未生成 key 时报错

- **WHEN** 已设置激活 profile 但尚未生成 key，用户执行 `agent-cli token-server start`
- **THEN** 系统报错提示先执行 `gen-api-key`，以非零退出码结束，且不启动服务器

### Requirement: use 命令

`token-server use` 必须不接收任何 profile 位置参数（给出多余位置参数时必须报错），并且必须不改变当前激活 profile 值；它基于 `switch` 已确定的激活 profile（名字与其模型列表）把选中的工具配置为指向本地服务器。没有激活 profile 时必须以非零退出码报错，提示先执行 `token-server switch <profile>`。激活 profile 名对应的 profile 已被删除，或尚未生成 API key（提示 `gen-api-key`）时，也必须以非零退出码报错且不得改写任何工具配置。

工具选择必须与 `token use` 语义一致：`--all` 选择全部支持的四种工具；一个或多个 `--tool <id>` 选择指定工具（`claude-code` / `opencode` / `dsh` / `pi`）；两者都没有时以交互问答选择（编号或 id，逗号/空格分隔）。未知工具 id 或空选择必须报错。

工具的 `apiKey` / 凭据字段必须写为生成的服务器 key，`baseUrl` 必须写为本地服务器地址：Claude Code 写 `http://127.0.0.1:<端口>/anthropic`（服务器将其路由到 `claudeBaseUrl`），OpenCode、dsh 与 pi 写 `http://127.0.0.1:<端口>/v1`（路由到 `baseUrl`）；端口取运行中 pidfile 的 `port`（存在时），否则默认 `8787`。

`use` 的 `--model <id>` 必须与 `token use` 校验规则一致：id 必须属于激活 profile 的模型列表且仅对 Claude Code、dsh、pi 生效，否则报错。存在但不可用的工具（配置目录不存在、程序不在 `PATH`）必须跳过，不得创建其配置目录或改写其现有文件，并在 stderr 提示；全部工具都被跳过时仍以退出码 0 结束。

#### Scenario: use 基于激活 profile 写入全部工具

- **WHEN** 激活 profile 为 `work`、四种工具齐全，用户执行 `agent-cli token-server use --all`
- **THEN** Claude Code 的 baseUrl 为 `http://127.0.0.1:8787/anthropic`，OpenCode / dsh / pi 的 baseUrl 为 `http://127.0.0.1:8787/v1`，凭据均为生成的服务器 key，且 `activeProfile` 仍为 `work`（未被改变）

#### Scenario: use 使用运行中服务器的端口

- **WHEN** 服务器正在运行（pidfile 的 `port` 为 9999），激活 profile 为 `work`，用户执行 `agent-cli token-server use --all`
- **THEN** 工具写入的 baseUrl 使用端口 9999

#### Scenario: use 未生成 key 时报错

- **WHEN** 尚未执行 `gen-api-key`，激活 profile 为 `work`，用户执行 `agent-cli token-server use --all`
- **THEN** 系统报错提示先执行 `gen-api-key`，以非零退出码结束，且不改写激活 profile 与任何工具配置

#### Scenario: use 无激活 profile 时报错

- **WHEN** 尚未执行 `switch`，用户执行 `agent-cli token-server use --all`
- **THEN** 系统报错提示先执行 `token-server switch <profile>`，以非零退出码结束

#### Scenario: use 跳过缺失工具

- **WHEN** 激活 profile 为 `work`、部分工具目录或程序缺失，用户执行 `agent-cli token-server use --all`
- **THEN** 系统跳过缺失工具（stderr 提示、不创建其配置目录），写入其余工具，且 `activeProfile` 保持不变

### Requirement: start 与 stop 的进程生命周期

`token-server start` 必须在后台以守护方式启动服务器，并在监听成功后把 `pid`、`host`、`port` 写入配置目录下 `token-server.pid`，随后以退出码 0 结束，并在 stdout 打印监听地址、OpenAI 兼容 baseUrl（`http://<host>:<port>/v1`）、Anthropic 兼容 baseUrl（`http://<host>:<port>/anthropic`）与服务器 API key。`start --foreground` 必须在前台运行服务器，且同样写入 pidfile 并打印同样的连接信息。

当已有服务器在运行（pidfile 中的进程存活）时，`start` 必须报错、以非零退出码结束、不留下新的 pidfile，且不启动第二个服务器。监听失败（例如端口被占用）时，`start` 必须报错、以非零退出码结束并清理 pidfile。

`token-server stop` 必须读取 pidfile、向该进程发送终止信号、清理 pidfile 并以退出码 0 结束。当没有运行中的服务器（无 pidfile，或 pidfile 指向的进程不存在）时，`stop` 必须报错、以非零退出码结束，并清理残留 pidfile。

守护进程的 stdout/stderr 必须写入配置目录下的日志文件，不得写入调用方的终端；守护模式下 API key 只打印到调用方终端的 stdout（由父进程打印），必须不得出现在日志文件中。

#### Scenario: start 写入 pidfile 并打印地址

- **WHEN** 用户执行 `agent-cli token-server start` 且存在激活 profile、端口可用
- **THEN** 服务器在后台启动，`token-server.pid` 含 `pid`/`host`/`port`，命令打印监听地址并以退出码 0 结束

#### Scenario: start 输出 baseUrl 与 API key

- **WHEN** 用户执行 `agent-cli token-server start` 且启动成功（后台或 `--foreground`）
- **THEN** stdout 打印监听地址、OpenAI 兼容 baseUrl（`…/v1`）、Anthropic 兼容 baseUrl（`…/anthropic`）与服务器 API key；日志文件不包含 API key

#### Scenario: start 在已运行时失败

- **WHEN** 服务器已在运行，用户再次执行 `agent-cli token-server start`
- **THEN** 系统报错、以非零退出码结束，且不启动第二个服务器

#### Scenario: start 端口被占用

- **WHEN** 目标端口已被占用，用户执行 `agent-cli token-server start`
- **THEN** 系统报错、以非零退出码结束，且不留下 `token-server.pid`

#### Scenario: stop 终止并清理

- **WHEN** 服务器正在运行，用户执行 `agent-cli token-server stop`
- **THEN** 系统终止该进程、清理 `token-server.pid` 并以退出码 0 结束

#### Scenario: stop 未运行

- **WHEN** 没有服务器在运行（无 pidfile 或进程已不存在）
- **THEN** 系统报错、以非零退出码结束，并清理残留 pidfile

#### Scenario: 前台模式

- **WHEN** 用户执行 `agent-cli token-server start --foreground`
- **THEN** 服务器在前台运行并写入 pidfile，直到收到终止信号

### Requirement: 帮助信息列出 token-server 命令

`agent-cli --help` 必须说明 `token-server start`、`token-server stop`、`token-server switch <profile>`、`token-server use` 与 `token-server gen-api-key`，并说明服务器仅监听本机、默认端口 `8787`（`--port` 可覆盖）、`--foreground`、服务器使用 `switch` 选定的激活 profile，以及首次使用前必须 `gen-api-key` 且服务器校验 `Authorization: Bearer <key>` 或 `x-api-key: <key>`。

#### Scenario: 帮助列出 token-server 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 `token-server start`、`token-server stop`、`token-server switch <profile>`、`token-server use` 与 `token-server gen-api-key`

#### Scenario: 帮助说明默认端口与监听

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明服务器仅监听本机、默认端口 `8787` 且 `--port` 可覆盖

#### Scenario: 帮助说明激活 profile 来源

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明服务器使用 `token-server switch` / `use` 选定的激活 profile

#### Scenario: 帮助说明 API key 鉴权

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明首次使用前必须执行 `gen-api-key`，服务器对每个请求校验 `Authorization: Bearer <key>` 或 `x-api-key: <key>`
