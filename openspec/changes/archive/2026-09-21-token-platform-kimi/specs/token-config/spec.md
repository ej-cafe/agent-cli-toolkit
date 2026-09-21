## MODIFIED Requirements

### Requirement: 存储 token profile

系统必须把 token profile 持久化到全局配置目录下的 `token-profile.json`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/agent-cli-toolkit`，否则为 `~/.config/agent-cli-toolkit`）。

每个 profile 必须包含：唯一 `name`、`platform`（`aliyun`、`tencent`、`deepseek` 或 `kimi`）、`token`、`baseUrl`，以及 `models`（该 profile 自己的模型列表，每项含 `id` 与 `name`）。同平台不同 profile 的 `models` 必须允许不同。profile 可以包含 `claudeBaseUrl`。写入 Claude 兼容地址时，若 `claudeBaseUrl` 存在且非空则必须使用它，否则使用 `baseUrl`。

系统不得读写配置目录下的 `model-list.json`；不得把平台级模型目录当作 profile `models` 的来源。系统不得把 `token-profile.json` 或 token 值提交进 git 仓库。

#### Scenario: 首次添加时创建文件

- **WHEN** 用户添加第一套 profile，且 `token-profile.json` 尚不存在
- **THEN** 系统在全局配置目录创建该文件并写入这套 profile

#### Scenario: Claude 地址回退到 baseUrl

- **WHEN** 某套 profile 有 `baseUrl` 且未设置 `claudeBaseUrl`
- **THEN** 应用到 Claude Code 或 OpenCode 时使用 `baseUrl` 作为 Claude 兼容地址

#### Scenario: 显式指定 Claude 地址

- **WHEN** 某套 profile 同时有 `baseUrl` 和 `claudeBaseUrl`
- **THEN** 应用到 Claude Code 或 OpenCode 时使用 `claudeBaseUrl` 作为 Claude 兼容地址

#### Scenario: 同平台 profile 可有不同 models

- **WHEN** 已存在两套 `aliyun` profile，其 `models` 列表不同
- **THEN** 系统必须分别保留各自的 `models`，不得因同平台而强制写成同一份

#### Scenario: 添加时写入平台模型列表

- **WHEN** 用户添加一套 `aliyun`、`tencent`、`deepseek` 或 `kimi` profile，且配置目录下已存在含该平台键的 `model-list.json`
- **THEN** 系统不读取该文件；该 profile 的 `models` 只来自正在添加凭据的 `{baseUrl}/models`，不得来自 `model-list.json`

#### Scenario: 忽略已有 model-list.json

- **WHEN** 配置目录下已存在 `model-list.json`，用户添加或同步任一 profile
- **THEN** 系统不读取、不改写该文件，且写入的 profile `models` 只来自该 profile 凭据的 `{baseUrl}/models`

### Requirement: 添加 token profile

系统必须提供 `agent-cli token add` 以创建 profile。命令必须接受标志：`--name`、`--platform`、`--token`、`--base-url`，以及可选的 `--claude-base-url`。

`platform` 必须是 `aliyun`、`tencent`、`deepseek` 或 `kimi`。命令必须拒绝未知平台、空的 `name`/`token`，以及已存在的 `name`。成功时写入 profile 并以退出码 0 结束。

平台 `aliyun` 或 `tencent`：`--base-url` 必须非空；未提供非空 `--claude-base-url` 时必须省略 `claudeBaseUrl`。

平台 `deepseek`：`--base-url` 与 `--claude-base-url` 均可省略。省略或为空时必须分别写入预设 `baseUrl` = `https://api.deepseek.com`、`claudeBaseUrl` = `https://api.deepseek.com/anthropic`。用户提供非空值时必须覆盖对应字段。DeepSeek 在使用预设时必须写入 `claudeBaseUrl`（不得因未传标志而省略该字段）。

平台 `kimi`：`--base-url` 与 `--claude-base-url` 均可省略。省略或为空时必须分别写入预设 `baseUrl` = `https://api.moonshot.cn/v1`、`claudeBaseUrl` = `https://api.moonshot.cn/anthropic`。用户提供非空值时必须覆盖对应字段。Kimi 在使用预设时必须写入 `claudeBaseUrl`（不得因未传标志而省略该字段）。国际站用户必须通过显式 URL 覆盖（例如 `https://api.moonshot.ai/v1` 与 `https://api.moonshot.ai/anthropic`）。

