# token-config Specification

## Purpose

维护阿里云与腾讯云的命名 token profile，并按选择把当前套写入 Claude Code 与 OpenCode 的本地配置。

## Requirements

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

支持的工具为 `claude-code`、`opencode`、`dsh` 和 `pi`。对每个候选工具，系统必须先确认其配置目录存在且为目录，并且对应程序在 `PATH` 上可执行，然后才允许写入。对应关系必须为：

- `claude-code`：目录 `~/.claude`，程序名 `claude`
- `opencode`：目录为配置文件所在目录（设置了 `XDG_CONFIG_HOME` 时为 `$XDG_CONFIG_HOME/opencode`，否则为 `~/.config/opencode`），程序名 `opencode`
- DeepSeek Harness（dsh）（工具 id `dsh`）：目录为 `$DSH_HOME`（未设置或为空白时为 `~/.dsh`），程序名 `dsh`
- `pi`：目录为 `$PI_CODING_AGENT_DIR`（trim 后非空则用该路径，否则为 `~/.pi/agent`），程序名 `pi`

程序是否存在必须只根据 `PATH` 查找该名称的可执行文件，不得启动该程序。目录不存在、该路径存在但不是目录、或程序不在 `PATH` 上时，必须跳过该工具：不得创建其配置目录，不得读写其配置文件。跳过必须向 stderr 用显示名说明该工具，以及缺失的是配置目录、程序，或两者。DeepSeek Harness（dsh）的显示名必须是 `DeepSeek Harness（dsh）`，不得只写 `dsh`。跳过不得单独导致非 0 退出码。

`--all` 必须把四个工具都纳入候选，再只写入通过上述检查的工具。重复传入 `--tool <id>` 时必须只考虑列出的受支持工具，再跳过未通过检查的。若既未给 `--all` 也未给 `--tool`，系统必须在终端提示用户选择一个或多个受支持工具，菜单仍列出这四个，其中 DeepSeek Harness（dsh）的条目必须显示为 `DeepSeek Harness（dsh）`（仍可用编号 `3` 或 id `dsh` 选中）；选中后未通过检查的必须跳过。未知工具 id 必须拒绝，且不得写入任何工具配置。

stdout 必须只列出实际写入的工具，并且必须使用显示名：DeepSeek Harness（dsh）写作 `DeepSeek Harness（dsh）`，不得只写 `dsh`。若全部候选都被跳过，必须不写入任何工具配置，不得声称已应用，并以退出码 0 结束。

命令必须接受可选标志 `--model <id>`。该 id 必须存在于该 profile 的 `models` 中。`--model` 的「本次目标」必须是通过存在性检查、实际会写入的工具。`--model` 用于 Claude Code、DeepSeek Harness（dsh）与 pi：当本次目标包含 `claude-code` 时，必须把该 id 作为 Claude Code 的默认模型写入；当本次目标包含 `dsh` 时，必须把该 id 作为 DeepSeek Harness（dsh）的默认模型写入；当本次目标包含 `pi` 时，必须把该 id 作为 pi 的启动默认模型写入。不得用 `--model` 修改 OpenCode 的模型列表或默认模型。若传了 `--model` 但本次目标既不含 `claude-code`、也不含 `dsh`、也不含 `pi`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。未知模型 id 必须拒绝，且不得写入任何工具配置。未传 `--model` 时，不得把模型选择写入 Claude Code 或 DeepSeek Harness（dsh），也不得修改 OpenCode 的模型选择。若本次目标包含 `pi`，仍必须写入 pi 的启动默认：`defaultProvider` 为该 profile 的 `name`，`defaultModel` 为该 profile `models` 数组第一项的 `id`；若 `models` 为空或第一项没有非空 `id`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。被跳过的工具不得触发模型写入，也不得因该工具被跳过而要求模型 id。

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

#### Scenario: 应用到 pi 且未给 --model 时写入启动默认

