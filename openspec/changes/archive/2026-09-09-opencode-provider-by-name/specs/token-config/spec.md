## MODIFIED Requirements

### Requirement: 更新 OpenCode 的 provider

将 profile 应用到 OpenCode 时，系统必须更新 `~/.config/opencode/opencode.json`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/opencode/opencode.json`）。必须以该 profile 的 `name` 作为 `provider` 下的键 `<id>`，并把该条目的 `name` 显示名写成同一 `name`。必须把 `provider.<id>.options.apiKey` 写成 profile 的 `token`，把 `provider.<id>.options.baseURL` 写成 Claude 兼容地址。必须按 profile 的 `models` 写入 `provider.<id>.models`：以模型 `id` 为键，至少包含 `name`。若该模型 id 已存在，必须保留其既有的其它字段（如 `options`、`modalities`）。必须保留其它 provider、该 provider 上除被更新字段以外的其它键，以及其它顶层字段。不得删除或改写未作为本次目标的 provider（包括既有的 `bailian` 或 `tencent`）。若文件或 provider 条目不存在，必须按需创建，使凭据与模型列表被写入。

#### Scenario: 按 profile 名称写入 provider

- **WHEN** 用户把名为 `work` 的 `aliyun` profile 应用到 OpenCode
- **THEN** 系统设置 `provider.work.name`、`provider.work.options.apiKey`、`provider.work.options.baseURL`，并按该 profile 的 `models` 写入 `provider.work.models`，不写入 `provider.bailian`

#### Scenario: 不同名称互不覆盖

- **WHEN** 用户把名为 `office` 的 `tencent` profile 应用到 OpenCode，且配置中已有 `provider.work`
- **THEN** 系统设置 `provider.office` 的凭据与模型，并保留 `provider.work`

#### Scenario: 保留已有模型条目的其它字段

- **WHEN** `provider.work.models` 中某模型 id 已有 `options` 或 `modalities`
- **THEN** 再次应用名为 `work` 的 profile 且包含同一模型 id 时保留这些字段，并确保模型 `name` 与 profile 中的名称一致

#### Scenario: 保留既有平台 provider 键

- **WHEN** OpenCode 配置中已有 `provider.bailian`，用户把名为 `work` 的 profile 应用到 OpenCode
- **THEN** `provider.bailian` 保持不变，凭据写入 `provider.work`