写入 `models` 前，系统必须用正在添加的 `baseUrl`（含 DeepSeek / Kimi 预设解析后的最终值）与 `token` 请求 `{baseUrl}/models`（`baseUrl` 去掉末尾 `/` 后加上 `/models`，请求头带 `Authorization: Bearer <token>`）。成功且得到非空列表时，必须把该列表只写入新 profile 的 `models`，不得改写其它已有 profile 的 `models`，不得读写 `model-list.json`。若请求失败、无法解析或得到空列表，必须不写入 profile。不得因同平台已有 profile 或已有 `model-list.json` 而跳过拉取或复用其列表。

必填字段：`name`、`platform`、`token`；对 `aliyun`/`tencent` 另加 `base-url`。若上述必填均已提供，系统不得进入问答，行为与仅用标志添加相同。若任一必填缺失：当 stdin 是交互式终端时，系统必须只询问缺失的必填字段；对 `aliyun`/`tencent`，在未通过标志提供 `--claude-base-url` 时询问可选的 Claude 兼容地址（空回答必须省略 `claudeBaseUrl`）；对 `deepseek` 或 `kimi`，可询问可选的 base-url 与 Claude 兼容地址（空回答必须使用对应预设），亦可不询问而直接使用预设。当 stdin 不是交互式终端时，系统必须拒绝缺少的必填标志，向 stderr 输出错误，并以非 0 退出码结束，且不得等待输入。问答中已用标志提供的字段不得再询问。交互选择平台时，必须提供 `aliyun`、`tencent`、`deepseek`、`kimi` 选项。

#### Scenario: 添加成功

- **WHEN** 用户执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1 --claude-base-url https://example.anthropic`，且 `GET https://example.openai/v1/models` 返回非空模型列表
- **THEN** 系统保存名为 `work` 的 profile（含上述字段以及该接口返回的全部模型）并以退出码 0 结束

#### Scenario: 拒绝重名

- **WHEN** 已存在名为 `work` 的 profile，用户再次用 `--name work` 添加
- **THEN** 系统不覆盖已有 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知平台

- **WHEN** 用户用 `--platform aws` 添加 profile
- **THEN** 系统不写入 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 全标志时不进入问答

- **WHEN** 用户在交互式终端执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1`（未给 `--claude-base-url`），且对该 `baseUrl` 的 `/models` 返回非空列表
- **THEN** 系统不提示输入，保存该 profile 且不含 `claudeBaseUrl`，并以退出码 0 结束

#### Scenario: 无标志时交互补齐

- **WHEN** 用户在交互式终端执行 `agent-cli token add`（无标志），并依次提供有效的 name、platform、token、base-url，以及空的 Claude 兼容地址，且对所给 `baseUrl` 的 `/models` 返回非空列表
- **THEN** 系统保存该 profile（不含 `claudeBaseUrl`，含该接口返回的全部模型），并以退出码 0 结束

#### Scenario: 只询问缺失字段

- **WHEN** 用户在交互式终端执行 `agent-cli token add --name work --platform aliyun`，并在提示中提供有效的 token 与 base-url，且对该 `baseUrl` 的 `/models` 返回非空列表
- **THEN** 系统不再询问 name 或 platform，保存名为 `work` 的 `aliyun` profile，并以退出码 0 结束

#### Scenario: 非交互缺少必填标志

- **WHEN** stdin 不是交互式终端，用户执行 `agent-cli token add` 且缺少任一必填标志
- **THEN** 系统不写入 profile，不等待输入，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 添加时 models 失败则不写入

- **WHEN** 用户执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1`，且对该 `baseUrl` 的 `/models` 请求失败
- **THEN** 系统不写入 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 添加时优先使用 baseUrl 的 models

- **WHEN** 用户执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1`，且 `GET https://example.openai/v1/models` 返回非空模型列表
- **THEN** 系统保存 profile，且 `models` 与该接口列表一致，不以 `model-list.json` 或其它 profile 的列表为准