- **WHEN** 存在 profile `work`，其 `models` 第一项 id 为 `qwen3.8-max`，pi agent 目录为目录且 `PATH` 上有 `pi`，用户执行 `agent-cli token use work --tool pi`（未给 `--model`），且 pi 的 `settings.json` 已有其它 `defaultProvider` 与 `defaultModel`
- **THEN** 系统把该 profile 应用到 pi，把 `defaultProvider` 设为 `work`、`defaultModel` 设为 `qwen3.8-max`（覆盖原值），且不修改 Claude Code、OpenCode 或 DeepSeek Harness（dsh）的模型选择

#### Scenario: pi 且 models 为空时拒绝

- **WHEN** 存在 profile `work`，其 `models` 为空，pi agent 目录为目录且 `PATH` 上有 `pi`，用户执行 `agent-cli token use work --tool pi`（未给 `--model`）
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，并以非 0 退出码结束

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

只要本次 `token use` 的目标含 `pi`，还必须更新同一 agent 目录下的 `settings.json`：把 `defaultProvider` 设为该 profile 的 `name`。若提供了 `--model`，必须把 `defaultModel` 设为该模型 id；若未提供，必须把 `defaultModel` 设为该 profile `models` 数组第一项的 `id`。二者都必须覆盖已有值。必须保留 `settings.json` 的其它字段；若文件不存在则创建。若 `models` 为空或第一项没有非空 `id`，且未提供 `--model`，必须拒绝、不得改写任一文件，并以非 0 退出码结束。若 `settings.json` 已存在且根节点不是 JSON 对象，必须拒绝、不得改写任一文件，并以非 0 退出码结束。

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

- **WHEN** pi agent 目录为目录且 `PATH` 上有 `pi`，profile `work` 的 `models` 第一项 id 为 `qwen3.8-max`、其后还有其它模型，且 `settings.json` 已有不同的 `defaultProvider` 与 `defaultModel`，用户未带 `--model` 将该 profile 应用到 pi
- **THEN** 系统更新该 profile 对应 provider 与凭据，并把 `defaultProvider` 设为 `work`、`defaultModel` 设为 `qwen3.8-max`（覆盖原值），保留 `settings.json` 的其它字段

#### Scenario: 文件不存在时创建

- **WHEN** pi agent 目录为目录且 `PATH` 上有 `pi`，但目录下 `models.json` 与 `auth.json` 均不存在，且 pi 是本次应用目标，且未给 `--model`，且该 profile `models` 第一项有非空 `id`
- **THEN** 系统创建 `models.json` 与 `auth.json` 并写入该 profile 的 provider 与凭据，并创建 `settings.json`，其中 `defaultProvider` 为该 profile 名称、`defaultModel` 为 `models` 第一项的 `id`

#### Scenario: 配置目录不存在时不创建

- **WHEN** pi agent 目录不存在，且 pi 是本次候选目标
- **THEN** 系统不创建该目录及其父目录，不创建 `models.json`、`auth.json` 或 `settings.json`

#### Scenario: 使用 PI_CODING_AGENT_DIR

- **WHEN** 环境变量 `PI_CODING_AGENT_DIR` 指向一个已存在的目录，且 `PATH` 上有 `pi`，用户将 profile 应用到 pi
- **THEN** 系统读写该目录下的 `models.json`、`auth.json` 与 `settings.json`，不写默认的 `~/.pi/agent/`

### Requirement: 列出 token profile

系统必须提供 `agent-cli token list`，按名称排序列出已存储的全部 profile。对每一套，输出必须包含：`name`、`platform`、`baseUrl`、脱敏后的 `token`、`models` 数量。若该套存在 `claudeBaseUrl`，也必须列出。token 必须脱敏，不得输出完整 token。

若没有任何 profile，必须向 stdout 提示「暂无 profile」，并以退出码 0 结束。`token list` 不得接受额外位置参数；若传入多余参数，必须向 stderr 输出错误并以非 0 退出码结束。该命令不得修改 `token-profile.json` 或任何 agent 工具配置。

