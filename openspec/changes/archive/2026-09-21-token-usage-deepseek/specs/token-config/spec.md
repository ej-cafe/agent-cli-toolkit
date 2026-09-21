## MODIFIED Requirements

### Requirement: 查询套餐余量

系统必须提供 `agent-cli token usage`，查询云平台套餐余量或账户余额信息。

命令必须接受可选标志 `--platform <aliyun|tencent|deepseek>`，以及可选标志 `--name <profile>`。省略 `--platform` 时必须默认为 `aliyun`。不得接受额外位置参数；若传入多余参数，必须向 stderr 输出错误并以非 0 退出码结束。

平台支持范围：

- `aliyun`：必须查询阿里云百炼 Token Plan 订阅级余量（不绑定某个 `token-profile.json` 中的 profile，也不使用 profile 里的 API Key 作为该查询的凭据）。不得接受 `--name`；若传入 `--name`，必须拒绝、不发起查询，并以非 0 退出码结束。
- `deepseek`：必须查询 DeepSeek 账户余额（官方 `GET /user/balance` 语义）。必须使用已保存的 deepseek profile 的 `token` 作为 Bearer 凭据；不得使用平台控制台 session / cookie。不得调用 `bl`。
- `tencent` 或其它未知平台：必须拒绝、不发起查询，向 stderr 说明该平台暂不支持余量查询，并以非 0 退出码结束。

DeepSeek 目标 profile 选择：

- 若提供 `--name`：目标为该名称的 profile。若名称不存在，或存在但其 `platform` 不是 `deepseek`，必须拒绝、不发起查询，并以非 0 退出码结束。
- 若未提供 `--name`：在已保存 profile 中筛选 `platform` 为 `deepseek` 的集合。若恰好一套，必须使用该套；若零套或多套，必须拒绝、不发起查询，向 stderr 说明需先添加 deepseek profile 或用 `--name` 指定，并以非 0 退出码结束。

查询 DeepSeek 时，系统必须对目标 profile 的 `baseUrl`（去掉末尾 `/`）发起 `GET`，路径为该 `baseUrl` 加上 `/user/balance`，请求头带 `Authorization: Bearer <token>` 与 `Accept: application/json`。若 HTTP 失败、响应无法解析为含余额信息的对象，必须向 stderr 输出错误并以非 0 退出码结束。成功时必须以退出码 0 结束，并向 stdout 输出可读摘要，至少包含：是否可用于 API 调用（`is_available` 或等价信息），以及每个币种的总余额、赠送余额与充值余额（若响应中存在对应字段）。不得把完整 API Key 打印到 stdout。

查询阿里云时，系统必须通过本机 PATH 上的 `bl`（bailian-cli）执行 `bl usage token-plan --output json`（或等价且输出为 JSON 的调用）。必须要求调用方已完成控制台鉴权（`bl auth login --console`）；不得仅用百炼模型 API Key（`sk-sp-` / `DASHSCOPE_API_KEY`）冒充该查询凭据。

阿里云失败语义：

- 若 `bl` 不可执行（未安装或不在 PATH）：必须向 stderr 说明需安装 bailian-cli，并以非 0 退出码结束。
- 若 `bl` 返回无控制台登录态（例如提示需 `bl auth login --console`）：必须向 stderr 转述该要求，并以非 0 退出码结束。
- 若 `bl` 其它非 0 退出或 JSON 无法解析：必须向 stderr 输出错误，并以非 0 退出码结束。

阿里云成功时必须以退出码 0 结束，并向 stdout 输出可读的余量摘要，至少包含各用量窗口的已用比例（或等价用量字段）以及重置时间（若响应中存在）。不得把控制台 access token、cookie 或完整密钥打印到 stdout。

该命令不得修改 `token-profile.json` 或任何 agent 工具配置。

#### Scenario: 默认查询阿里云成功

- **WHEN** 本机 PATH 有可用的 `bl`，且已完成 `bl auth login --console`，用户执行 `agent-cli token usage`
- **THEN** 系统查询阿里云百炼 Token Plan 余量，向 stdout 输出摘要，并以退出码 0 结束

#### Scenario: 显式指定 aliyun

- **WHEN** 条件同上，用户执行 `agent-cli token usage --platform aliyun`
- **THEN** 行为与省略 `--platform` 时相同，并以退出码 0 结束

#### Scenario: 阿里云拒绝 --name

- **WHEN** 用户执行 `agent-cli token usage --platform aliyun --name work`
- **THEN** 系统不发起查询，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝腾讯云

- **WHEN** 用户执行 `agent-cli token usage --platform tencent`
- **THEN** 系统不发起查询，向 stderr 说明暂不支持，并以非 0 退出码结束

