## MODIFIED Requirements

### Requirement: 同步 profile 模型列表

系统必须提供 `agent-cli token sync-model-list`，按目标 profile 刷新各自保存在 `token-profile.json` 中的 `models`。

命令必须接受可选标志 `--name <profile>` 与可选标志 `--platform <aliyun|tencent>`。不得接受额外位置参数；若传入多余参数，必须向 stderr 输出错误并以非 0 退出码结束。

目标选择：

- 若提供 `--name`：目标为该名称的 profile。若名称不存在，必须拒绝、不写入任何 profile，并以非 0 退出码结束。若同时提供 `--platform` 且该 profile 的 `platform` 与标志不符，必须拒绝、不写入任何 profile，并以非 0 退出码结束。
- 若未提供 `--name`：目标为全部已保存 profile；若同时提供 `--platform`，则只包含该平台的 profile。若过滤后没有任何目标（含尚无任何 profile），必须拒绝、不写入任何 profile，并以非 0 退出码结束。
- 未知 `--platform` 必须拒绝，且不得写入任何 profile。

对每个目标 profile，系统必须只用该 profile 自己的 `baseUrl` 与 `token` 发起 `GET`，路径为该 `baseUrl`（去掉末尾 `/`）加上 `/models`，请求头带 `Authorization: Bearer <token>`。若 HTTP 成功、响应可解析且得到非空列表，必须把每项的 `id` 与 `name`（若无 `name` 或为空则用 `id`）写入**仅该** profile 的 `models`。不得把一次成功结果写入其它 profile。不得使用 CLI 内置模型目录。不得读写 `model-list.json`。不得调用腾讯云 TokenHub，不得读取 `TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY` 或 `TENCENTCLOUD_REGION`。

若某个目标的 `/models` 失败、无法解析或得到空列表，必须不改写该 profile 的 `models`。多目标时：已成功写入的目标必须保留；失败的目标不得写入；命令必须向 stderr 说明失败项，并以非 0 退出码结束。全部目标均成功时以退出码 0 结束。不得修改 Claude Code、OpenCode、DeepSeek Harness 或 pi 的配置文件。

#### Scenario: 按名称同步单个 profile

- **WHEN** 已存在 profile `work`（`baseUrl` 为 `https://example.openai/v1`），用户执行 `agent-cli token sync-model-list --name work`，且 `GET https://example.openai/v1/models` 返回非空列表
- **THEN** 系统把该列表写入 `work` 的 `models`，不改写其它 profile，并以退出码 0 结束

#### Scenario: 未知名称拒绝

- **WHEN** 不存在名为 `missing` 的 profile，用户执行 `agent-cli token sync-model-list --name missing`
- **THEN** 系统不修改任何 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: --name 与 --platform 不匹配时拒绝

- **WHEN** 已存在 `platform` 为 `aliyun` 的 profile `work`，用户执行 `agent-cli token sync-model-list --name work --platform tencent`
- **THEN** 系统不修改任何 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 按平台过滤同步

- **WHEN** 已存在 `aliyun` profile `work` 与 `tencent` profile `corp`，用户执行 `agent-cli token sync-model-list --platform aliyun`，且 `work` 的 `{baseUrl}/models` 返回非空列表
- **THEN** 系统只更新 `work` 的 `models`，不改写 `corp`，并以退出码 0 结束

#### Scenario: 省略标志时同步全部 profile

- **WHEN** 已存在 profile `work` 与 `home`，用户执行 `agent-cli token sync-model-list`（未传 `--name` 或 `--platform`），且两者各自 `{baseUrl}/models` 均返回非空列表
- **THEN** 系统分别用各自凭据更新 `work` 与 `home` 的 `models`，并以退出码 0 结束

#### Scenario: 同平台两套 profile 各自独立

- **WHEN** 已存在两套 `aliyun` profile `work` 与 `home`（`baseUrl` 不同），用户执行 `agent-cli token sync-model-list --platform aliyun`，且两者 `/models` 返回不同的非空列表
- **THEN** `work` 与 `home` 的 `models` 分别与各自接口列表一致