#### Scenario: 列出已有 profile

- **WHEN** 已保存名为 `work` 的 `aliyun` profile（含 `baseUrl` 与 `claudeBaseUrl`），用户执行 `agent-cli token list`
- **THEN** 输出包含该 `name`、`platform`、`baseUrl`、`claudeBaseUrl` 以及模型数量，且不包含完整 token

#### Scenario: 没有 profile

- **WHEN** 尚未保存任何 profile，用户执行 `agent-cli token list`
- **THEN** 系统向 stdout 提示暂无 profile，并以退出码 0 结束

#### Scenario: 拒绝多余参数

- **WHEN** 用户执行 `agent-cli token list extra`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 查询套餐余量

系统必须提供 `agent-cli token usage`，按 **token profile** 查询云平台套餐余量或账户余额，并分别展示。

命令必须接受可选标志 `--name <profile>`，以及可选标志 `--output <table|text|raw>`。省略 `--output` 时必须视为 `table`。**不得**接受 `--platform`；若传入 `--platform`（无论取值），必须拒绝、不发起查询，向 stderr 说明 usage 已取消该标志，并以非 0 退出码结束。`--output` 的取值若不是 `table`、`text` 或 `raw`，必须拒绝、不发起查询，并以非 0 退出码结束。不得接受额外位置参数；若传入多余参数，必须向 stderr 输出错误并以非 0 退出码结束。

目标 profile 选择：

- 若提供 `--name`：目标为该名称的一套 profile。若名称不存在，必须拒绝、不发起查询，并以非 0 退出码结束。
- 若未提供 `--name`：目标为已保存的全部 profile，按名称排序逐套查询。若尚无任何 profile，必须向 stdout 提示暂无 profile，并以退出码 0 结束（不发起查询）。

对每个目标 profile，系统必须按其 `platform` 查询。成功结果按 profile 分段写入 stdout：每段以一行开头，必须能区分该 profile 的名称与 `platform`；段内是该套的余量或余额。相邻两个成功段之间必须恰好有一个空行。仅一段时不得在段后多加空行。各套独立成败（尽力而为）：某套失败时向 stderr 输出带该 profile 名称的错误，并继续后续目标；若至少一个目标查询成功，必须以退出码 0 结束；若有目标但全部失败，必须以非 0 退出码结束。

`--output table`（含省略该标志）时，段内必须是命令行表格：一行表头、其后为数据行，列按空格对齐，不得使用 Markdown 表格。缺字段的单元格必须为 `-`。列按平台固定：

- `aliyun`：`窗口`、`已用`、`重置时间`（有用量窗口时每窗口一行；已用为百分比文本）。
- `deepseek`：`币种`、`总额`、`赠送`、`充值`（`balance_infos` 中每个币种一行）。同一段必须另外写出是否可用于 API 调用（`is_available` 或等价信息，若响应中存在）。
- `kimi`：`项目`、`金额`。数据行至少覆盖响应中存在的 `available_balance`（可用余额）、`voucher_balance`（代金券）、`cash_balance`（现金）。

`--output text` 时，段内必须是可读文本行（标签与取值），信息不少于上表对应字段，但不得排成表格。

`--output raw` 时，段内必须是该次查询成功得到的原始响应对象的 JSON 文本（缩进可读）：`aliyun` 为 `bl` 返回的根对象；`deepseek` 为 `GET …/user/balance` 响应根对象；`kimi` 为 `GET …/users/me/balance` 响应根对象（含 `code` / `data` 等，不得只输出已拆出的 `data`）。不得再套一层自定义 envelope。

`table`、`text`、`raw` 都不得打印完整 API Key、控制台 access token 或 cookie（响应体本身若不含这些字段则无需改写）。

按平台的查询语义：

