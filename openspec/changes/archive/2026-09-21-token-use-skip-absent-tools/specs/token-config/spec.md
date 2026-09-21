## MODIFIED Requirements

### Requirement: 将 profile 切换到 agent 工具

系统必须提供 `agent-cli token use <name>`，把已存储的 profile 应用到 agent 工具。

支持的工具为 `claude-code`、`opencode`、`dsh` 和 `pi`。对每个候选工具，系统必须先确认其配置目录存在且为目录，并且对应程序在 `PATH` 上可执行，然后才允许写入。对应关系必须为：

- `claude-code`：目录 `~/.claude`，程序名 `claude`
- `opencode`：目录为配置文件所在目录（设置了 `XDG_CONFIG_HOME` 时为 `$XDG_CONFIG_HOME/opencode`，否则为 `~/.config/opencode`），程序名 `opencode`
- DeepSeek Harness（dsh）（工具 id `dsh`）：目录为 `$DSH_HOME`（未设置或为空白时为 `~/.dsh`），程序名 `dsh`
- `pi`：目录为 `$PI_CODING_AGENT_DIR`（trim 后非空则用该路径，否则为 `~/.pi/agent`），程序名 `pi`

程序是否存在必须只根据 `PATH` 查找该名称的可执行文件，不得启动该程序。目录不存在、该路径存在但不是目录、或程序不在 `PATH` 上时，必须跳过该工具：不得创建其配置目录，不得读写其配置文件。跳过必须向 stderr 用显示名说明该工具，以及缺失的是配置目录、程序，或两者。DeepSeek Harness（dsh）的显示名必须是 `DeepSeek Harness（dsh）`，不得只写 `dsh`。跳过不得单独导致非 0 退出码。

`--all` 必须把四个工具都纳入候选，再只写入通过上述检查的工具。重复传入 `--tool <id>` 时必须只考虑列出的受支持工具，再跳过未通过检查的。若既未给 `--all` 也未给 `--tool`，系统必须在终端提示用户选择一个或多个受支持工具，菜单仍列出这四个，其中 DeepSeek Harness（dsh）的条目必须显示为 `DeepSeek Harness（dsh）`（仍可用编号 `3` 或 id `dsh` 选中）；选中后未通过检查的必须跳过。未知工具 id 必须拒绝，且不得写入任何工具配置。

stdout 必须只列出实际写入的工具，并且必须使用显示名：DeepSeek Harness（dsh）写作 `DeepSeek Harness（dsh）`，不得只写 `dsh`。若全部候选都被跳过，必须不写入任何工具配置，不得声称已应用，并以退出码 0 结束。

命令必须接受可选标志 `--model <id>`。该 id 必须存在于该 profile 的 `models` 中。`--model` 的「本次目标」必须是通过存在性检查、实际会写入的工具。`--model` 用于 Claude Code、DeepSeek Harness（dsh）与 pi：当本次目标包含 `claude-code` 时，必须把该 id 作为 Claude Code 的默认模型写入；当本次目标包含 `dsh` 时，必须把该 id 作为 DeepSeek Harness（dsh）的默认模型写入；当本次目标包含 `pi` 时，必须把该 id 作为 pi 的启动默认模型写入。不得用 `--model` 修改 OpenCode 的模型列表或默认模型。若传了 `--model` 但本次目标既不含 `claude-code`、也不含 `dsh`、也不含 `pi`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。未知模型 id 必须拒绝，且不得写入任何工具配置。未传 `--model` 时不得把模型选择写入任何工具。被跳过的工具不得触发模型写入，也不得因该工具被跳过而要求模型 id。

若指定名称的 profile 不存在，必须输出错误、以非 0 退出码结束，且不得写入工具配置。若用户在交互提示中放弃且未选中任何工具，系统不得写入工具配置，且必须以非 0 退出码结束。

#### Scenario: 应用到全部工具

- **WHEN** 存在 profile `work`，且 `claude-code`、`opencode`、`dsh`、`pi` 的配置目录均为目录、`PATH` 上分别有可执行文件 `claude`、`opencode`、`dsh`、`pi`，用户执行 `agent-cli token use work --all`
- **THEN** 系统把该 profile 应用到 Claude Code、OpenCode、DeepSeek Harness（dsh）和 pi，并以退出码 0 结束

