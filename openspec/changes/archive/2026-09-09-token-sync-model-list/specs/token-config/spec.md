## ADDED Requirements

### Requirement: 同步平台模型列表

系统必须提供 `agent-cli token sync-model-list`，按平台把模型列表写入全局配置目录下的 JSON 文件 `model-list.json`（与 `token-profile.json` 同一目录：若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/agent-cli-toolkit`，否则为 `~/.config/agent-cli-toolkit`）。

命令必须接受可选标志 `--platform <aliyun|tencent>`。传入 `--platform` 时必须只更新该平台；未传 `--platform` 时必须更新 `aliyun` 与 `tencent`。未知平台必须拒绝，且不得写入 `model-list.json` 或任何 profile。不得接受额外位置参数；若传入多余参数，必须向 stderr 输出错误并以非 0 退出码结束。

对 `aliyun`，系统必须用 CLI 内置的阿里云目录覆盖写入 `model-list.json` 的 `aliyun` 键，列表必须非空，每项含 `id` 与 `name`。

对 `tencent`，系统必须向腾讯云 TokenHub 管控面请求 `DescribeModelList`（域名 `tokenhub.tencentcloudapi.com`，公共参数 Action `DescribeModelList`、Version `2026-03-22`），按页拉取直至收齐，把返回中每条模型的 `ModelId` 作为 `id`、`DisplayName`（若空则用 `ModelName`）作为 `name` 写入 `model-list.json` 的 `tencent` 键。不得用 CLI 内置腾讯目录代替本次接口结果。列表必须非空。鉴权必须使用环境变量 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`；不得使用 profile 的 `token` 作为该接口密钥。地域必须使用 `TENCENTCLOUD_REGION`（若未设置则为 `ap-guangzhou`）。若缺少密钥、请求失败、响应无法解析或得到空列表，必须向 stderr 输出错误、以非 0 退出码结束，且不得改写 `model-list.json` 的 `tencent` 键或任何 profile。

对每个被成功更新的平台，必须同时把 `token-profile.json` 中该 `platform` 的全部 profile 的 `models` 写成同一份列表。不得修改 Claude Code 或 OpenCode 的配置文件。成功时以退出码 0 结束。系统不得把 `model-list.json` 或腾讯云密钥提交进 git 仓库。

#### Scenario: 按指定平台写入阿里云目录

- **WHEN** 用户执行 `agent-cli token sync-model-list --platform aliyun`
- **THEN** 系统把阿里云内置目录写入 `model-list.json` 的 `aliyun` 键，不改写 `tencent` 键（若已存在），并以退出码 0 结束

#### Scenario: 按指定平台请求腾讯云模型列表

- **WHEN** 已设置有效的 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`，用户执行 `agent-cli token sync-model-list --platform tencent`，且 TokenHub `DescribeModelList` 返回至少一条模型
- **THEN** 系统把接口返回的 `ModelId` 与显示名写入 `model-list.json` 的 `tencent` 键，不改写 `aliyun` 键（若已存在），并以退出码 0 结束

#### Scenario: 未指定平台时同步两者

- **WHEN** 已设置有效的腾讯云密钥，用户执行 `agent-cli token sync-model-list`
- **THEN** 系统把阿里云内置目录写入 `aliyun` 键，把 TokenHub 返回写入 `tencent` 键，并以退出码 0 结束

#### Scenario: 同步时更新该平台已有 profile

- **WHEN** 已存在 `platform` 为 `aliyun` 的 profile `work`，用户执行 `agent-cli token sync-model-list --platform aliyun`
- **THEN** `work` 的 `models` 与 `model-list.json` 中 `aliyun` 列表一致，其它平台的 profile 不变

#### Scenario: 腾讯云缺少密钥时拒绝

- **WHEN** 未设置 `TENCENTCLOUD_SECRET_ID` 或 `TENCENTCLOUD_SECRET_KEY`，用户执行 `agent-cli token sync-model-list --platform tencent`
- **THEN** 系统不修改 `model-list.json` 或任何 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 腾讯云接口失败时不写入

- **WHEN** TokenHub `DescribeModelList` 请求失败或返回空列表，用户执行 `agent-cli token sync-model-list --platform tencent`
- **THEN** 系统不修改 `model-list.json` 的 `tencent` 键或任何 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知平台

- **WHEN** 用户执行 `agent-cli token sync-model-list --platform aws`
- **THEN** 系统不修改 `model-list.json` 或任何 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝多余参数

- **WHEN** 用户执行 `agent-cli token sync-model-list extra`
- **THEN** 系统向 stderr 输出错误，并以非 0 退出码结束

## MODIFIED Requirements

### Requirement: 存储 token profile

系统必须把 token profile 持久化到全局配置目录下的 `token-profile.json`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/agent-cli-toolkit`，否则为 `~/.config/agent-cli-toolkit`）。

每个 profile 必须包含：唯一 `name`、`platform`（`aliyun` 或 `tencent`）、`token`、`baseUrl`，以及 `models`（该平台支持的模型列表，每项含 `id` 与 `name`）。profile 可以包含 `claudeBaseUrl`。写入 Claude 兼容地址时，若 `claudeBaseUrl` 存在且非空则必须使用它，否则使用 `baseUrl`。