- `deepseek`：必须使用该 profile 的 `token` 作为 Bearer，对 `baseUrl`（去掉末尾 `/`）发起 `GET`，路径为该 `baseUrl` 加上 `/user/balance`，请求头带 `Authorization: Bearer <token>` 与 `Accept: application/json`。成功摘要至少包含是否可用于 API 调用以及各币种余额字段（若响应中存在）。不得打印完整 API Key。不得调用 `bl`。
- `kimi`：必须使用该 profile 的 `token` 作为 Bearer，对 `baseUrl`（去掉末尾 `/`）发起 `GET`，路径为该 `baseUrl` 加上 `/users/me/balance`。若 HTTP 失败，或响应根对象中 `code` 存在且不等于 `0`，或 `status` 为 `false`，或缺少含余额字段的 `data`，计为该套失败。成功摘要至少包含 `available_balance`、`voucher_balance`、`cash_balance`（若存在）。不得打印完整 API Key。不得调用 `bl`。
- `aliyun`：必须通过本机 PATH 上的 `bl` 执行 `bl usage token-plan --output json`（或等价 JSON 调用）。必须要求已完成控制台鉴权（`bl auth login --console`）；不得用该 profile 的百炼 API Key 冒充该查询凭据。成功时向 stdout 输出挂在该 profile 名下的余量摘要（含用量窗口与重置时间，若存在）。同一轮命令中若多个目标为 `aliyun`，`bl` 至多调用一次，各 aliyun profile 分别展示同一份摘要。`bl` 不可执行、无控制台登录态、或其它非 0 / JSON 无法解析时，计为该套（及复用同一失败的其余 aliyun 目标）失败，并向 stderr 说明（缺 `bl` 时说明需安装 bailian-cli；无登录态时转述需 `bl auth login --console`）。
- `tencent`：必须将该套计为失败，向 stderr 说明该平台暂不支持余量查询，不发起外部请求。

该命令不得修改 `token-profile.json` 或任何 agent 工具配置。

#### Scenario: 默认查询阿里云成功

- **WHEN** 已保存恰好一套 `aliyun` profile `work`，本机 PATH 有可用的 `bl` 且已完成 `bl auth login --console`，用户执行 `agent-cli token usage`（未给 `--name`，也未给 `--output`）
- **THEN** 系统对该 profile 查询阿里云百炼 Token Plan 余量，向 stdout 输出以 `work` 与 `aliyun` 开头的一段表格（表头含 `窗口`、`已用`、`重置时间`），并以退出码 0 结束

#### Scenario: 显式指定 aliyun

- **WHEN** 已保存 `aliyun` profile `work` 与其它平台 profile，本机 `bl` 可用且已控制台登录，用户执行 `agent-cli token usage --name work`
- **THEN** 系统只查询 `work`，向 stdout 输出其阿里云余量表格，并以退出码 0 结束

#### Scenario: 阿里云拒绝 --name

- **WHEN** 用户执行 `agent-cli token usage --platform aliyun`（或任意带 `--platform` 的 usage 调用）
- **THEN** 系统不发起查询，向 stderr 说明已取消 `--platform`，并以非 0 退出码结束

#### Scenario: 拒绝腾讯云

- **WHEN** 已保存 `tencent` profile `tx`，用户执行 `agent-cli token usage --name tx`
- **THEN** 系统不发起外部查询，向 stderr 说明暂不支持，并以非 0 退出码结束

#### Scenario: DeepSeek 唯一 profile 时查询余额成功

- **WHEN** 已保存恰好一套 `deepseek` profile `ds`（`baseUrl` 为 `https://api.deepseek.com`，`token` 为 `SECRET`），用户执行 `agent-cli token usage`（或 `--name ds`），且 `GET https://api.deepseek.com/user/balance` 返回含 `is_available` 与非空 `balance_infos` 的成功响应
- **THEN** 系统向 stdout 输出以 `ds` 与 `deepseek` 开头的一段，其中含可用状态，以及表头为 `币种`、`总额`、`赠送`、`充值` 的表格；不以完整 token 输出，并以退出码 0 结束

#### Scenario: DeepSeek 用 --name 指定 profile

