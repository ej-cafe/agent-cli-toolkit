## ADDED Requirements

### Requirement: 更新 DeepSeek Harness 的 provider

将 profile 应用到 DeepSeek Harness（工具 id `dsh`）时，系统必须更新 `$DSH_HOME/settings.yaml` 与 `$DSH_HOME/.credentials.yaml`。若未设置 `DSH_HOME`（缺省或空白），`$DSH_HOME` 必须为 `~/.dsh`。

添加的模型 provider 必须且只能写在 `llm-pi-ai.providers` 下。必须以该 profile 的 `name` 作为该映射下的键 `<id>`，并把该条目的 `displayName` 写成同一 `name`。必须把 `api` 写成 `openai-completions`，把 `baseURL` 写成 profile 的 `baseUrl`（OpenAI 兼容地址，不得改用 Claude 兼容地址）。必须按 profile 的 `models` 写入该条目的 `models` 数组：每项至少含 `id` 与 `name`。若该模型 `id` 已存在，必须保留其既有的其它字段。不得删除该 provider 上 profile 未列出的已有模型项。必须保留 `llm-pi-ai.providers` 下其它条目、该 provider 上除被更新字段以外的其它键，以及 `settings.yaml` 的其它顶层字段。不得写入 `llm-deepseek`，也不得在 `llm-pi-ai.providers` 之外新建 provider 映射。

系统必须把该 provider 的 `apiKeyEnv` 写成 POSIX 标识符：`AGENT_CLI_` + 将 profile `name` 转为大写、把非 `[A-Z0-9]` 字符替换为 `_` + `_API_KEY`（例如 `work` → `AGENT_CLI_WORK_API_KEY`）。必须在 `.credentials.yaml` 根映射中把同一标识符的值写成 profile 的 `token`。不得把 token 明文写入 `settings.yaml`。必须保留 `.credentials.yaml` 中其它键。该凭据文件权限必须为 `0600`，其所在目录权限必须为 `0700`。

若本次 `token use` 提供了 `--model` 且目标含 `dsh`，还必须把默认模型写在 `settings.yaml` 顶层的 `agent-default-model`：`provider` 为该 profile 的 `name`，`model` 为该模型 id。不得把默认模型写进 `llm-pi-ai.providers` 条目。若未提供 `--model`，必须保留已有的 `agent-default-model`（若存在）。

若文件或中间对象不存在，必须按需创建，使路由与凭据被写入。若已有 `settings.yaml` 或 `.credentials.yaml` 根节点不是映射，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

#### Scenario: 按 profile 名称写入 provider

- **WHEN** 用户把名为 `work` 的 profile（`baseUrl` 为 `https://example.openai/v1`）应用到 dsh
- **THEN** 系统设置 `llm-pi-ai.providers.work.displayName` 为 `work`、`api` 为 `openai-completions`、`baseURL` 为 `https://example.openai/v1`，按该 profile 的 `models` 写入 `models`，把 `apiKeyEnv` 写成 `AGENT_CLI_WORK_API_KEY`，并在 `.credentials.yaml` 写入该键为 token，且 `settings.yaml` 不含该 token

#### Scenario: 不同名称互不覆盖

- **WHEN** 用户把名为 `office` 的 profile 应用到 dsh，且 `settings.yaml` 已有 `llm-pi-ai.providers.work`
- **THEN** 系统设置 `providers.office` 的路由与凭据，并保留 `providers.work`

#### Scenario: 保留已有模型条目的其它字段

- **WHEN** `llm-pi-ai.providers.work.models` 中某模型 id 已有 `contextWindow` 或 `compat`
- **THEN** 再次应用名为 `work` 的 profile 且包含同一模型 id 时保留这些字段，并确保模型 `name` 与 profile 中的名称一致

#### Scenario: 指定模型时写入默认路由

- **WHEN** 用户以 `--model qwen3.8-max` 将 profile `work` 应用到 dsh
- **THEN** 系统把 `agent-default-model.provider` 设为 `work`、`agent-default-model.model` 设为 `qwen3.8-max`，并仍写入该 provider 的路由与凭据

#### Scenario: 未指定模型时保留默认路由

- **WHEN** `settings.yaml` 已有 `agent-default-model`，用户未带 `--model` 将 profile 应用到 dsh
- **THEN** 系统更新该 profile 对应 provider 与凭据，且不改写 `agent-default-model`

#### Scenario: 文件不存在时创建