#### Scenario: 无匹配目标时拒绝

- **WHEN** 没有 `tencent` profile，用户执行 `agent-cli token sync-model-list --platform tencent`
- **THEN** 系统不修改任何 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 多目标时部分失败保留成功项

- **WHEN** 已存在 profile `work` 与 `home`，用户执行 `agent-cli token sync-model-list`，`work` 的 `/models` 成功且非空，`home` 的 `/models` 失败
- **THEN** 系统更新 `work` 的 `models`，不改写 `home` 的 `models`，向 stderr 说明 `home` 失败，并以非 0 退出码结束

#### Scenario: 单个目标 models 失败时不写入

- **WHEN** 已存在 profile `work`，用户执行 `agent-cli token sync-model-list --name work`，且对该 profile 的 `{baseUrl}/models` 失败
- **THEN** 系统不改写 `work` 的 `models`，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知平台

- **WHEN** 用户执行 `agent-cli token sync-model-list --platform aws`
- **THEN** 系统不修改任何 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝多余参数

- **WHEN** 用户执行 `agent-cli token sync-model-list extra`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 同步不改工具配置

- **WHEN** 用户执行 `agent-cli token sync-model-list --name work` 且同步成功
- **THEN** 系统不修改 Claude Code、OpenCode、DeepSeek Harness 或 pi 的配置文件

### Requirement: 删除 token profile

系统必须提供 `agent-cli token delete <name>` 按名称删除已存储的 profile。若名称存在，必须只删除该套并保留其它 profile。若名称不存在，必须向 stderr 输出错误并以非 0 退出码结束。删除 profile 本身不得修改 Claude Code、OpenCode、DeepSeek Harness 或 pi 的配置文件。

#### Scenario: 删除成功

- **WHEN** 存在名为 `work` 的 profile，用户执行 `agent-cli token delete work`
- **THEN** 该 profile 从 `token-profile.json` 中移除，其它 profile 仍保留

#### Scenario: 删除不存在的 profile

- **WHEN** 不存在名为 `missing` 的 profile，用户执行 `agent-cli token delete missing`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 将 profile 切换到 agent 工具

系统必须提供 `agent-cli token use <name>`，把已存储的 profile 应用到 agent 工具。

支持的工具为 `claude-code`、`opencode`、`dsh` 和 `pi`。`--all` 必须同时应用到这四者。重复传入 `--tool <id>` 时必须只应用到列出的受支持工具。若既未给 `--all` 也未给 `--tool`，系统必须在终端提示用户选择一个或多个受支持工具。未知工具 id 必须拒绝，且不得写入任何工具配置。

命令必须接受可选标志 `--model <id>`。该 id 必须存在于该 profile 的 `models` 中。`--model` 用于 Claude Code、dsh 与 pi：当本次目标包含 `claude-code` 时，必须把该 id 作为 Claude Code 的默认模型写入；当本次目标包含 `dsh` 时，必须把该 id 作为 DeepSeek Harness 的默认模型写入；当本次目标包含 `pi` 时，必须把该 id 作为 pi 的启动默认模型写入。不得用 `--model` 修改 OpenCode 的模型列表或默认模型。若传了 `--model` 但本次目标既不含 `claude-code`、也不含 `dsh`、也不含 `pi`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。未知模型 id 必须拒绝，且不得写入任何工具配置。未传 `--model` 时不得把模型选择写入任何工具。

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

#### Scenario: 仅 OpenCode 时拒绝 --model

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool opencode --model qwen3.8-max`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知模型

- **WHEN** 存在 profile `work`，用户执行 `agent-cli token use work --tool claude-code --model not-a-model`
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`、`pi`。必须说明 `--model` 对 Claude Code、dsh 与 pi 有效。必须说明 `sync-model-list` 可按 `--name` 同步单个 profile，可按 `--platform` 过滤，省略 `--name` 时同步全部目标 profile，且每个目标都用该 profile 自己的 `{baseUrl}/models`。不得再说明按平台共享 `model-list.json` 或同步腾讯云使用 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use、sync-model-list 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 对 Claude Code、dsh 与 pi 有效