#### Scenario: --all 跳过未就绪的工具

- **WHEN** 存在 profile `work`，仅 OpenCode 的配置目录为目录且 `PATH` 上有 `opencode`，其余三个工具的配置目录不存在或对应程序不在 `PATH` 上，用户执行 `agent-cli token use work --all`
- **THEN** 系统只把该 profile 应用到 OpenCode，不创建其余工具的配置目录，不读写它们的配置文件；stderr 说明被跳过的工具及缺失项；stdout 只列出实际写入的 `opencode`；并以退出码 0 结束

#### Scenario: 应用到指定工具

- **WHEN** 存在 profile `work`，`~/.claude` 为目录且 `PATH` 上有 `claude`，用户执行 `agent-cli token use work --tool claude-code`
- **THEN** 系统只把该 profile 应用到 Claude Code，不修改 OpenCode、DeepSeek Harness（dsh）或 pi 配置

#### Scenario: 显式指定的工具缺少目录时跳过

- **WHEN** 存在 profile `work`，`PATH` 上有 `claude`，但 `~/.claude` 不存在，用户执行 `agent-cli token use work --tool claude-code`（未给 `--model`）
- **THEN** 系统不创建 `~/.claude`，不读写 Claude Code 配置；stderr 说明跳过及缺失的是配置目录；stdout 不声称已应用到 `claude-code`；并以退出码 0 结束

#### Scenario: 显式指定的工具缺少程序时跳过

- **WHEN** 存在 profile `work`，`~/.claude` 已是目录，但 `PATH` 上没有可执行文件 `claude`，用户执行 `agent-cli token use work --tool claude-code`（未给 `--model`）
- **THEN** 系统不修改 `~/.claude/settings.json`；stderr 说明跳过及缺失的是程序；并以退出码 0 结束

#### Scenario: 应用到 dsh

- **WHEN** 存在 profile `work`，DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，用户执行 `agent-cli token use work --tool dsh`
- **THEN** 系统只把该 profile 应用到 DeepSeek Harness（dsh），不修改 Claude Code、OpenCode 或 pi 配置

#### Scenario: 应用到 pi

- **WHEN** 存在 profile `work`，pi agent 目录为目录且 `PATH` 上有 `pi`，用户执行 `agent-cli token use work --tool pi`
- **THEN** 系统只把该 profile 应用到 pi，不修改 Claude Code、OpenCode 或 DeepSeek Harness（dsh）配置

#### Scenario: 交互选择工具

- **WHEN** 用户执行 `agent-cli token use work` 且未带 `--all` 或 `--tool`，OpenCode 的配置目录为目录且 `PATH` 上有 `opencode`，随后在提示中选择 OpenCode
- **THEN** 系统只把该 profile 应用到 OpenCode

#### Scenario: 交互选中未就绪的工具时跳过

- **WHEN** 用户执行 `agent-cli token use work` 且未带 `--all` 或 `--tool`，随后在提示中选择 `claude-code`，但 `~/.claude` 不存在或 `PATH` 上没有 `claude`
- **THEN** 系统不创建 `~/.claude`，不写入任何工具配置，向 stderr 说明跳过，并以退出码 0 结束

#### Scenario: 所选工具全部跳过

- **WHEN** 存在 profile `work`，四个工具的配置目录都不存在，用户执行 `agent-cli token use work --all`
- **THEN** 系统不创建任何工具配置目录，不写入任何工具配置，不声称已应用，并以退出码 0 结束

#### Scenario: 过滤后 --model 无适用工具时拒绝

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，仅 OpenCode 通过存在性检查，用户执行 `agent-cli token use work --all --model qwen3.8-max`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知工具

- **WHEN** 用户执行 `agent-cli token use work --tool cursor`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 切换不存在的 profile