- **WHEN** `$DSH_HOME/settings.yaml` 与 `.credentials.yaml` 均不存在，且 dsh 是本次应用目标
- **THEN** 系统创建这两个文件并写入该 profile 的路由与凭据，且未给 `--model` 时不写入 `agent-default-model`

#### Scenario: 使用 DSH_HOME

- **WHEN** 环境变量 `DSH_HOME` 指向某目录，用户将 profile 应用到 dsh
- **THEN** 系统读写该目录下的 `settings.yaml` 与 `.credentials.yaml`，不写默认的 `~/.dsh/`

## MODIFIED Requirements

### Requirement: 将 profile 切换到 agent 工具

系统必须提供 `agent-cli token use <name>`，把已存储的 profile 应用到 agent 工具。

支持的工具为 `claude-code`、`opencode` 和 `dsh`。`--all` 必须同时应用到这三者。重复传入 `--tool <id>` 时必须只应用到列出的受支持工具。若既未给 `--all` 也未给 `--tool`，系统必须在终端提示用户选择一个或多个受支持工具。未知工具 id 必须拒绝，且不得写入任何工具配置。

命令必须接受可选标志 `--model <id>`。该 id 必须存在于该 profile 的 `models` 中。`--model` 只用于 Claude Code 与 dsh：当本次目标包含 `claude-code` 时，必须把该 id 作为 Claude Code 的默认模型写入；当本次目标包含 `dsh` 时，必须把该 id 作为 DeepSeek Harness 的默认模型写入。不得用 `--model` 修改 OpenCode 的模型列表或默认模型。若传了 `--model` 但本次目标既不含 `claude-code` 也不含 `dsh`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。未知模型 id 必须拒绝，且不得写入任何工具配置。未传 `--model` 时不得把模型选择写入任何工具。

若指定名称的 profile 不存在，必须输出错误、以非 0 退出码结束，且不得写入工具配置。若用户在交互提示中放弃且未选中任何工具，系统不得写入工具配置，且必须以非 0 退出码结束。

#### Scenario: 应用到全部工具

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --all`
- **THEN** 系统把该 profile 应用到 Claude Code、OpenCode 和 dsh，并以退出码 0 结束

#### Scenario: 应用到指定工具

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool claude-code`
- **THEN** 系统只把该 profile 应用到 Claude Code，不修改 OpenCode 或 dsh 配置

#### Scenario: 应用到 dsh

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool dsh`
- **THEN** 系统只把该 profile 应用到 dsh，不修改 Claude Code 或 OpenCode 配置

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
- **THEN** 系统把凭据应用到 Claude Code、OpenCode 和 dsh，把该模型 id 写入 Claude Code 默认模型与 dsh 默认模型，且不因 `--model` 改变 OpenCode 的模型选择

#### Scenario: 仅 dsh 时写入默认模型

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，用户执行 `agent-cli token use work --tool dsh --model qwen3.8-max`
- **THEN** 系统把该 profile 应用到 dsh 并把该模型 id 写入 dsh 默认模型，不修改 Claude Code 或 OpenCode 配置

#### Scenario: 仅 OpenCode 时拒绝 --model

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool opencode --model qwen3.8-max`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知模型

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool claude-code --model not-a-model`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 删除 token profile

系统必须提供 `agent-cli token delete <name>` 按名称删除已存储的 profile。若名称存在，必须只删除该套并保留其它 profile。若名称不存在，必须向 stderr 输出错误并以非 0 退出码结束。删除 profile 本身不得修改 Claude Code、OpenCode 或 DeepSeek Harness 的配置文件。

#### Scenario: 删除成功

- **WHEN** 存在名为 `work` 的 profile，用户执行 `agent-cli token delete work`
- **THEN** 该 profile 从 `token-profile.json` 中移除，其它 profile 仍保留

#### Scenario: 删除不存在的 profile

- **WHEN** 不存在名为 `missing` 的 profile，用户执行 `agent-cli token delete missing`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`。必须说明 `--model` 对 Claude Code 与 dsh 有效。必须说明 `sync-model-list` 可按 `--platform` 更新模型目录。必须说明同步腾讯云时使用环境变量 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use、sync-model-list 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 对 Claude Code 与 dsh 有效

#### Scenario: 帮助说明同步模型列表

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token sync-model-list` 可按平台更新模型目录，并说明腾讯云使用 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`

#### Scenario: 帮助列出 dsh

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `dsh`
