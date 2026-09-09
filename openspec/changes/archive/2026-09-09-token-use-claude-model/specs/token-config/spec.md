## MODIFIED Requirements

### Requirement: 将 profile 切换到 agent 工具

系统必须提供 `agent-cli token use <name>`，把已存储的 profile 应用到 agent 工具。

支持的工具为 `claude-code` 和 `opencode`。`--all` 必须同时应用到两者。重复传入 `--tool <id>` 时必须只应用到列出的受支持工具。若既未给 `--all` 也未给 `--tool`，系统必须在终端提示用户选择一个或多个受支持工具。未知工具 id 必须拒绝，且不得写入任何工具配置。

命令必须接受可选标志 `--model <id>`。该 id 必须存在于该 profile 的 `models` 中。`--model` 只用于 Claude Code：当本次目标包含 `claude-code` 时，必须把该 id 作为 Claude Code 的默认模型写入；不得用 `--model` 修改 OpenCode 的模型列表或默认模型。若传了 `--model` 但本次目标不含 `claude-code`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。未知模型 id 必须拒绝，且不得写入任何工具配置。未传 `--model` 时不得把模型选择写入任何工具。

若指定名称的 profile 不存在，必须输出错误、以非 0 退出码结束，且不得写入工具配置。若用户在交互提示中放弃且未选中任何工具，系统不得写入工具配置，且必须以非 0 退出码结束。

#### Scenario: 应用到全部工具

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --all`
- **THEN** 系统把该 profile 应用到 Claude Code 和 OpenCode，并以退出码 0 结束

#### Scenario: 应用到指定工具

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool claude-code`
- **THEN** 系统只把该 profile 应用到 Claude Code，不修改 OpenCode 配置

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

#### Scenario: --all 时模型只影响 Claude Code

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，用户执行 `agent-cli token use work --all --model qwen3.8-max`
- **THEN** 系统把凭据应用到 Claude Code 和 OpenCode，把该模型 id 写入 Claude Code 默认模型，且不因 `--model` 改变 OpenCode 的模型选择

#### Scenario: 仅 OpenCode 时拒绝 --model

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool opencode --model qwen3.8-max`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知模型

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool claude-code --model not-a-model`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 更新 Claude Code 的 env

将 profile 应用到 Claude Code 时，系统必须更新用户主目录下的 `~/.claude/settings.json`。必须把 `env.ANTHROPIC_AUTH_TOKEN` 设为 profile 的 `token`，把 `env.ANTHROPIC_BASE_URL` 设为 Claude 兼容地址。若本次 `token use` 提供了 `--model`，还必须把 `env.ANTHROPIC_MODEL` 设为该模型 id；若未提供 `--model`，必须保留已有的 `ANTHROPIC_MODEL`（若存在）。必须保留其它 JSON 字段以及 `env` 内其它键。若文件或 `env` 对象不存在，必须按需创建，使 token 与地址被写入。

#### Scenario: 合并进已有 settings

- **WHEN** `~/.claude/settings.json` 已包含 `env` 以及 `hooks` 等其它字段，且本次未指定 `--model`
- **THEN** 应用 profile 时只更新 `env.ANTHROPIC_AUTH_TOKEN` 和 `env.ANTHROPIC_BASE_URL`，其它 `env` 键（含已有 `ANTHROPIC_MODEL`）以及所有非 `env` 字段保持不变

#### Scenario: 文件不存在时创建 settings

- **WHEN** `~/.claude/settings.json` 不存在，且 Claude Code 是本次应用目标，且未指定 `--model`
- **THEN** 系统创建该文件，并按 profile 写入 `env.ANTHROPIC_AUTH_TOKEN` 和 `env.ANTHROPIC_BASE_URL`，且不写入 `ANTHROPIC_MODEL`

#### Scenario: 指定模型时写入 ANTHROPIC_MODEL

- **WHEN** 用户以 `--model qwen3.8-max` 将 profile 应用到 Claude Code
- **THEN** 系统把 `env.ANTHROPIC_MODEL` 设为 `qwen3.8-max`，并仍写入 token 与 Claude 兼容地址

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--model` 仅对 Claude Code 有效。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 仅对 Claude Code 有效
