## MODIFIED Requirements

### Requirement: 添加 token profile

系统必须提供 `agent-cli token add` 以创建 profile。命令必须接受标志：`--name`、`--platform`、`--token`、`--base-url`，以及可选的 `--claude-base-url`。

`platform` 必须是 `aliyun` 或 `tencent`。命令必须拒绝未知平台、空的 `name`/`token`/`base-url`，以及已存在的 `name`。成功时写入 profile 并以退出码 0 结束。

若四项必填标志均已提供，系统不得进入问答，行为与仅用标志添加相同。若任一必填标志缺失：当 stdin 是交互式终端时，系统必须只询问缺失的必填字段，并在未通过标志提供 `--claude-base-url` 时询问可选的 Claude 兼容地址（空回答必须省略 `claudeBaseUrl`）；当 stdin 不是交互式终端时，系统必须拒绝缺少的必填标志，向 stderr 输出错误，并以非 0 退出码结束，且不得等待输入。问答中已用标志提供的字段不得再询问。

#### Scenario: 添加成功

- **WHEN** 用户执行 `agent-cli token add --name work --platform aliyun --token SECRET --base-url https://example.openai/v1 --claude-base-url https://example.anthropic`
- **THEN** 系统保存名为 `work` 的 profile（含上述字段以及阿里云内置模型列表）并以退出码 0 结束

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
- **THEN** 系统保存该 profile（不含 `claudeBaseUrl`，含对应平台内置模型列表），并以退出码 0 结束

#### Scenario: 只询问缺失字段

- **WHEN** 用户在交互式终端执行 `agent-cli token add --name work --platform aliyun`，并在提示中提供有效的 token 与 base-url
- **THEN** 系统不再询问 name 或 platform，保存名为 `work` 的 `aliyun` profile，并以退出码 0 结束

#### Scenario: 非交互缺少必填标志

- **WHEN** stdin 不是交互式终端，用户执行 `agent-cli token add` 且缺少任一必填标志
- **THEN** 系统不写入 profile，不等待输入，向 stderr 输出错误，并以非 0 退出码结束

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`，并在 `use` 上说明 `--all` 和 `--tool`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐
