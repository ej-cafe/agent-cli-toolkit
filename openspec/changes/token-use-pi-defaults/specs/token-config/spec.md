## MODIFIED Requirements

### Requirement: 将 profile 切换到 agent 工具

系统必须提供 `agent-cli token use <name>`，把已存储的 profile 应用到 agent 工具。

支持的工具为 `claude-code`、`opencode`、`dsh` 和 `pi`。`--all` 必须同时应用到这四者。重复传入 `--tool <id>` 时必须只应用到列出的受支持工具。若既未给 `--all` 也未给 `--tool`，系统必须在终端提示用户选择一个或多个受支持工具。未知工具 id 必须拒绝，且不得写入任何工具配置。

命令必须接受可选标志 `--model <id>`。该 id 必须存在于该 profile 的 `models` 中。`--model` 用于 Claude Code、dsh 与 pi：当本次目标包含 `claude-code` 时，必须把该 id 作为 Claude Code 的默认模型写入；当本次目标包含 `dsh` 时，必须把该 id 作为 DeepSeek Harness 的默认模型写入；当本次目标包含 `pi` 时，必须把该 id 作为 pi 的启动默认模型写入。不得用 `--model` 修改 OpenCode 的模型列表或默认模型。若传了 `--model` 但本次目标既不含 `claude-code`、也不含 `dsh`、也不含 `pi`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。未知模型 id 必须拒绝，且不得写入任何工具配置。未传 `--model` 时，不得把模型选择写入 Claude Code 或 dsh。若本次目标包含 `pi`，仍必须写入 pi 的启动默认：`defaultProvider` 为该 profile 的 `name`，`defaultModel` 为该 profile `models` 数组第一项的 `id`；若 `models` 为空或第一项没有非空 `id`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。未传 `--model` 时不得修改 OpenCode 的模型选择。

若指定名称的 profile 不存在，必须输出错误、以非 0 退出码结束，且不得写入工具配置。若用户在交互提示中放弃且未选中任何工具，系统不得写入工具配置，且必须以非 0 退出码结束。

#### Scenario: 应用到全部工具

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --all`
- **THEN** 系统把该 profile 应用到 Claude Code、OpenCode、dsh 和 pi，并以退出码 0 结束

#### Scenario: 应用到指定工具

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool claude-code`
- **THEN** 系统只把该 profile 应用到 Claude Code，不修改 OpenCode、dsh 或 pi 配置

#### Scenario: 应用到 dsh

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool dsh`
- **THEN** 系统只把该 profile 应用到 dsh，不修改 Claude Code、OpenCode 或 pi 配置

#### Scenario: 应用到 pi

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool pi`
- **THEN** 系统只把该 profile 应用到 pi，不修改 Claude Code、OpenCode 或 dsh 配置

#### Scenario: 交互选择工具

- **WHEN** 用户执行 `agent-cli token use work` 且未带 `--all` 或 `--tool`，随后在提示中选择 OpenCode
- **THEN** 系统只把该 profile 应用到 OpenCode

#### Scenario: 拒绝未知工具

- **WHEN** 用户执行 `agent-cli token use work --tool cursor`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 切换不存在的 profile

- **WHEN** 不存在名为 `missing` 的 profile，用户执行 `agent-cli token use missing --all`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 指定模型写入 Claude Code

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，用户执行 `agent-cli token use work --tool claude-code --model qwen3.8-max`
- **THEN** 系统把该 profile 应用到 Claude Code，并把该模型 id 写入 Claude Code 默认模型，以退出码 0 结束

#### Scenario: --all 时模型影响 Claude Code 与 dsh

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，用户执行 `agent-cli token use work --all --model qwen3.8-max`
- **THEN** 系统把凭据应用到 Claude Code、OpenCode、dsh 和 pi，把该模型 id 写入 Claude Code 默认模型、dsh 默认模型与 pi 启动默认模型，且不因 `--model` 改变 OpenCode 的模型选择

#### Scenario: 仅 dsh 时写入默认模型

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，用户执行 `agent-cli token use work --tool dsh --model qwen3.8-max`
- **THEN** 系统把该 profile 应用到 dsh 并把该模型 id 写入 dsh 默认模型，不修改 Claude Code、OpenCode 或 pi 配置