#### Scenario: 帮助说明同步模型列表

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token sync-model-list` 可按 `--name` 同步单个 profile、可按 `--platform` 过滤、省略 `--name` 时同步全部目标，每个目标使用该 profile 的 `{baseUrl}/models`，且不含按平台 `model-list.json` 或 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`

#### Scenario: 帮助列出 dsh

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `dsh`

#### Scenario: 帮助列出 pi

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `pi`

## ADDED Requirements

### Requirement: 更新 pi agent 的 provider

将 profile 应用到 pi（工具 id `pi`）时，系统必须更新 pi agent 目录下的 `models.json` 与 `auth.json`。

pi agent 目录必须为：若环境变量 `PI_CODING_AGENT_DIR` 非空（trim 后），则使用该路径；否则为 `~/.pi/agent`（即用户主目录下的 `.pi/agent`）。不得读写项目目录下的 `.pi/`。不得读写 `models-store.json`。

`models.json` 必须在顶层 `providers` 映射下，以该 profile 的 `name` 作为键 `<id>` upsert 一条自定义 provider。必须把该条目的 `baseUrl` 写成 profile 的 `baseUrl`（OpenAI 兼容地址，不得改用 Claude 兼容地址），把 `api` 写成 `openai-completions`，把 `authHeader` 写成 `true`。必须按 profile 的 `models` 写入该条目的 `models` 数组：每项至少含 `id` 与 `name`（若 profile 中无 `name` 或为空则用 `id`）。若该模型 `id` 已存在，必须保留其既有的其它字段。不得删除该 provider 上 profile 未列出的已有模型项。必须保留 `providers` 下其它条目、该 provider 上除被更新字段以外的其它键，以及 `models.json` 的其它顶层字段。不得在 `models.json` 的该 provider 条目中写入明文 `apiKey` 或 token。

系统必须在 `auth.json` 根映射下，以同一 profile `name` 为键，写入 `{ "type": "api_key", "key": <profile.token> }`。必须保留 `auth.json` 中其它 provider 键及其值。该凭据文件权限必须为 `0600`；若不存在则按需创建。若 `auth.json` 已存在且根节点不是 JSON 对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。若 `models.json` 已存在且根节点不是 JSON 对象，或已有 `providers` 但不是对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

若本次 `token use` 提供了 `--model` 且目标含 `pi`，还必须更新同一 agent 目录下的 `settings.json`：把 `defaultProvider` 设为该 profile 的 `name`，把 `defaultModel` 设为该模型 id。必须保留 `settings.json` 的其它字段。若未提供 `--model`，必须保留已有的 `defaultProvider` 与 `defaultModel`（若存在），且不得因本次应用而新建仅含默认模型的 `settings.json`。若 `settings.json` 已存在且根节点不是 JSON 对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

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

- **WHEN** `settings.json` 已有 `defaultProvider` 与 `defaultModel`，用户未带 `--model` 将 profile 应用到 pi
- **THEN** 系统更新该 profile 对应 provider 与凭据，且不改写 `defaultProvider` 与 `defaultModel`

#### Scenario: 文件不存在时创建

- **WHEN** agent 目录下 `models.json` 与 `auth.json` 均不存在，且 pi 是本次应用目标，且未给 `--model`
- **THEN** 系统创建这两个文件并写入该 profile 的 provider 与凭据，且不创建或改写仅用于默认模型的 `settings.json`（若本就不存在）

#### Scenario: 使用 PI_CODING_AGENT_DIR

- **WHEN** 环境变量 `PI_CODING_AGENT_DIR` 指向某目录，用户将 profile 应用到 pi
- **THEN** 系统读写该目录下的 `models.json`、`auth.json` 与（若适用）`settings.json`，不写默认的 `~/.pi/agent/`