- **WHEN** 不存在名为 `missing` 的 profile，用户执行 `agent-cli token use missing --all`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 指定模型写入 Claude Code

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，`~/.claude` 为目录且 `PATH` 上有 `claude`，用户执行 `agent-cli token use work --tool claude-code --model qwen3.8-max`
- **THEN** 系统把该 profile 应用到 Claude Code，并把该模型 id 写入 Claude Code 默认模型，以退出码 0 结束

#### Scenario: --all 时模型影响 Claude Code 与 dsh

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，四个工具的配置目录均为目录且对应程序均在 `PATH` 上，用户执行 `agent-cli token use work --all --model qwen3.8-max`
- **THEN** 系统把凭据应用到 Claude Code、OpenCode、DeepSeek Harness（dsh）和 pi，把该模型 id 写入 Claude Code 默认模型、DeepSeek Harness（dsh）默认模型与 pi 启动默认模型，且不因 `--model` 改变 OpenCode 的模型选择

#### Scenario: 仅 dsh 时写入默认模型

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，用户执行 `agent-cli token use work --tool dsh --model qwen3.8-max`
- **THEN** 系统把该 profile 应用到 DeepSeek Harness（dsh）并把该模型 id 写入 DeepSeek Harness（dsh）默认模型，不修改 Claude Code、OpenCode 或 pi 配置

#### Scenario: 仅 pi 时写入默认模型

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，pi agent 目录为目录且 `PATH` 上有 `pi`，用户执行 `agent-cli token use work --tool pi --model qwen3.8-max`
- **THEN** 系统把该 profile 应用到 pi 并把该模型 id 写入 pi 启动默认模型，不修改 Claude Code、OpenCode 或 DeepSeek Harness（dsh）配置

#### Scenario: 仅 OpenCode 时拒绝 --model

- **WHEN** 存在 profile `work`，OpenCode 通过存在性检查，用户执行 `agent-cli token use work --tool opencode --model qwen3.8-max`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知模型

- **WHEN** 存在 profile `work`，`~/.claude` 为目录且 `PATH` 上有 `claude`，用户执行 `agent-cli token use work --tool claude-code --model not-a-model`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 更新 Claude Code 的 env

将 profile 应用到 Claude Code 时，系统必须更新用户主目录下的 `~/.claude/settings.json`。必须把 `env.ANTHROPIC_AUTH_TOKEN` 设为 profile 的 `token`，把 `env.ANTHROPIC_BASE_URL` 设为 Claude 兼容地址。若本次 `token use` 提供了 `--model`，还必须把 `env.ANTHROPIC_MODEL` 设为该模型 id；若未提供 `--model`，必须保留已有的 `ANTHROPIC_MODEL`（若存在）。必须保留其它 JSON 字段以及 `env` 内其它键。

仅当 `~/.claude` 已存在且为目录、并且 `PATH` 上有可执行文件 `claude` 时，才允许写入。否则必须跳过，不得创建 `~/.claude`，不得读写 `settings.json`。在允许写入时，若 `settings.json` 或 `env` 对象不存在，必须按需创建该文件，使 token 与地址被写入。

#### Scenario: 合并进已有 settings

- **WHEN** `~/.claude` 为目录且 `PATH` 上有 `claude`，`~/.claude/settings.json` 已包含 `env` 以及 `hooks` 等其它字段，且本次未指定 `--model`
- **THEN** 应用 profile 时只更新 `env.ANTHROPIC_AUTH_TOKEN` 和 `env.ANTHROPIC_BASE_URL`，其它 `env` 键（含已有 `ANTHROPIC_MODEL`）以及所有非 `env` 字段保持不变

#### Scenario: 文件不存在时创建 settings

- **WHEN** `~/.claude` 为目录且 `PATH` 上有 `claude`，但 `~/.claude/settings.json` 不存在，且 Claude Code 是本次应用目标，且未指定 `--model`
- **THEN** 系统创建该文件，并按 profile 写入 `env.ANTHROPIC_AUTH_TOKEN` 和 `env.ANTHROPIC_BASE_URL`，且不写入 `ANTHROPIC_MODEL`

#### Scenario: 配置目录不存在时不创建