#### Scenario: 仅 pi 时写入默认模型

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，用户执行 `agent-cli token use work --tool pi --model qwen3.8-max`
- **THEN** 系统把该 profile 应用到 pi 并把该模型 id 写入 pi 启动默认模型，不修改 Claude Code、OpenCode 或 dsh 配置

#### Scenario: 应用到 pi 且未给 --model 时写入启动默认

- **WHEN** 存在 profile `work`，其 `models` 第一项 id 为 `qwen3.8-max`，用户执行 `agent-cli token use work --tool pi`（未给 `--model`），且 pi 的 `settings.json` 已有其它 `defaultProvider` 与 `defaultModel`
- **THEN** 系统把该 profile 应用到 pi，把 `defaultProvider` 设为 `work`、`defaultModel` 设为 `qwen3.8-max`（覆盖原值），且不修改 Claude Code、OpenCode 或 dsh 的模型选择

#### Scenario: pi 且 models 为空时拒绝

- **WHEN** 存在 profile `work`，其 `models` 为空，用户执行 `agent-cli token use work --tool pi`（未给 `--model`）
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 仅 OpenCode 时拒绝 --model

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool opencode --model qwen3.8-max`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知模型

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool claude-code --model not-a-model`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 更新 pi agent 的 provider

将 profile 应用到 pi（工具 id `pi`）时，系统必须更新 pi agent 目录下的 `models.json` 与 `auth.json`。

pi agent 目录必须为：若环境变量 `PI_CODING_AGENT_DIR` 非空（trim 后），则使用该路径；否则为 `~/.pi/agent`（即用户主目录下的 `.pi/agent`）。不得读写项目目录下的 `.pi/`。不得读写 `models-store.json`。

`models.json` 必须在顶层 `providers` 映射下，以该 profile 的 `name` 作为键 `<id>` upsert 一条自定义 provider。必须把该条目的 `baseUrl` 写成 profile 的 `baseUrl`（OpenAI 兼容地址，不得改用 Claude 兼容地址），把 `api` 写成 `openai-completions`，把 `authHeader` 写成 `true`。必须按 profile 的 `models` 写入该条目的 `models` 数组：每项至少含 `id` 与 `name`（若 profile 中无 `name` 或为空则用 `id`）。若该模型 `id` 已存在，必须保留其既有的其它字段。不得删除该 provider 上 profile 未列出的已有模型项。必须保留 `providers` 下其它条目、该 provider 上除被更新字段以外的其它键，以及 `models.json` 的其它顶层字段。不得在 `models.json` 的该 provider 条目中写入明文 `apiKey` 或 token。

系统必须在 `auth.json` 根映射下，以同一 profile `name` 为键，写入 `{ "type": "api_key", "key": <profile.token> }`。必须保留 `auth.json` 中其它 provider 键及其值。该凭据文件权限必须为 `0600`；若不存在则按需创建。若 `auth.json` 已存在且根节点不是 JSON 对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。若 `models.json` 已存在且根节点不是 JSON 对象，或已有 `providers` 但不是对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

只要本次 `token use` 的目标含 `pi`，还必须更新同一 agent 目录下的 `settings.json`：把 `defaultProvider` 设为该 profile 的 `name`。若提供了 `--model`，必须把 `defaultModel` 设为该模型 id；若未提供，必须把 `defaultModel` 设为该 profile `models` 数组第一项的 `id`。二者都必须覆盖已有值。必须保留 `settings.json` 的其它字段；若文件不存在则创建。若 `models` 为空或第一项没有非空 `id`，且未提供 `--model`，必须拒绝、不得改写任一文件，并以非 0 退出码结束。若 `settings.json` 已存在且根节点不是 JSON 对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

若文件或中间对象不存在，必须按需创建，使 provider 与凭据被写入。

#### Scenario: 按 profile 名称写入 provider 与凭据

- **WHEN** 用户把名为 `work` 的 profile（`baseUrl` 为 `https://example.openai/v1`）应用到 pi
- **THEN** 系统在 `models.json` 设置 `providers.work.baseUrl` 为 `https://example.openai/v1`、`api` 为 `openai-completions`、`authHeader` 为 `true`，按该 profile 的 `models` 写入 `models`，在 `auth.json` 写入 `work` 为 `{ "type": "api_key", "key": <token> }`，且 `models.json` 不含该 token

#### Scenario: 不同名称互不覆盖

