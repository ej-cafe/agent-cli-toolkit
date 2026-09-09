## Purpose

维护阿里云与腾讯云的命名 token profile，并按选择把当前套写入 Claude Code 与 OpenCode 的本地配置。

## ADDED Requirements

### Requirement: 存储 token profile

系统必须把 token profile 持久化到全局配置目录下的 `token-profile.json`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/agent-cli-toolkit`，否则为 `~/.config/agent-cli-toolkit`）。

每个 profile 必须包含：唯一 `name`、`platform`（`aliyun` 或 `tencent`）、`token`、`baseUrl`，以及 `models`（该平台支持的模型列表，每项含 `id` 与 `name`）。profile 可以包含 `claudeBaseUrl`。写入 Claude 兼容地址时，若 `claudeBaseUrl` 存在且非空则必须使用它，否则使用 `baseUrl`。

系统不得把 `token-profile.json` 或 token 值提交进 git 仓库。

#### Scenario: 首次添加时创建文件

- **WHEN** 用户添加第一套 profile，且 `token-profile.json` 尚不存在
- **THEN** 系统在全局配置目录创建该文件并写入这套 profile

#### Scenario: Claude 地址回退到 baseUrl

- **WHEN** 某套 profile 有 `baseUrl` 且未设置 `claudeBaseUrl`
- **THEN** 应用到 Claude Code 或 OpenCode 时使用 `baseUrl` 作为 Claude 兼容地址

#### Scenario: 显式指定 Claude 地址

- **WHEN** 某套 profile 同时有 `baseUrl` 和 `claudeBaseUrl`
- **THEN** 应用到 Claude Code 或 OpenCode 时使用 `claudeBaseUrl` 作为 Claude 兼容地址

#### Scenario: 添加时写入平台模型列表

- **WHEN** 用户添加一套 `aliyun` 或 `tencent` profile
- **THEN** 该 profile 的 `models` 包含对应平台内置目录中的全部模型 `id` 与 `name`

### Requirement: 添加 token profile

系统必须提供 `agent-cli token add` 以创建 profile。命令必须接受标志：`--name`、`--platform`、`--token`、`--base-url`，以及可选的 `--claude-base-url`。

`platform` 必须是 `aliyun` 或 `tencent`。命令必须拒绝未知平台、缺少必填标志、空的 `name`/`token`/`base-url`，以及已存在的 `name`。成功时写入 profile 并以退出码 0 结束。

#### Scenario: 添加成功

- **WHEN** 用户执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1 --claude-base-url https://example.anthropic`
- **THEN** 系统保存名为 `work` 的 profile（含上述字段以及阿里云内置模型列表）并以退出码 0 结束

#### Scenario: 拒绝重名

- **WHEN** 已存在名为 `work` 的 profile，用户再次用 `--name work` 添加
- **THEN** 系统不覆盖已有 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知平台

- **WHEN** 用户用 `--platform aws` 添加 profile
- **THEN** 系统不写入 profile，向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 删除 token profile

系统必须提供 `agent-cli token delete <name>` 按名称删除已存储的 profile。若名称存在，必须只删除该套并保留其它 profile。若名称不存在，必须向 stderr 输出错误并以非 0 退出码结束。删除 profile 本身不得修改 Claude Code 或 OpenCode 的配置文件。

#### Scenario: 删除成功

- **WHEN** 存在名为 `work` 的 profile，用户执行 `agent-cli token delete work`
- **THEN** 该 profile 从 `token-profile.json` 中移除，其它 profile 仍保留

#### Scenario: 删除不存在的 profile

- **WHEN** 不存在名为 `missing` 的 profile，用户执行 `agent-cli token delete missing`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 将 profile 切换到 agent 工具

系统必须提供 `agent-cli token use <name>`，把已存储的 profile 应用到 agent 工具。

支持的工具为 `claude-code` 和 `opencode`。`--all` 必须同时应用到两者。重复传入 `--tool <id>` 时必须只应用到列出的受支持工具。若既未给 `--all` 也未给 `--tool`，系统必须在终端提示用户选择一个或多个受支持工具。未知工具 id 必须拒绝，且不得写入任何工具配置。

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

### Requirement: 更新 Claude Code 的 env

将 profile 应用到 Claude Code 时，系统必须更新用户主目录下的 `~/.claude/settings.json`。必须把 `env.ANTHROPIC_AUTH_TOKEN` 设为 profile 的 `token`，把 `env.ANTHROPIC_BASE_URL` 设为 Claude 兼容地址。必须保留其它 JSON 字段以及 `env` 内其它键。若文件或 `env` 对象不存在，必须按需创建，使这两个变量被写入。

#### Scenario: 合并进已有 settings

- **WHEN** `~/.claude/settings.json` 已包含 `env` 以及 `hooks` 等其它字段
- **THEN** 应用 profile 时只更新 `env.ANTHROPIC_AUTH_TOKEN` 和 `env.ANTHROPIC_BASE_URL`，其它 `env` 键以及所有非 `env` 字段保持不变

#### Scenario: 文件不存在时创建 settings

- **WHEN** `~/.claude/settings.json` 不存在，且 Claude Code 是本次应用目标
- **THEN** 系统创建该文件，并按 profile 写入 `env.ANTHROPIC_AUTH_TOKEN` 和 `env.ANTHROPIC_BASE_URL`

### Requirement: 更新 OpenCode 的 provider

将 profile 应用到 OpenCode 时，系统必须更新 `~/.config/opencode/opencode.json`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/opencode/opencode.json`）。必须把 `provider.<id>.options.apiKey` 写成 profile 的 `token`，把 `provider.<id>.options.baseURL` 写成 Claude 兼容地址；其中 `<id>` 在 `aliyun` 时为 `bailian`，在 `tencent` 时为 `tencent`。必须按 profile 的 `models` 写入 `provider.<id>.models`：以模型 `id` 为键，至少包含 `name`。若该 id 已存在，必须保留其既有的其它字段（如 `options`、`modalities`）。必须保留其它 provider、该 provider 上除被更新字段以外的其它键，以及其它顶层字段。若文件或 provider 条目不存在，必须按需创建，使凭据与模型列表被写入。

#### Scenario: 更新阿里云 provider

- **WHEN** 用户把 `aliyun` profile 应用到 OpenCode
- **THEN** 系统设置 `provider.bailian.options.apiKey`、`provider.bailian.options.baseURL`，并按该 profile 的 `models` 写入 `provider.bailian.models`，不重命名或删除其它 provider

#### Scenario: 更新腾讯云 provider

- **WHEN** 用户把 `tencent` profile 应用到 OpenCode
- **THEN** 系统设置 `provider.tencent.options.apiKey`、`provider.tencent.options.baseURL`，并按该 profile 的 `models` 写入 `provider.tencent.models`

#### Scenario: 保留已有模型条目的其它字段

- **WHEN** `provider.bailian.models` 中某模型 id 已有 `options` 或 `modalities`
- **THEN** 应用包含同一 id 的 `aliyun` profile 时保留这些字段，并确保 `name` 与 profile 中的名称一致

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token use`，并在 `use` 上说明 `--all` 和 `--tool`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、use 命令