- **WHEN** `~/.claude` 不存在，且 Claude Code 是本次候选目标
- **THEN** 系统不创建 `~/.claude`，不创建 `settings.json`

#### Scenario: 指定模型时写入 ANTHROPIC_MODEL

- **WHEN** `~/.claude` 为目录且 `PATH` 上有 `claude`，用户以 `--model qwen3.8-max` 将 profile 应用到 Claude Code
- **THEN** 系统把 `env.ANTHROPIC_MODEL` 设为 `qwen3.8-max`，并仍写入 token 与 Claude 兼容地址

### Requirement: 更新 OpenCode 的 provider

将 profile 应用到 OpenCode 时，系统必须更新 `~/.config/opencode/opencode.json`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/opencode/opencode.json`）。必须以该 profile 的 `name` 作为 `provider` 下的键 `<id>`，并把该条目的 `name` 显示名写成同一 `name`。必须把 `provider.<id>.options.apiKey` 写成 profile 的 `token`，把 `provider.<id>.options.baseURL` 写成 Claude 兼容地址。必须按 profile 的 `models` 写入 `provider.<id>.models`：以模型 `id` 为键，至少包含 `name`。若该模型 id 已存在，必须保留其既有的其它字段（如 `options`、`modalities`）。必须保留其它 provider、该 provider 上除被更新字段以外的其它键，以及其它顶层字段。不得删除或改写未作为本次目标的 provider（包括既有的 `bailian` 或 `tencent`）。

仅当 OpenCode 配置目录已存在且为目录、并且 `PATH` 上有可执行文件 `opencode` 时，才允许写入。否则必须跳过，不得创建该配置目录，不得读写 `opencode.json`。在允许写入时，若文件或 provider 条目不存在，必须按需创建该文件，使凭据与模型列表被写入。

#### Scenario: 按 profile 名称写入 provider

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，用户把名为 `work` 的 `aliyun` profile 应用到 OpenCode
- **THEN** 系统设置 `provider.work.name`、`provider.work.options.apiKey`、`provider.work.options.baseURL`，并按该 profile 的 `models` 写入 `provider.work.models`，不写入 `provider.bailian`

#### Scenario: 不同名称互不覆盖

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，用户把名为 `office` 的 `tencent` profile 应用到 OpenCode，且配置中已有 `provider.work`
- **THEN** 系统设置 `provider.office` 的凭据与模型，并保留 `provider.work`

#### Scenario: 保留已有模型条目的其它字段

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，`provider.work.models` 中某模型 id 已有 `options` 或 `modalities`
- **THEN** 再次应用名为 `work` 的 profile 且包含同一模型 id 时保留这些字段，并确保模型 `name` 与 profile 中的名称一致

#### Scenario: 保留既有平台 provider 键

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，配置中已有 `provider.bailian`，用户把名为 `work` 的 profile 应用到 OpenCode
- **THEN** `provider.bailian` 保持不变，凭据写入 `provider.work`

#### Scenario: 配置目录不存在时不创建

- **WHEN** OpenCode 配置目录不存在，且 OpenCode 是本次候选目标
- **THEN** 系统不创建该目录，不创建 `opencode.json`

### Requirement: 更新 DeepSeek Harness 的 provider

将 profile 应用到 DeepSeek Harness（dsh）（工具 id `dsh`）时，系统必须更新 `$DSH_HOME/settings.yaml` 与 `$DSH_HOME/.credentials.yaml`。若未设置 `DSH_HOME`（缺省或空白），`$DSH_HOME` 必须为 `~/.dsh`。凭据文件名必须是 `.credentials.yaml`，不得写成 `.credential.yaml`。

仅当该配置目录已存在且为目录、并且 `PATH` 上有可执行文件 `dsh` 时，才允许写入。否则必须跳过，不得创建该目录，不得读写 `settings.yaml` 或 `.credentials.yaml`。

添加的模型 provider 必须且只能写在 `llm-pi-ai.providers` 下。必须以该 profile 的 `name` 作为该映射下的键 `<id>`，并把该条目的 `displayName` 写成同一 `name`。必须把 `api` 写成 `openai-completions`，把 `baseURL` 写成 profile 的 `baseUrl`（OpenAI 兼容地址，不得改用 Claude 兼容地址）。必须按 profile 的 `models` 写入该条目的 `models` 数组：每项至少含 `id` 与 `name`。若该模型 `id` 已存在，必须保留其既有的其它字段。不得删除该 provider 上 profile 未列出的已有模型项。必须保留 `llm-pi-ai.providers` 下其它条目、该 provider 上除被更新字段以外的其它键，以及 `settings.yaml` 的其它顶层字段。不得写入 `llm-deepseek`，也不得在 `llm-pi-ai.providers` 之外新建 provider 映射。

系统必须把该 provider 的 `apiKeyEnv` 写成由 profile `name` 派生的 POSIX 标识符：将该 `name` 转为大写、把非 `[A-Z0-9]` 字符替换为 `_`，再追加 `_API_KEY`（例如 `work` → `WORK_API_KEY`，`tencent-token-plan` → `TENCENT_TOKEN_PLAN_API_KEY`）。不得再使用 `AGENT_CLI_` 前缀。若派生结果不是 POSIX 环境变量名（必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`），必须拒绝、不得改写任一文件，并以非 0 退出码结束。