#### Scenario: 添加腾讯云时使用 baseUrl 的 models

- **WHEN** 用户执行 `agent-cli token add --name work --platform tencent --token SECRET --base-url https://example.openai/v1`，且 `GET https://example.openai/v1/models` 返回非空模型列表
- **THEN** 系统保存 profile，且 `models` 与该接口列表一致，并以退出码 0 结束

#### Scenario: 添加腾讯云时 models 失败则不写入

- **WHEN** 用户执行 `agent-cli token add --name work --platform tencent --token SECRET --base-url https://example.openai/v1`，且对该 `baseUrl` 的 `/models` 请求失败
- **THEN** 系统不写入 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 添加 DeepSeek 省略 URL 时使用预设

- **WHEN** 用户执行 `agent-cli token add --name ds --platform deepseek --token SECRET`（未给 `--base-url` 与 `--claude-base-url`），且 `GET https://api.deepseek.com/models` 返回非空模型列表
- **THEN** 系统保存名为 `ds` 的 `deepseek` profile，`baseUrl` 为 `https://api.deepseek.com`，`claudeBaseUrl` 为 `https://api.deepseek.com/anthropic`，`models` 与该接口列表一致，并以退出码 0 结束

#### Scenario: 添加 DeepSeek 时显式 URL 覆盖预设

- **WHEN** 用户执行 `agent-cli token add --name ds --platform deepseek --token SECRET --base-url https://custom.example/v1 --claude-base-url https://custom.example/anthropic`，且 `GET https://custom.example/v1/models` 返回非空模型列表
- **THEN** 系统保存 profile，`baseUrl` 与 `claudeBaseUrl` 分别为用户所给值（不以官方预设覆盖），并以退出码 0 结束

#### Scenario: 添加 DeepSeek 时 models 失败则不写入

- **WHEN** 用户执行 `agent-cli token add --name ds --platform deepseek --token SECRET`，且对预设 `https://api.deepseek.com/models` 请求失败
- **THEN** 系统不写入 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 添加 Kimi 省略 URL 时使用预设

- **WHEN** 用户执行 `agent-cli token add --name km --platform kimi --token SECRET`（未给 `--base-url` 与 `--claude-base-url`），且 `GET https://api.moonshot.cn/v1/models` 返回非空模型列表
- **THEN** 系统保存名为 `km` 的 `kimi` profile，`baseUrl` 为 `https://api.moonshot.cn/v1`，`claudeBaseUrl` 为 `https://api.moonshot.cn/anthropic`，`models` 与该接口列表一致，并以退出码 0 结束

#### Scenario: 添加 Kimi 时显式 URL 覆盖预设

- **WHEN** 用户执行 `agent-cli token add --name km --platform kimi --token SECRET --base-url https://api.moonshot.ai/v1 --claude-base-url https://api.moonshot.ai/anthropic`，且 `GET https://api.moonshot.ai/v1/models` 返回非空模型列表
- **THEN** 系统保存 profile，`baseUrl` 与 `claudeBaseUrl` 分别为用户所给值（不以中国站预设覆盖），并以退出码 0 结束

#### Scenario: 添加 Kimi 时 models 失败则不写入

- **WHEN** 用户执行 `agent-cli token add --name km --platform kimi --token SECRET`，且对预设 `https://api.moonshot.cn/v1/models` 请求失败
- **THEN** 系统不写入 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 已有非空目录时不覆盖

- **WHEN** `model-list.json` 的 `aliyun` 已有非空列表，用户添加一套 `aliyun` profile，且对该 profile 的 `{baseUrl}/models` 返回与目录不同的非空列表
- **THEN** 系统不读取、不改写 `model-list.json`，把接口列表写入新 profile 的 `models`

#### Scenario: 已有同平台 profile 时仍独立拉取

- **WHEN** 已存在一套 `aliyun` profile `home`（含非空 `models`），用户再添加另一套 `aliyun` profile `work`，且 `work` 的 `{baseUrl}/models` 返回与 `home` 不同的非空列表
- **THEN** 系统保存 `work` 且其 `models` 与 `work` 的接口列表一致，且不改写 `home` 的 `models`

### Requirement: 同步 profile 模型列表