- **WHEN** 已保存 `deepseek` profile `ds` 与 `ds2`，用户执行 `agent-cli token usage --name ds`，且对 `ds` 的 `{baseUrl}/user/balance` 返回成功余额响应
- **THEN** 系统只使用 `ds` 的凭据查询并输出摘要，不以 `ds2` 发起请求，并以退出码 0 结束

#### Scenario: 拒绝 DeepSeek

- **WHEN** 已保存两套 `deepseek` profile `ds` 与 `ds2`，用户执行 `agent-cli token usage`（未给 `--name`），且两者余额请求均失败
- **THEN** 系统向 stderr 分别输出两套失败原因，并以非 0 退出码结束

#### Scenario: DeepSeek --name 非 deepseek 平台时拒绝

- **WHEN** 已存在 `aliyun` profile `work`，用户执行 `agent-cli token usage --name missing`
- **THEN** 系统不发起查询，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: DeepSeek 余额请求失败

- **WHEN** 已保存一套 `deepseek` profile `ds`，用户执行 `agent-cli token usage --name ds`，且对该 profile 的 `{baseUrl}/user/balance` 请求失败
- **THEN** 系统向 stderr 输出带 `ds` 的错误，并以非 0 退出码结束

#### Scenario: Kimi 唯一 profile 时查询余额成功

- **WHEN** 已保存恰好一套 `kimi` profile `km`（`baseUrl` 为 `https://api.moonshot.cn/v1`，`token` 为 `SECRET`），用户执行 `agent-cli token usage`，且 `GET https://api.moonshot.cn/v1/users/me/balance` 返回 `code` 为 `0` 且 `data` 含余额字段的成功响应
- **THEN** 系统向 stdout 输出以 `km` 与 `kimi` 开头的一段表格（表头含 `项目`、`金额`，且含可用余额、代金券、现金），不以完整 token 输出，并以退出码 0 结束

#### Scenario: Kimi 用 --name 指定 profile

- **WHEN** 已保存 `kimi` profile `km` 与 `km2`，用户执行 `agent-cli token usage --name km`，且对 `km` 的 `{baseUrl}/users/me/balance` 返回成功余额响应
- **THEN** 系统只使用 `km` 查询并输出摘要，并以退出码 0 结束

#### Scenario: 拒绝 Kimi

- **WHEN** 已保存两套 `kimi` profile，用户执行 `agent-cli token usage`（未给 `--name`），且两者余额请求均失败
- **THEN** 系统向 stderr 分别输出失败原因，并以非 0 退出码结束

#### Scenario: Kimi --name 非 kimi 平台时拒绝

- **WHEN** 已存在 `kimi` profile `km` 与 `deepseek` profile `ds`，用户执行 `agent-cli token usage`（未给 `--name`），且两者余额请求均成功
- **THEN** 系统按名称排序向 stdout 输出两段表格，两段之间恰好一个空行，并以退出码 0 结束

#### Scenario: Kimi 余额请求失败

- **WHEN** 已保存一套 `kimi` profile `km`，用户执行 `agent-cli token usage --name km`，且余额请求失败或返回非成功 `code`
- **THEN** 系统向 stderr 输出带 `km` 的错误，并以非 0 退出码结束

#### Scenario: 拒绝未知平台

- **WHEN** 用户执行 `agent-cli token usage --platform aws`
- **THEN** 系统不发起查询，向 stderr 说明已取消 `--platform`，并以非 0 退出码结束

#### Scenario: 缺少 bl

- **WHEN** PATH 中没有可执行的 `bl`，已保存一套 `aliyun` profile `work` 且无其它可成功查询的 profile，用户执行 `agent-cli token usage`
- **THEN** 系统向 stderr 说明需安装 bailian-cli，并以非 0 退出码结束

#### Scenario: 未控制台登录