系统必须把同一标识符作为键，把 profile 的 `token` 写成 `.credentials.yaml` 中 `refs` 映射下的字符串值。不得把该键写在凭据文件根映射。写入完成后，凭据文件根映射只允许包含 `version`、`refs`，以及已有的 `records`（若存在）。`version` 必须是整数 `1`。不得把 token 明文写入 `settings.yaml`。必须保留 `refs` 中其它键，以及 `records` 整棵子树（若存在）。该凭据文件权限必须为 `0600`，其所在目录权限必须为 `0700`。

若 `.credentials.yaml` 不存在或为空映射，必须创建 `version: 1` 与 `refs`，再写入本次键。若已有文档是预发布扁平布局（根映射含环境变量键、没有 `version`），必须把这些键迁入 `refs`、写入 `version: 1`，再写入本次 token。若已有文档声明 `version: 1`，且根上除 `version` / `refs` / `records` 外还有 POSIX 环境变量键（例如旧版 CLI 写入的 `AGENT_CLI_*`），必须把这些键迁入 `refs` 后再写入本次 token。若 `refs` 存在但不是映射，或 `version` 存在但不是整数 `1`，或根上存在无法迁入 `refs` 的未知键，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

若本次 `token use` 提供了 `--model` 且目标含 `dsh`，还必须把默认模型写在 `settings.yaml` 顶层的 `agent-default-model`：`provider` 为该 profile 的 `name`，`model` 为该模型 id。不得把默认模型写进 `llm-pi-ai.providers` 条目。若未提供 `--model`，必须保留已有的 `agent-default-model`（若存在）。

在允许写入时，若文件或中间对象不存在，必须按需创建这些文件，使路由与凭据被写入，但不得创建缺失的配置目录。若已有 `settings.yaml` 或 `.credentials.yaml` 根节点不是映射，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

#### Scenario: 按 profile 名称写入 provider

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，用户把名为 `work` 的 profile（`baseUrl` 为 `https://example.openai/v1`）应用到 DeepSeek Harness（dsh）
- **THEN** 系统设置 `llm-pi-ai.providers.work.displayName` 为 `work`、`api` 为 `openai-completions`、`baseURL` 为 `https://example.openai/v1`，按该 profile 的 `models` 写入 `models`，把 `apiKeyEnv` 写成 `WORK_API_KEY`，在 `.credentials.yaml` 的 `refs.WORK_API_KEY` 写入 token，根上含 `version: 1`，且 `settings.yaml` 不含该 token

#### Scenario: 带连字符的名称派生 apiKeyEnv

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，用户把名为 `tencent-token-plan` 的 profile 应用到 DeepSeek Harness（dsh）
- **THEN** 系统把 `llm-pi-ai.providers.tencent-token-plan.apiKeyEnv` 写成 `TENCENT_TOKEN_PLAN_API_KEY`，并在 `.credentials.yaml` 的 `refs.TENCENT_TOKEN_PLAN_API_KEY` 写入 token