系统必须提供 `agent-cli token sync-model-list`，按目标 profile 刷新各自保存在 `token-profile.json` 中的 `models`。

命令必须接受可选标志 `--name <profile>` 与可选标志 `--platform <aliyun|tencent|deepseek|kimi>`。不得接受额外位置参数；若传入多余参数，必须向 stderr 输出错误并以非 0 退出码结束。

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

#### Scenario: 按 deepseek 平台过滤同步

- **WHEN** 已存在 `deepseek` profile `ds` 与 `aliyun` profile `work`，用户执行 `agent-cli token sync-model-list --platform deepseek`，且 `ds` 的 `{baseUrl}/models` 返回非空列表
- **THEN** 系统只更新 `ds` 的 `models`，不改写 `work`，并以退出码 0 结束

#### Scenario: 按 kimi 平台过滤同步

- **WHEN** 已存在 `kimi` profile `km` 与 `aliyun` profile `work`，用户执行 `agent-cli token sync-model-list --platform kimi`，且 `km` 的 `{baseUrl}/models` 返回非空列表
- **THEN** 系统只更新 `km` 的 `models`，不改写 `work`，并以退出码 0 结束

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

### Requirement: 查询套餐余量

系统必须提供 `agent-cli token usage`，查询云平台套餐余量或账户余额信息。

命令必须接受可选标志 `--platform <aliyun|tencent|deepseek|kimi>`，以及可选标志 `--name <profile>`。省略 `--platform` 时必须默认为 `aliyun`。不得接受额外位置参数；若传入多余参数，必须向 stderr 输出错误并以非 0 退出码结束。

平台支持范围：

- `aliyun`：必须查询阿里云百炼 Token Plan 订阅级余量（不绑定某个 `token-profile.json` 中的 profile，也不使用 profile 里的 API Key 作为该查询的凭据）。不得接受 `--name`；若传入 `--name`，必须拒绝、不发起查询，并以非 0 退出码结束。
- `deepseek`：必须查询 DeepSeek 账户余额（官方 `GET /user/balance` 语义）。必须使用已保存的 deepseek profile 的 `token` 作为 Bearer 凭据；不得使用平台控制台 session / cookie。不得调用 `bl`。
- `kimi`：必须查询 Kimi（Moonshot）账户余额（官方 `GET /v1/users/me/balance` 语义，路径相对 profile 的 OpenAI 兼容 `baseUrl`）。必须使用已保存的 kimi profile 的 `token` 作为 Bearer 凭据；不得使用平台控制台 session / cookie。不得调用 `bl`。
- `tencent` 或其它未知平台：必须拒绝、不发起查询，向 stderr 说明该平台暂不支持余量查询，并以非 0 退出码结束。

DeepSeek 目标 profile 选择：

- 若提供 `--name`：目标为该名称的 profile。若名称不存在，或存在但其 `platform` 不是 `deepseek`，必须拒绝、不发起查询，并以非 0 退出码结束。
- 若未提供 `--name`：在已保存 profile 中筛选 `platform` 为 `deepseek` 的集合。若恰好一套，必须使用该套；若零套或多套，必须拒绝、不发起查询，向 stderr 说明需先添加 deepseek profile 或用 `--name` 指定，并以非 0 退出码结束。

Kimi 目标 profile 选择：

- 若提供 `--name`：目标为该名称的 profile。若名称不存在，或存在但其 `platform` 不是 `kimi`，必须拒绝、不发起查询，并以非 0 退出码结束。
- 若未提供 `--name`：在已保存 profile 中筛选 `platform` 为 `kimi` 的集合。若恰好一套，必须使用该套；若零套或多套，必须拒绝、不发起查询，向 stderr 说明需先添加 kimi profile 或用 `--name` 指定，并以非 0 退出码结束。

查询 DeepSeek 时，系统必须对目标 profile 的 `baseUrl`（去掉末尾 `/`）发起 `GET`，路径为该 `baseUrl` 加上 `/user/balance`，请求头带 `Authorization: Bearer <token>` 与 `Accept: application/json`。若 HTTP 失败、响应无法解析为含余额信息的对象，必须向 stderr 输出错误并以非 0 退出码结束。成功时必须以退出码 0 结束，并向 stdout 输出可读摘要，至少包含：是否可用于 API 调用（`is_available` 或等价信息），以及每个币种的总余额、赠送余额与充值余额（若响应中存在对应字段）。不得把完整 API Key 打印到 stdout。