- **WHEN** 用户把名为 `office` 的 profile 应用到 pi，且 `models.json` 已有 `providers.work`、`auth.json` 已有 `work`
- **THEN** 系统设置 `providers.office` 与 `auth.json` 的 `office`，并保留 `providers.work` 与 `auth.json` 的 `work`

#### Scenario: 保留已有模型条目的其它字段

- **WHEN** `providers.work.models` 中某模型 id 已有 `contextWindow` 或 `compat`
- **THEN** 再次应用名为 `work` 的 profile 且包含同一模型 id 时保留这些字段，并确保模型 `name` 与 profile 中的名称一致

#### Scenario: 指定模型时写入启动默认

- **WHEN** 用户以 `--model qwen3.8-max` 将 profile `work` 应用到 pi
- **THEN** 系统把 `settings.json` 的 `defaultProvider` 设为 `work`、`defaultModel` 设为 `qwen3.8-max`，并仍写入该 provider 与凭据

#### Scenario: 未指定模型时保留启动默认

- **WHEN** profile `work` 的 `models` 第一项 id 为 `qwen3.8-max`、其后还有其它模型，且 `settings.json` 已有不同的 `defaultProvider` 与 `defaultModel`，用户未带 `--model` 将该 profile 应用到 pi
- **THEN** 系统更新该 profile 对应 provider 与凭据，并把 `defaultProvider` 设为 `work`、`defaultModel` 设为 `qwen3.8-max`（覆盖原值），保留 `settings.json` 的其它字段

#### Scenario: 文件不存在时创建

- **WHEN** agent 目录下 `models.json` 与 `auth.json` 均不存在，且 pi 是本次应用目标，且未给 `--model`
- **THEN** 系统创建 `models.json` 与 `auth.json` 并写入该 profile 的 provider 与凭据，并创建 `settings.json`，其中 `defaultProvider` 为该 profile 名称、`defaultModel` 为 `models` 第一项的 `id`

#### Scenario: 使用 PI_CODING_AGENT_DIR

- **WHEN** 环境变量 `PI_CODING_AGENT_DIR` 指向某目录，用户将 profile 应用到 pi
- **THEN** 系统读写该目录下的 `models.json`、`auth.json` 与 `settings.json`，不写默认的 `~/.pi/agent/`

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`、`token usage`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`、`pi`。必须说明 `--model` 对 Claude Code、dsh 与 pi 有效。必须说明把 profile 应用到 pi 时会设置 `defaultProvider`（profile 名称）与 `defaultModel`（有 `--model` 时用该 id，否则用该 profile 模型列表第一项）。必须说明 `sync-model-list` 可按 `--name` 同步单个 profile，可按 `--platform` 过滤，省略 `--name` 时同步全部目标 profile，且每个目标都用该 profile 自己的 `{baseUrl}/models`。必须说明 `--platform` 对 `add` / `sync-model-list` 可取 `aliyun`、`tencent`、`deepseek`、`kimi`。必须说明 DeepSeek 与 Kimi 添加时可省略 `--base-url` / `--claude-base-url` 并使用官方预设，显式传入则覆盖。必须说明 `token usage` 可查询套餐余量或账户余额：默认 `--platform aliyun`（依赖本机 `bl` 的控制台登录）；`--platform deepseek` 与 `--platform kimi` 查询账户余额，分别使用对应平台 profile 的 API Key，可用 `--name` 指定 profile。不得再说明按平台共享 `model-list.json` 或同步腾讯云使用 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。

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
- **THEN** 输出说明 `--platform` 可指定 `aliyun`、`tencent`、`deepseek`、`kimi`

#### Scenario: 帮助说明 DeepSeek URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 DeepSeek 可省略 base-url / claude-base-url 并使用预设，显式传入则覆盖

#### Scenario: 帮助说明 Kimi URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 Kimi 可省略 base-url / claude-base-url 并使用中国站预设，显式传入则覆盖

#### Scenario: 帮助说明 pi 启动默认

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明应用到 pi 时会设置 `defaultProvider` 与 `defaultModel`；提供 `--model` 时使用该 id，否则使用 profile 模型列表第一项

#### Scenario: 帮助列出 dsh

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `dsh`

#### Scenario: 帮助列出 pi

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `pi`

#### Scenario: 帮助列出 usage

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token usage` 可查询套餐余量或账户余额，支持阿里云百炼（默认）、DeepSeek 与 Kimi（后两者可用 `--name` 指定 profile）