#### Scenario: 保留其它 refs 与 records

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，`.credentials.yaml` 已有 `version: 1`、`refs.DEEPSEEK_API_KEY` 与 `records` 下某条记录，用户把名为 `work` 的 profile 应用到 DeepSeek Harness（dsh）
- **THEN** 系统写入 `refs.WORK_API_KEY`，并保留 `refs.DEEPSEEK_API_KEY` 与既有 `records`

#### Scenario: 扁平凭据文档迁入 refs

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，`.credentials.yaml` 根映射为 `DEEPSEEK_API_KEY: <existing>` 且没有 `version`，用户把名为 `work` 的 profile 应用到 DeepSeek Harness（dsh）
- **THEN** 系统把文档写成 `version: 1`，`refs` 含 `DEEPSEEK_API_KEY` 与 `WORK_API_KEY`，且根上不再有环境变量键

#### Scenario: 根上的旧 AGENT_CLI 键迁入 refs

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，`.credentials.yaml` 已有 `version: 1`、`refs` 与根键 `AGENT_CLI_WORK_API_KEY`，用户把名为 `work` 的 profile 应用到 DeepSeek Harness（dsh）
- **THEN** 系统把 `AGENT_CLI_WORK_API_KEY` 迁入 `refs`，写入 `refs.WORK_API_KEY`，且根上不再有 `AGENT_CLI_WORK_API_KEY`

#### Scenario: 非法派生名拒绝写入

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，用户把名为 `123` 的 profile 应用到 DeepSeek Harness（dsh）
- **THEN** 系统以非 0 退出码结束，且不改写 `settings.yaml` 或 `.credentials.yaml`

#### Scenario: 不同名称互不覆盖

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，用户把名为 `office` 的 profile 应用到 DeepSeek Harness（dsh），且 `settings.yaml` 已有 `llm-pi-ai.providers.work`
- **THEN** 系统设置 `providers.office` 的路由与凭据，并保留 `providers.work`

#### Scenario: 保留已有模型条目的其它字段

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，`llm-pi-ai.providers.work.models` 中某模型 id 已有 `contextWindow` 或 `compat`
- **THEN** 再次应用名为 `work` 的 profile 且包含同一模型 id 时保留这些字段，并确保模型 `name` 与 profile 中的名称一致

#### Scenario: 指定模型时写入默认路由

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，用户以 `--model qwen3.8-max` 将 profile `work` 应用到 DeepSeek Harness（dsh）
- **THEN** 系统把 `agent-default-model.provider` 设为 `work`、`agent-default-model.model` 设为 `qwen3.8-max`，并仍写入该 provider 的路由与凭据

#### Scenario: 未指定模型时保留默认路由

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，`settings.yaml` 已有 `agent-default-model`，用户未带 `--model` 将 profile 应用到 DeepSeek Harness（dsh）
- **THEN** 系统更新该 profile 对应 provider 与凭据，且不改写 `agent-default-model`

#### Scenario: 文件不存在时创建

- **WHEN** DeepSeek Harness（dsh）配置目录为目录且 `PATH` 上有 `dsh`，但 `$DSH_HOME/settings.yaml` 与 `.credentials.yaml` 均不存在，且 DeepSeek Harness（dsh）是本次应用目标
- **THEN** 系统创建这两个文件，凭据文件含 `version: 1` 与 `refs` 下该 profile 的键，且未给 `--model` 时不写入 `agent-default-model`

#### Scenario: 配置目录不存在时不创建

- **WHEN** `$DSH_HOME`（或未设置时的 `~/.dsh`）不存在，且 DeepSeek Harness（dsh）是本次候选目标
- **THEN** 系统不创建该目录，不创建 `settings.yaml` 或 `.credentials.yaml`

#### Scenario: 使用 DSH_HOME

- **WHEN** 环境变量 `DSH_HOME` 指向一个已存在的目录，且 `PATH` 上有 `dsh`，用户将 profile 应用到 DeepSeek Harness（dsh）
- **THEN** 系统读写该目录下的 `settings.yaml` 与 `.credentials.yaml`，不写默认的 `~/.dsh/`