系统必须把各平台的模型目录持久化到同一配置目录下的 `model-list.json`，按 `aliyun` 与 `tencent` 分键存储，每项含 `id` 与 `name`。profile 的 `models` 必须来自该文件中对应平台的列表。

系统不得把 `token-profile.json`、`model-list.json` 或 token 值提交进 git 仓库。

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

- **WHEN** 用户添加一套 `aliyun` 或 `tencent` profile，且 `model-list.json` 中该平台列表已存在且非空
- **THEN** 该 profile 的 `models` 包含该 JSON 中对应平台的全部模型 `id` 与 `name`

### Requirement: 添加 token profile

系统必须提供 `agent-cli token add` 以创建 profile。命令必须接受标志：`--name`、`--platform`、`--token`、`--base-url`，以及可选的 `--claude-base-url`。

`platform` 必须是 `aliyun` 或 `tencent`。命令必须拒绝未知平台、空的 `name`/`token`/`base-url`，以及已存在的 `name`。成功时写入 profile 并以退出码 0 结束。

写入 `models` 前，若 `model-list.json` 中该平台键不存在或列表为空，系统必须先按该平台执行与 `token sync-model-list --platform <platform>` 相同的目录写入，再把该列表写入 profile。若该平台列表已存在且非空，必须使用已有列表，不得覆盖 `model-list.json` 中该键。因此添加腾讯云且目录缺失时，必须先成功调用 TokenHub `DescribeModelList`；若该调用失败，必须不写入 profile。

若四项必填标志均已提供，系统不得进入问答，行为与仅用标志添加相同。若任一必填标志缺失：当 stdin 是交互式终端时，系统必须只询问缺失的必填字段，并在未通过标志提供 `--claude-base-url` 时询问可选的 Claude 兼容地址（空回答必须省略 `claudeBaseUrl`）；当 stdin 不是交互式终端时，系统必须拒绝缺少的必填标志，向 stderr 输出错误，并以非 0 退出码结束，且不得等待输入。问答中已用标志提供的字段不得再询问。

#### Scenario: 添加成功

- **WHEN** 用户执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1 --claude-base-url https://example.anthropic`
- **THEN** 系统保存名为 `work` 的 profile（含上述字段以及阿里云模型目录中的全部模型）并以退出码 0 结束

#### Scenario: 拒绝重名

- **WHEN** 已存在名为 `work` 的 profile，用户再次用 `--name work` 添加
- **THEN** 系统不覆盖已有 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 拒绝未知平台

- **WHEN** 用户用 `--platform aws` 添加 profile
- **THEN** 系统不写入 profile，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 全标志时不进入问答

- **WHEN** 用户在交互式终端执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1`（未给 `--claude-base-url`）
- **THEN** 系统不提示输入，保存该 profile 且不含 `claudeBaseUrl`，并以退出码 0 结束

#### Scenario: 无标志时交互补齐

- **WHEN** 用户在交互式终端执行 `agent-cli token add`（无标志），并依次提供有效的 name、platform、token、base-url，以及空的 Claude 兼容地址
- **THEN** 系统保存该 profile（不含 `claudeBaseUrl`，含对应平台模型目录中的全部模型），并以退出码 0 结束

#### Scenario: 只询问缺失字段

- **WHEN** 用户在交互式终端执行 `agent-cli token add --name work --platform aliyun`，并在提示中提供有效的 token 与 base-url
- **THEN** 系统不再询问 name 或 platform，保存名为 `work` 的 `aliyun` profile，并以退出码 0 结束

#### Scenario: 非交互缺少必填标志

- **WHEN** stdin 不是交互式终端，用户执行 `agent-cli token add` 且缺少任一必填标志
- **THEN** 系统不写入 profile，不等待输入，向 stderr 输出错误，并以非 0 退出码结束

#### Scenario: 模型列表不存在时自动同步

- **WHEN** `model-list.json` 不存在或其中没有非空的 `aliyun` 列表，用户执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1`
- **THEN** 系统先把阿里云内置目录写入 `model-list.json` 的 `aliyun`，再保存 profile，且 `models` 与该列表一致

#### Scenario: 腾讯云目录不存在时自动请求接口

- **WHEN** `model-list.json` 不存在或其中没有非空的 `tencent` 列表，已设置有效腾讯云密钥，用户执行 `agent-cli token add --name work --platform tencent --token SECRET --base-url https://example.openai/v1`，且 `DescribeModelList` 返回至少一条模型
- **THEN** 系统先把接口结果写入 `model-list.json` 的 `tencent`，再保存 profile，且 `models` 与该列表一致

#### Scenario: 已有非空目录时不覆盖

- **WHEN** `model-list.json` 的 `aliyun` 已有非空列表，用户添加一套 `aliyun` profile
- **THEN** 系统把该已有列表写入 profile 的 `models`，且不改写 `model-list.json` 中的 `aliyun` 键

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `--model` 仅对 Claude Code 有效。必须说明 `sync-model-list` 可按 `--platform` 更新模型目录。必须说明同步腾讯云时使用环境变量 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use、sync-model-list 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 仅对 Claude Code 有效

#### Scenario: 帮助说明同步模型列表

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token sync-model-list` 可按平台更新模型目录，并说明腾讯云使用 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`
