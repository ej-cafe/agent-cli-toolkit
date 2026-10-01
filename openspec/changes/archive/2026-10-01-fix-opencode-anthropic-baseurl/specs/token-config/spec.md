## MODIFIED Requirements

### Requirement: 更新 OpenCode 的 provider

将 profile 应用到 OpenCode 时，系统必须更新 `~/.config/opencode/opencode.json`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/opencode/opencode.json`）。必须以该 profile 的 `name` 作为 `provider` 下的键 `<id>`，并把该条目的 `name` 显示名写成同一 `name`。必须把 `provider.<id>.options.apiKey` 写成 profile 的 `token`。

`provider.<id>.options.baseURL` 必须写成该 profile 的 Claude 兼容地址，并按该条目最终的 `npm` 补齐协议版本段：最终 `npm` 为 `@ai-sdk/anthropic` 时，该地址必须以 `/v1` 结尾（已以 `/v1` 结尾时不得重复追加），因为该 SDK 只在 `baseURL` 后面拼接 `/messages`；最终 `npm` 为其它包时，必须原样写入该地址，不得增删路径段。`provider.<id>.npm` 的取值必须为：条目此前不存在且调用方未显式指定包时写 `@ai-sdk/anthropic`；调用方显式指定了其它兼容包（例如 OpenAI 风格的 `@ai-sdk/openai`）时写该包；条目此前已存在且调用方未显式指定包时不得改写其 `npm`。本字段与 Claude Code 的 `ANTHROPIC_BASE_URL` 取值不同：Claude Code 自行拼接 `/v1/messages`，其 `ANTHROPIC_BASE_URL` 必须是不带 `/v1` 的 Claude 兼容地址。

必须按 profile 的 `models` 写入 `provider.<id>.models`：以模型 `id` 为键，至少包含 `name`。若该模型 id 已存在，必须保留其既有的其它字段（如 `options`、`modalities`）。必须保留其它 provider、该 provider 上除被更新字段以外的其它键，以及其它顶层字段。不得删除或改写未作为本次目标的 provider（包括既有的 `bailian` 或 `tencent`）。

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

#### Scenario: anthropic 包的 baseURL 补上 /v1

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，用户把名为 `work` 的 profile 应用到 OpenCode，该 profile 的 Claude 兼容地址为 `https://c.test/anthropic`，且 `provider.work` 此前不存在
- **THEN** 系统写入 `provider.work.npm` 为 `@ai-sdk/anthropic`，并写入 `provider.work.options.baseURL` 为 `https://c.test/anthropic/v1`

#### Scenario: Claude 地址回退到 baseUrl 时同样补 /v1

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，用户把名为 `work` 的 profile 应用到 OpenCode，该 profile 未设置 `claudeBaseUrl` 且 `baseUrl` 为 `https://api.deepseek.com`
- **THEN** 系统写入 `provider.work.options.baseURL` 为 `https://api.deepseek.com/v1`

#### Scenario: 地址已带 /v1 时不重复追加

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，用户把名为 `work` 的 profile 应用到 OpenCode，该 profile 的 Claude 兼容地址为 `https://c.test/v1`
- **THEN** 系统写入 `provider.work.options.baseURL` 为 `https://c.test/v1`，不写成 `https://c.test/v1/v1`

#### Scenario: 非 anthropic 包时原样写入地址

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，用户把名为 `work` 的 profile 应用到 OpenCode，调用方显式指定包 `@ai-sdk/openai`，且该 profile 的 Claude 兼容地址为 `http://127.0.0.1:8787/v1`
- **THEN** 系统写入 `provider.work.npm` 为 `@ai-sdk/openai`，并写入 `provider.work.options.baseURL` 为 `http://127.0.0.1:8787/v1`

#### Scenario: 已有 provider 的 npm 不被改写

- **WHEN** OpenCode 配置目录为目录且 `PATH` 上有 `opencode`，`provider.work` 已存在且其 `npm` 为 `custom-npm`，用户再次把名为 `work` 的 profile 应用到 OpenCode（未显式指定包）
- **THEN** `provider.work.npm` 仍为 `custom-npm`，`provider.work.options.baseURL` 原样为该 profile 的 Claude 兼容地址，不补 `/v1`