#### Scenario: DeepSeek 唯一 profile 时查询余额成功

- **WHEN** 已保存恰好一套 `deepseek` profile `ds`（`baseUrl` 为 `https://api.deepseek.com`，`token` 为 `SECRET`），用户执行 `agent-cli token usage --platform deepseek`，且 `GET https://api.deepseek.com/user/balance` 返回含 `is_available` 与非空 `balance_infos` 的成功响应
- **THEN** 系统向 stdout 输出余额摘要（含可用状态与币种余额字段），不以完整 token 输出，并以退出码 0 结束

#### Scenario: DeepSeek 用 --name 指定 profile

- **WHEN** 已保存 `deepseek` profile `ds` 与 `ds2`，用户执行 `agent-cli token usage --platform deepseek --name ds`，且对 `ds` 的 `{baseUrl}/user/balance` 返回成功余额响应
- **THEN** 系统使用 `ds` 的凭据查询并输出摘要，并以退出码 0 结束

#### Scenario: 拒绝 DeepSeek

- **WHEN** 已保存两套或零套 `deepseek` profile，用户执行 `agent-cli token usage --platform deepseek`（未给 `--name`）
- **THEN** 系统不发起查询，向 stderr 说明需先添加 deepseek profile 或用 `--name` 指定，并以非 0 退出码结束

#### Scenario: DeepSeek --name 非 deepseek 平台时拒绝

- **WHEN** 已存在 `aliyun` profile `work`，用户执行 `agent-cli token usage --platform deepseek --name work`
- **THEN** 系统不发起查询，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: DeepSeek 余额请求失败

- **WHEN** 已保存一套 `deepseek` profile `ds`，用户执行 `agent-cli token usage --platform deepseek`，且对该 profile 的 `{baseUrl}/user/balance` 请求失败
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知平台

- **WHEN** 用户执行 `agent-cli token usage --platform aws`
- **THEN** 系统不发起查询，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 缺少 bl

- **WHEN** PATH 中没有可执行的 `bl`，用户执行 `agent-cli token usage`
- **THEN** 系统向 stderr 说明需安装 bailian-cli，并以非 0 退出码结束

#### Scenario: 未控制台登录

- **WHEN** 本机有 `bl` 但未完成控制台登录，用户执行 `agent-cli token usage`
- **THEN** 系统向 stderr 提示执行 `bl auth login --console`，并以非 0 退出码结束

#### Scenario: 拒绝多余参数

- **WHEN** 用户执行 `agent-cli token usage extra`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 查询不改配置

- **WHEN** 用户执行 `agent-cli token usage`（无论成功或失败）
- **THEN** 系统不修改 `token-profile.json` 或任何 agent 工具配置

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`、`token usage`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`、`pi`。必须说明 `--model` 对 Claude Code、dsh 与 pi 有效。必须说明 `sync-model-list` 可按 `--name` 同步单个 profile，可按 `--platform` 过滤，省略 `--name` 时同步全部目标 profile，且每个目标都用该 profile 自己的 `{baseUrl}/models`。必须说明 `--platform` 对 `add` / `sync-model-list` 可取 `aliyun`、`tencent`、`deepseek`。必须说明 DeepSeek 添加时可省略 `--base-url` / `--claude-base-url` 并使用官方预设，显式传入则覆盖。必须说明 `token usage` 可查询套餐余量或账户余额：默认 `--platform aliyun`（依赖本机 `bl` 的控制台登录）；`--platform deepseek` 查询账户余额，使用 deepseek profile 的 API Key，可用 `--name` 指定 profile。不得再说明按平台共享 `model-list.json` 或同步腾讯云使用 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use、sync-model-list、usage 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 对 Claude Code、dsh 与 pi 有效

#### Scenario: 帮助说明同步模型列表

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token sync-model-list` 可按 `--name` 同步单个 profile、可按 `--platform` 过滤、省略 `--name` 时同步全部目标，每个目标使用该 profile 的 `{baseUrl}/models`，且不含按平台 `model-list.json` 或 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`

#### Scenario: 帮助列出平台含 deepseek

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--platform` 可指定 `aliyun`、`tencent`、`deepseek`

#### Scenario: 帮助说明 DeepSeek URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 DeepSeek 可省略 base-url / claude-base-url 并使用预设，显式传入则覆盖

#### Scenario: 帮助列出 dsh

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `dsh`

#### Scenario: 帮助列出 pi

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `pi`

#### Scenario: 帮助列出 usage

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token usage` 可查询套餐余量或账户余额，支持阿里云百炼（默认）与 DeepSeek（可用 `--name` 指定 profile）