查询 Kimi 时，系统必须对目标 profile 的 `baseUrl`（去掉末尾 `/`）发起 `GET`，路径为该 `baseUrl` 加上 `/users/me/balance`，请求头带 `Authorization: Bearer <token>` 与 `Accept: application/json`。若 HTTP 失败，或响应根对象中 `code` 存在且不等于 `0`，或 `status` 为 `false`，或缺少含余额字段的 `data` 对象，必须向 stderr 输出错误并以非 0 退出码结束。成功时必须以退出码 0 结束，并向 stdout 输出可读摘要，至少包含 `available_balance`、`voucher_balance`、`cash_balance`（若响应中存在）。不得把完整 API Key 打印到 stdout。

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

#### Scenario: Kimi 唯一 profile 时查询余额成功

- **WHEN** 已保存恰好一套 `kimi` profile `km`（`baseUrl` 为 `https://api.moonshot.cn/v1`，`token` 为 `SECRET`），用户执行 `agent-cli token usage --platform kimi`，且 `GET https://api.moonshot.cn/v1/users/me/balance` 返回 `code` 为 `0` 且 `data` 含 `available_balance`、`voucher_balance`、`cash_balance` 的成功响应
- **THEN** 系统向 stdout 输出余额摘要（含上述余额字段），不以完整 token 输出，并以退出码 0 结束

#### Scenario: Kimi 用 --name 指定 profile

- **WHEN** 已保存 `kimi` profile `km` 与 `km2`，用户执行 `agent-cli token usage --platform kimi --name km`，且对 `km` 的 `{baseUrl}/users/me/balance` 返回成功余额响应
- **THEN** 系统使用 `km` 的凭据查询并输出摘要，并以退出码 0 结束

#### Scenario: 拒绝 Kimi

- **WHEN** 已保存两套或零套 `kimi` profile，用户执行 `agent-cli token usage --platform kimi`（未给 `--name`）
- **THEN** 系统不发起查询，向 stderr 说明需先添加 kimi profile 或用 `--name` 指定，并以非 0 退出码结束

#### Scenario: Kimi --name 非 kimi 平台时拒绝

- **WHEN** 已存在 `aliyun` profile `work`，用户执行 `agent-cli token usage --platform kimi --name work`
- **THEN** 系统不发起查询，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: Kimi 余额请求失败

- **WHEN** 已保存一套 `kimi` profile `km`，用户执行 `agent-cli token usage --platform kimi`，且对该 profile 的 `{baseUrl}/users/me/balance` 请求失败或返回非成功 `code`
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

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`、`token usage`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`、`pi`。必须说明 `--model` 对 Claude Code、dsh 与 pi 有效。必须说明 `sync-model-list` 可按 `--name` 同步单个 profile，可按 `--platform` 过滤，省略 `--name` 时同步全部目标 profile，且每个目标都用该 profile 自己的 `{baseUrl}/models`。必须说明 `--platform` 对 `add` / `sync-model-list` 可取 `aliyun`、`tencent`、`deepseek`、`kimi`。必须说明 DeepSeek 与 Kimi 添加时可省略 `--base-url` / `--claude-base-url` 并使用官方预设，显式传入则覆盖。必须说明 `token usage` 可查询套餐余量或账户余额：默认 `--platform aliyun`（依赖本机 `bl` 的控制台登录）；`--platform deepseek` 与 `--platform kimi` 查询账户余额，分别使用对应平台 profile 的 API Key，可用 `--name` 指定 profile。不得再说明按平台共享 `model-list.json` 或同步腾讯云使用 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。

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

#### Scenario: 帮助列出 dsh

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `dsh`

#### Scenario: 帮助列出 pi

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `pi`

#### Scenario: 帮助列出 usage

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token usage` 可查询套餐余量或账户余额，支持阿里云百炼（默认）、DeepSeek 与 Kimi（后两者可用 `--name` 指定 profile）
