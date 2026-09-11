## MODIFIED Requirements

### Requirement: 更新 DeepSeek Harness 的 provider

将 profile 应用到 DeepSeek Harness（工具 id `dsh`）时，系统必须更新 `$DSH_HOME/settings.yaml` 与 `$DSH_HOME/.credentials.yaml`。若未设置 `DSH_HOME`（缺省或空白），`$DSH_HOME` 必须为 `~/.dsh`。凭据文件名必须是 `.credentials.yaml`，不得写成 `.credential.yaml`。

添加的模型 provider 必须且只能写在 `llm-pi-ai.providers` 下。必须以该 profile 的 `name` 作为该映射下的键 `<id>`，并把该条目的 `displayName` 写成同一 `name`。必须把 `api` 写成 `openai-completions`，把 `baseURL` 写成 profile 的 `baseUrl`（OpenAI 兼容地址，不得改用 Claude 兼容地址）。必须按 profile 的 `models` 写入该条目的 `models` 数组：每项至少含 `id` 与 `name`。若该模型 `id` 已存在，必须保留其既有的其它字段。不得删除该 provider 上 profile 未列出的已有模型项。必须保留 `llm-pi-ai.providers` 下其它条目、该 provider 上除被更新字段以外的其它键，以及 `settings.yaml` 的其它顶层字段。不得写入 `llm-deepseek`，也不得在 `llm-pi-ai.providers` 之外新建 provider 映射。

系统必须把该 provider 的 `apiKeyEnv` 写成由 profile `name` 派生的 POSIX 标识符：将该 `name` 转为大写、把非 `[A-Z0-9]` 字符替换为 `_`，再追加 `_API_KEY`（例如 `work` → `WORK_API_KEY`，`tencent-token-plan` → `TENCENT_TOKEN_PLAN_API_KEY`）。不得再使用 `AGENT_CLI_` 前缀。若派生结果不是 POSIX 环境变量名（必须匹配 `^[A-Za-z_][A-Za-z0-9_]*$`），必须拒绝、不得改写任一文件，并以非 0 退出码结束。

系统必须把同一标识符作为键，把 profile 的 `token` 写成 `.credentials.yaml` 中 `refs` 映射下的字符串值。不得把该键写在凭据文件根映射。写入完成后，凭据文件根映射只允许包含 `version`、`refs`，以及已有的 `records`（若存在）。`version` 必须是整数 `1`。不得把 token 明文写入 `settings.yaml`。必须保留 `refs` 中其它键，以及 `records` 整棵子树（若存在）。该凭据文件权限必须为 `0600`，其所在目录权限必须为 `0700`。

若 `.credentials.yaml` 不存在或为空映射，必须创建 `version: 1` 与 `refs`，再写入本次键。若已有文档是预发布扁平布局（根映射含环境变量键、没有 `version`），必须把这些键迁入 `refs`、写入 `version: 1`，再写入本次 token。若已有文档声明 `version: 1`，且根上除 `version` / `refs` / `records` 外还有 POSIX 环境变量键（例如旧版 CLI 写入的 `AGENT_CLI_*`），必须把这些键迁入 `refs` 后再写入本次 token。若 `refs` 存在但不是映射，或 `version` 存在但不是整数 `1`，或根上存在无法迁入 `refs` 的未知键，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

若本次 `token use` 提供了 `--model` 且目标含 `dsh`，还必须把默认模型写在 `settings.yaml` 顶层的 `agent-default-model`：`provider` 为该 profile 的 `name`，`model` 为该模型 id。不得把默认模型写进 `llm-pi-ai.providers` 条目。若未提供 `--model`，必须保留已有的 `agent-default-model`（若存在）。

若文件或中间对象不存在，必须按需创建，使路由与凭据被写入。若已有 `settings.yaml` 或 `.credentials.yaml` 根节点不是映射，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

#### Scenario: 按 profile 名称写入 provider

- **WHEN** 用户把名为 `work` 的 profile（`baseUrl` 为 `https://example.openai/v1`）应用到 dsh
- **THEN** 系统设置 `llm-pi-ai.providers.work.displayName` 为 `work`、`api` 为 `openai-completions`、`baseURL` 为 `https://example.openai/v1`，按该 profile 的 `models` 写入 `models`，把 `apiKeyEnv` 写成 `WORK_API_KEY`，在 `.credentials.yaml` 的 `refs.WORK_API_KEY` 写入 token，根上含 `version: 1`，且 `settings.yaml` 不含该 token

#### Scenario: 带连字符的名称派生 apiKeyEnv

- **WHEN** 用户把名为 `tencent-token-plan` 的 profile 应用到 dsh
- **THEN** 系统把 `llm-pi-ai.providers.tencent-token-plan.apiKeyEnv` 写成 `TENCENT_TOKEN_PLAN_API_KEY`，并在 `.credentials.yaml` 的 `refs.TENCENT_TOKEN_PLAN_API_KEY` 写入 token

#### Scenario: 保留其它 refs 与 records

- **WHEN** `.credentials.yaml` 已有 `version: 1`、`refs.DEEPSEEK_API_KEY` 与 `records` 下某条记录，用户把名为 `work` 的 profile 应用到 dsh
- **THEN** 系统写入 `refs.WORK_API_KEY`，并保留 `refs.DEEPSEEK_API_KEY` 与既有 `records`

#### Scenario: 扁平凭据文档迁入 refs

- **WHEN** `.credentials.yaml` 根映射为 `DEEPSEEK_API_KEY: <existing>` 且没有 `version`，用户把名为 `work` 的 profile 应用到 dsh
- **THEN** 系统把文档写成 `version: 1`，`refs` 含 `DEEPSEEK_API_KEY` 与 `WORK_API_KEY`，且根上不再有环境变量键

#### Scenario: 根上的旧 AGENT_CLI 键迁入 refs

- **WHEN** `.credentials.yaml` 已有 `version: 1`、`refs` 与根键 `AGENT_CLI_WORK_API_KEY`，用户把名为 `work` 的 profile 应用到 dsh
- **THEN** 系统把 `AGENT_CLI_WORK_API_KEY` 迁入 `refs`，写入 `refs.WORK_API_KEY`，且根上不再有 `AGENT_CLI_WORK_API_KEY`

#### Scenario: 非法派生名拒绝写入

- **WHEN** 用户把名为 `123` 的 profile 应用到 dsh
- **THEN** 系统以非 0 退出码结束，且不改写 `settings.yaml` 或 `.credentials.yaml`

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
- **THEN** 系统创建这两个文件，凭据文件含 `version: 1` 与 `refs` 下该 profile 的键，且未给 `--model` 时不写入 `agent-default-model`

#### Scenario: 使用 DSH_HOME

- **WHEN** 环境变量 `DSH_HOME` 指向某目录，用户将 profile 应用到 dsh
- **THEN** 系统读写该目录下的 `settings.yaml` 与 `.credentials.yaml`，不写默认的 `~/.dsh/`