- **WHEN** 本机有 `bl` 但未完成控制台登录，已保存一套 `aliyun` profile 且无其它可成功查询的 profile，用户执行 `agent-cli token usage`
- **THEN** 系统向 stderr 提示执行 `bl auth login --console`，并以非 0 退出码结束

#### Scenario: 拒绝多余参数

- **WHEN** 用户执行 `agent-cli token usage extra`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 文本输出

- **WHEN** 已保存恰好一套 `deepseek` profile `ds`，用户执行 `agent-cli token usage --output text`，且余额请求成功
- **THEN** 系统向 stdout 输出以 `ds` 开头的文本摘要（含可用状态与币种余额，且不是表格），并以退出码 0 结束

#### Scenario: 显式表格输出

- **WHEN** 条件与「默认查询阿里云成功」相同，用户执行 `agent-cli token usage --output table`
- **THEN** stdout 与省略 `--output` 时一样是阿里云余量表格，并以退出码 0 结束

#### Scenario: 原始输出

- **WHEN** 已保存恰好一套 `deepseek` profile `ds`，用户执行 `agent-cli token usage --output raw`，且 `GET …/user/balance` 返回含 `is_available` 与 `balance_infos` 的成功响应
- **THEN** 系统向 stdout 输出以 `ds` 与 `deepseek` 开头的一段，段内为该响应根对象的 JSON，并以退出码 0 结束

#### Scenario: 拒绝未知 output

- **WHEN** 用户执行 `agent-cli token usage --output csv`
- **THEN** 系统不发起查询，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 查询不改配置

- **WHEN** 用户执行 `agent-cli token usage`（无论成功或失败）
- **THEN** 系统不修改 `token-profile.json` 或任何 agent 工具配置

#### Scenario: 多 profile 部分失败仍成功

- **WHEN** 已保存 `aliyun` profile `work`（`bl` 不可用）与 `deepseek` profile `ds`（余额请求成功），用户执行 `agent-cli token usage`
- **THEN** 系统向 stderr 输出 `work` 的失败原因，向 stdout 输出 `ds` 的摘要，并以退出码 0 结束

#### Scenario: 暂无 profile

- **WHEN** 尚未保存任何 profile，用户执行 `agent-cli token usage`
- **THEN** 系统向 stdout 提示暂无 profile，并以退出码 0 结束

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`、`token usage`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`、`pi`。必须说明 `--model` 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效。必须说明把 profile 应用到 pi 时会设置 `defaultProvider`（profile 名称）与 `defaultModel`（有 `--model` 时用该 id，否则用该 profile 模型列表第一项）。必须用显示名 DeepSeek Harness（dsh）称呼该工具，不得在帮助正文里只写 `dsh` 来指代它（`--tool` 的取值仍是 `dsh`）。必须说明配置目录或对应程序不存在的工具会被跳过，且不会因此创建该配置目录。必须说明 `sync-model-list` 可按 `--name` 同步单个 profile，可按 `--platform` 过滤，省略 `--name` 时同步全部目标 profile，且每个目标都用该 profile 自己的 `{baseUrl}/models`。必须说明 `--platform` 对 `add` / `sync-model-list` 可取 `aliyun`、`tencent`、`deepseek`、`kimi`。必须说明 DeepSeek 与 Kimi 添加时可省略 `--base-url` / `--claude-base-url` 并使用官方预设，显式传入则覆盖。必须说明 `token usage` 按已保存 profile 分段查询套餐余量或账户余额并分别展示，成功段之间以空行分隔；省略 `--name` 时查询全部 profile，可用 `--name` 指定单套；必须说明 `--output` 可取 `table`、`text` 或 `raw`，省略时默认为表格。不得再说明 usage 接受或默认 `--platform`。不得再说明按平台共享 `model-list.json` 或同步腾讯云使用 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use、sync-model-list、usage 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效

#### Scenario: 帮助说明 pi 启动默认

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明应用到 pi 时会设置 `defaultProvider` 与 `defaultModel`；提供 `--model` 时使用该 id，否则使用 profile 模型列表第一项

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