### Requirement: 更新 pi agent 的 provider

将 profile 应用到 pi（工具 id `pi`）时，系统必须更新 pi agent 目录下的 `models.json` 与 `auth.json`。

pi agent 目录必须为：若环境变量 `PI_CODING_AGENT_DIR` 非空（trim 后），则使用该路径；否则为 `~/.pi/agent`（即用户主目录下的 `.pi/agent`）。不得读写项目目录下的 `.pi/`。不得读写 `models-store.json`。

仅当该 agent 目录已存在且为目录、并且 `PATH` 上有可执行文件 `pi` 时，才允许写入。否则必须跳过，不得创建该目录（含其父目录），不得读写 `models.json`、`auth.json` 或 `settings.json`。

`models.json` 必须在顶层 `providers` 映射下，以该 profile 的 `name` 作为键 `<id>` upsert 一条自定义 provider。必须把该条目的 `baseUrl` 写成 profile 的 `baseUrl`（OpenAI 兼容地址，不得改用 Claude 兼容地址），把 `api` 写成 `openai-completions`，把 `authHeader` 写成 `true`。必须按 profile 的 `models` 写入该条目的 `models` 数组：每项至少含 `id` 与 `name`（若 profile 中无 `name` 或为空则用 `id`）。若该模型 `id` 已存在，必须保留其既有的其它字段。不得删除该 provider 上 profile 未列出的已有模型项。必须保留 `providers` 下其它条目、该 provider 上除被更新字段以外的其它键，以及 `models.json` 的其它顶层字段。不得在 `models.json` 的该 provider 条目中写入明文 `apiKey` 或 token。

系统必须在 `auth.json` 根映射下，以同一 profile `name` 为键，写入 `{ "type": "api_key", "key": <profile.token> }`。必须保留 `auth.json` 中其它 provider 键及其值。该凭据文件权限必须为 `0600`；在允许写入且文件不存在时必须按需创建。若 `auth.json` 已存在且根节点不是 JSON 对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。若 `models.json` 已存在且根节点不是 JSON 对象，或已有 `providers` 但不是对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

若本次 `token use` 提供了 `--model` 且目标含 `pi`，还必须更新同一 agent 目录下的 `settings.json`：把 `defaultProvider` 设为该 profile 的 `name`，把 `defaultModel` 设为该模型 id。必须保留 `settings.json` 的其它字段。若未提供 `--model`，必须保留已有的 `defaultProvider` 与 `defaultModel`（若存在），且不得因本次应用而新建仅含默认模型的 `settings.json`。若 `settings.json` 已存在且根节点不是 JSON 对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

在允许写入时，若文件或中间对象不存在，必须按需创建这些文件，使 provider 与凭据被写入，但不得创建缺失的 agent 目录。

#### Scenario: 按 profile 名称写入 provider 与凭据

- **WHEN** pi agent 目录为目录且 `PATH` 上有 `pi`，用户把名为 `work` 的 profile（`baseUrl` 为 `https://example.openai/v1`）应用到 pi
- **THEN** 系统在 `models.json` 设置 `providers.work.baseUrl` 为 `https://example.openai/v1`、`api` 为 `openai-completions`、`authHeader` 为 `true`，按该 profile 的 `models` 写入 `models`，在 `auth.json` 写入 `work` 为 `{ "type": "api_key", "key": <token> }`，且 `models.json` 不含该 token

#### Scenario: 不同名称互不覆盖

- **WHEN** pi agent 目录为目录且 `PATH` 上有 `pi`，用户把名为 `office` 的 profile 应用到 pi，且 `models.json` 已有 `providers.work`、`auth.json` 已有 `work`
- **THEN** 系统设置 `providers.office` 与 `auth.json` 的 `office`，并保留 `providers.work` 与 `auth.json` 的 `work`

#### Scenario: 保留已有模型条目的其它字段

- **WHEN** pi agent 目录为目录且 `PATH` 上有 `pi`，`providers.work.models` 中某模型 id 已有 `contextWindow` 或 `compat`
- **THEN** 再次应用名为 `work` 的 profile 且包含同一模型 id 时保留这些字段，并确保模型 `name` 与 profile 中的名称一致

#### Scenario: 指定模型时写入启动默认

- **WHEN** pi agent 目录为目录且 `PATH` 上有 `pi`，用户以 `--model qwen3.8-max` 将 profile `work` 应用到 pi
- **THEN** 系统把 `settings.json` 的 `defaultProvider` 设为 `work`、`defaultModel` 设为 `qwen3.8-max`，并仍写入该 provider 与凭据

#### Scenario: 未指定模型时保留启动默认

- **WHEN** pi agent 目录为目录且 `PATH` 上有 `pi`，`settings.json` 已有 `defaultProvider` 与 `defaultModel`，用户未带 `--model` 将 profile 应用到 pi
- **THEN** 系统更新该 profile 对应 provider 与凭据，且不改写 `defaultProvider` 与 `defaultModel`

#### Scenario: 文件不存在时创建

- **WHEN** pi agent 目录为目录且 `PATH` 上有 `pi`，但目录下 `models.json` 与 `auth.json` 均不存在，且 pi 是本次应用目标，且未给 `--model`
- **THEN** 系统创建这两个文件并写入该 profile 的 provider 与凭据，且不创建或改写仅用于默认模型的 `settings.json`（若本就不存在）

#### Scenario: 配置目录不存在时不创建

- **WHEN** pi agent 目录不存在，且 pi 是本次候选目标
- **THEN** 系统不创建该目录及其父目录，不创建 `models.json`、`auth.json` 或 `settings.json`

#### Scenario: 使用 PI_CODING_AGENT_DIR

- **WHEN** 环境变量 `PI_CODING_AGENT_DIR` 指向一个已存在的目录，且 `PATH` 上有 `pi`，用户将 profile 应用到 pi
- **THEN** 系统读写该目录下的 `models.json`、`auth.json` 与（若适用）`settings.json`，不写默认的 `~/.pi/agent/`

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`、`token usage`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`、`pi`。必须说明 `--model` 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效。必须用显示名 DeepSeek Harness（dsh）称呼该工具，不得在帮助正文里只写 `dsh` 来指代它（`--tool` 的取值仍是 `dsh`）。必须说明配置目录或对应程序不存在的工具会被跳过，且不会因此创建该配置目录。必须说明 `sync-model-list` 可按 `--name` 同步单个 profile，可按 `--platform` 过滤，省略 `--name` 时同步全部目标 profile，且每个目标都用该 profile 自己的 `{baseUrl}/models`。必须说明 `--platform` 对 `add` / `sync-model-list` 可取 `aliyun`、`tencent`、`deepseek`、`kimi`。必须说明 DeepSeek 与 Kimi 添加时可省略 `--base-url` / `--claude-base-url` 并使用官方预设，显式传入则覆盖。必须说明 `token usage` 按已保存 profile 分段查询套餐余量或账户余额并分别展示，成功段之间以空行分隔；省略 `--name` 时查询全部 profile，可用 `--name` 指定单套；必须说明 `--output` 可取 `table`、`text` 或 `raw`，省略时默认为表格。不得再说明 usage 接受或默认 `--platform`。不得再说明按平台共享 `model-list.json` 或同步腾讯云使用 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use、sync-model-list、usage 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效

#### Scenario: 帮助说明缺失工具会被跳过

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 在目标工具的配置目录或对应程序不存在时跳过该工具，且不创建该配置目录

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

#### Scenario: 帮助列出 dsh

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出用显示名 DeepSeek Harness（dsh）称呼该工具，并说明 `--tool` 可指定 `dsh`

#### Scenario: 帮助列出 pi

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `pi`

#### Scenario: 帮助列出 usage

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token usage` 按 profile 分段展示余量、段间空行，可用 `--name` 指定 profile、`--output` 取 `table`（默认）、`text` 或 `raw`，且不将 `--platform` 作为 usage 的参数说明
