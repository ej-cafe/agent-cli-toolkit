## MODIFIED Requirements

### Requirement: 将 profile 切换到 agent 工具

系统必须提供 `agent-cli token use [<name>]`，把已存储的 profile 应用到 agent 工具。省略 `<name>` 时，仅在交互式终端选择已保存 profile；非交互环境缺少 `<name>` 必须拒绝。

若省略 `<name>`，系统必须在交互式终端（stdin 为 TTY）提示用户从已保存的 profile 中选择一个：菜单必须列出全部已保存 profile 的名称，并接受编号或 profile 名称；选中的名称必须是已保存的 profile。若 stdin 不是 TTY，或没有任何已保存 profile，必须输出错误、以非 0 退出码结束，且不得挂起等待输入，也不得显示 profile 菜单。若给了 `<name>`，不得询问 profile。交互式流程的提示顺序必须为：profile、工具、模型。

支持的工具为 `claude-code`、`opencode`、`dsh` 和 `pi`。对每个候选工具，系统必须先确认其配置目录存在且为目录，并且对应程序在 `PATH` 上可执行，然后才允许写入。对应关系必须为：

- `claude-code`：目录 `~/.claude`，程序名 `claude`
- `opencode`：目录为配置文件所在目录（设置了 `XDG_CONFIG_HOME` 时为 `$XDG_CONFIG_HOME/opencode`，否则为 `~/.config/opencode`），程序名 `opencode`
- DeepSeek Harness（dsh）（工具 id `dsh`）：目录为 `$DSH_HOME`（未设置或为空白时为 `~/.dsh`），程序名 `dsh`
- `pi`：目录为 `$PI_CODING_AGENT_DIR`（trim 后非空则用该路径，否则为 `~/.pi/agent`），程序名 `pi`

程序是否存在必须只根据 `PATH` 查找该名称的可执行文件，不得启动该程序。目录不存在、该路径存在但不是目录、或程序不在 `PATH` 上时，必须跳过该工具：不得创建其配置目录，不得读写其配置文件。跳过必须向 stderr 用显示名说明该工具，以及缺失的是配置目录、程序，或两者。DeepSeek Harness（dsh）的显示名必须是 `DeepSeek Harness（dsh）`，不得只写 `dsh`。跳过不得单独导致非 0 退出码。

`--all` 必须把四个工具都纳入候选，再只写入通过上述检查的工具。重复传入 `--tool <id>` 时必须只考虑列出的受支持工具，再跳过未通过检查的。若既未给 `--all` 也未给 `--tool`，系统必须在终端提示用户选择一个或多个受支持工具，菜单仍列出这四个，其中 DeepSeek Harness（dsh）的条目必须显示为 `DeepSeek Harness（dsh）`（仍可用编号 `3` 或 id `dsh` 选中）；选中后未通过检查的必须跳过。未知工具 id 必须拒绝，且不得写入任何工具配置。

stdout 必须只列出实际写入的工具，并且必须使用显示名：DeepSeek Harness（dsh）写作 `DeepSeek Harness（dsh）`，不得只写 `dsh`。若全部候选都被跳过，必须不写入任何工具配置，不得声称已应用，并以退出码 0 结束。

命令必须接受可选标志 `--model <id>`。该 id 必须存在于该 profile 的 `models` 中。`--model` 的「本次目标」必须是通过存在性检查、实际会写入的工具。`--model` 用于 Claude Code、DeepSeek Harness（dsh）与 pi：当本次目标包含 `claude-code` 时，必须把该 id 作为 Claude Code 的默认模型写入；当本次目标包含 `dsh` 时，必须把该 id 作为 DeepSeek Harness（dsh）的默认模型写入；当本次目标包含 `pi` 时，必须把该 id 作为 pi 的启动默认模型写入。不得用 `--model` 修改 OpenCode 的模型列表或默认模型。若传了 `--model` 但本次目标既不含 `claude-code`、也不含 `dsh`、也不含 `pi`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。未知模型 id 必须拒绝，且不得写入任何工具配置。

未传 `--model` 时，若本次目标包含 `claude-code`、`dsh`、`pi` 之一、该 profile 的 `models` 非空、且 stdin 为 TTY，系统必须在工具选择之后提示用户从该 profile 的 `models` 中选择默认模型：菜单必须列出模型 `id`（可附 `name`），接受编号或 id，空回答表示不选择模型。选中的模型必须视同 `--model` 提供，应用于本次全部可写入模型的目标工具。未传 `--model` 时，若本次目标不含上述任一工具、或该 profile 的 `models` 为空、或 stdin 不是 TTY，不得进入模型问答，也不得显示空的模型菜单。未传 `--model` 且未进入模型问答或空回答时，不得把模型选择写入 Claude Code 或 DeepSeek Harness（dsh），也不得修改 OpenCode 的模型选择。若本次目标包含 `pi` 且未通过 `--model` 或模型问答选中模型，仍必须写入 pi 的启动默认：`defaultProvider` 为该 profile 的 `name`，`defaultModel` 为该 profile `models` 数组第一项的 `id`；若 `models` 为空或第一项没有非空 `id`，必须拒绝、不写入任何工具配置，并以非 0 退出码结束。被跳过的工具不得触发模型写入，也不得因该工具被跳过而要求模型 id。

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

#### Scenario: 交互选择 profile

- **WHEN** 已保存 profile `work` 与 `home`，OpenCode 的配置目录为目录且 `PATH` 上有 `opencode`，用户在交互式终端执行 `agent-cli token use`（省略 `<name>`），随后在 profile 提示中选择 `home`，并在工具提示中选择 OpenCode
- **THEN** 系统把 `home` 应用到 OpenCode，并以退出码 0 结束

#### Scenario: 非交互省略 name 时拒绝

- **WHEN** 存在 profile `work`，用户在非交互环境执行 `agent-cli token use`（省略 `<name>`）
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，以非 0 退出码结束，且不挂起等待输入

#### Scenario: 没有已保存 profile 时拒绝

- **WHEN** 没有任何已保存 profile，用户在交互式终端执行 `agent-cli token use`（省略 `<name>`）
- **THEN** 系统不修改任何工具配置，向 stderr 输出错误，以非 0 退出码结束，且不显示 profile 菜单

#### Scenario: 指定模型写入 Claude Code

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，`~/.claude` 为目录且 `PATH` 上有 `claude`，用户执行 `agent-cli token use work --tool claude-code --model qwen3.8-max`
- **THEN** 系统把该 profile 应用到 Claude Code，并把该模型 id 写入 Claude Code 默认模型，以退出码 0 结束

#### Scenario: 显式 --model 时不进入模型问答

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，`~/.claude` 为目录且 `PATH` 上有 `claude`，用户执行 `agent-cli token use work --tool claude-code --model qwen3.8-max`
- **THEN** 系统不显示模型菜单，并把该模型 id 写入 Claude Code 默认模型，以退出码 0 结束

#### Scenario: 交互选择默认模型写入 Claude Code

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，`~/.claude` 为目录且 `PATH` 上有 `claude`，用户执行 `agent-cli token use work --tool claude-code`（未给 `--model`），随后在模型提示中选择 `qwen3.8-max`
- **THEN** 系统把该 profile 应用到 Claude Code，并把 `qwen3.8-max` 写入 Claude Code 默认模型，以退出码 0 结束

#### Scenario: 交互选择默认模型写入 pi

- **WHEN** 存在 profile `work`，其 `models` 第一项 id 为 `qwen3.8-max` 且含 `glm-4.6`，pi agent 目录为目录且 `PATH` 上有 `pi`，用户执行 `agent-cli token use work --tool pi`（未给 `--model`），随后在模型提示中选择 `glm-4.6`
- **THEN** 系统把该 profile 应用到 pi，并把 `defaultModel` 设为 `glm-4.6`（覆盖列表第一项），以退出码 0 结束

#### Scenario: 模型问答空回答时保留 Claude 默认

- **WHEN** 存在 profile `work`，其 `models` 含 `qwen3.8-max`，`~/.claude` 为目录且 `PATH` 上有 `claude`，其 `settings.json` 已有 `ANTHROPIC_MODEL`，用户执行 `agent-cli token use work --tool claude-code`（未给 `--model`），随后在模型提示中直接回车
- **THEN** 系统把该 profile 应用到 Claude Code，并保留已有的 `ANTHROPIC_MODEL`

#### Scenario: 模型问答空回答时 pi 用列表第一项

- **WHEN** 存在 profile `work`，其 `models` 第一项 id 为 `qwen3.8-max`，pi agent 目录为目录且 `PATH` 上有 `pi`，用户执行 `agent-cli token use work --tool pi`（未给 `--model`），随后在模型提示中直接回车
- **THEN** 系统把该 profile 应用到 pi，并把 `defaultModel` 设为 `qwen3.8-max`

#### Scenario: profile 无模型时不进入模型问答

- **WHEN** 存在 profile `work`，其 `models` 为空，`~/.claude` 为目录且 `PATH` 上有 `claude`，用户执行 `agent-cli token use work --tool claude-code`（未给 `--model`）
- **THEN** 系统不显示模型菜单，把该 profile 应用到 Claude Code 并保留已有默认模型，以退出码 0 结束

#### Scenario: 非交互省略 --model 时不进入模型问答

- **WHEN** 存在 profile `work`，其 `models` 第一项 id 为 `qwen3.8-max`，pi agent 目录为目录且 `PATH` 上有 `pi`，用户在非交互环境执行 `agent-cli token use work --tool pi`（未给 `--model`）
- **THEN** 系统不显示模型菜单，把该 profile 应用到 pi 并把 `defaultModel` 设为 `qwen3.8-max`

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

### Requirement: 帮助信息列出 token 命令

`agent-cli --help` 必须说明 `token add`、`token delete`、`token list`、`token use`、`token sync-model-list`、`token usage`，并在 `use` 上说明 `--all`、`--tool` 和 `--model`。必须说明 `token add` 可省略标志、在交互式终端以问答补齐缺失字段。必须说明 `token use` 可省略 `<name>`、在交互式终端选择已保存 profile，可省略 `--model`、在交互式终端选择默认模型。必须说明 `--tool` 可指定 `claude-code`、`opencode`、`dsh`、`pi`。必须说明 `--model` 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效。必须说明把 profile 应用到 pi 时会设置 `defaultProvider`（profile 名称）与 `defaultModel`（有 `--model` 或交互选择时用该 id，否则用该 profile 模型列表第一项）。必须用显示名 DeepSeek Harness（dsh）称呼该工具，不得在帮助正文里只写 `dsh` 来指代它（`--tool` 的取值仍是 `dsh`）。必须说明配置目录或对应程序不存在的工具会被跳过，且不会因此创建该配置目录。必须说明 `sync-model-list` 可按 `--name` 同步单个 profile，可按 `--platform` 过滤，省略 `--name` 时同步全部目标 profile，且每个目标都用该 profile 自己的 `{baseUrl}/models`。必须说明 `--platform` 对 `add` / `sync-model-list` 可取 `aliyun`、`tencent`、`deepseek`、`kimi`、`glm`。必须说明 `token add` 可为 tencent 指定 `--product-type`（缺省 `personal` 个人版，`token usage` 暂不支持个人版查询，可设 `enterprise` 企业版专业套餐或 `enterprise-auto` 企业版轻享套餐）。必须说明 DeepSeek、Kimi 与 GLM 添加时可省略 `--base-url` / `--claude-base-url` 并使用官方预设，显式传入则覆盖；GLM 预设为中国站 Coding Plan。必须说明 `token usage` 按已保存 profile 分段查询套餐余量或账户余额并分别展示：aliyun 依赖本机 `bl` 的控制台登录；deepseek 与 kimi 使用各自 profile 的 token；tencent 查询 TokenHub 套餐余量、需要设置 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`（region 可用 `TENCENTCLOUD_REGION` 覆盖、默认 `ap-guangzhou`），凭据缺失时提示设置或前往 TokenHub 控制台；glm 暂不支持 API 查询、需前往控制台。成功段之间以空行分隔，失败段之间同样以空行分隔；省略 `--name` 时查询全部 profile，可用 `--name` 指定单套；必须说明 `--output` 可取 `table`、`text` 或 `raw`，省略时默认为表格。不得再说明 usage 接受或默认 `--platform`。不得再说明按平台共享 `model-list.json` 或同步腾讯云使用 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。

#### Scenario: 帮助中出现 token 命令

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出包含 token 的 add、delete、list、use、sync-model-list、usage 命令

#### Scenario: 帮助说明 add 可问答

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token add` 可省略标志并在终端问答补齐

#### Scenario: 帮助说明 use 可交互选择

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 可省略 `<name>` 并在交互式终端选择已保存 profile，且可省略 `--model` 并在交互式终端选择默认模型

#### Scenario: 帮助说明 use 的模型标志

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 的 `--model` 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效

#### Scenario: 帮助说明 pi 启动默认

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明应用到 pi 时会设置 `defaultProvider` 与 `defaultModel`；提供 `--model` 或交互选择模型时使用该 id，否则使用 profile 模型列表第一项

#### Scenario: 帮助说明缺失工具会被跳过

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token use` 在目标工具的配置目录或对应程序不存在时跳过该工具，且不创建该配置目录

#### Scenario: 帮助说明同步模型列表

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token sync-model-list` 可按 `--name` 同步单个 profile、可按 `--platform` 过滤、省略 `--name` 时同步全部目标，每个目标使用该 profile 的 `{baseUrl}/models`，且不含按平台 `model-list.json` 或 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`

#### Scenario: 帮助列出平台含 deepseek

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--platform` 可指定 `aliyun`、`tencent`、`deepseek`、`kimi`、`glm`

#### Scenario: 帮助说明 DeepSeek URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 DeepSeek 可省略 base-url / claude-base-url 并使用预设，显式传入则覆盖

#### Scenario: 帮助说明 Kimi URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 Kimi 可省略 base-url / claude-base-url 并使用中国站预设，显式传入则覆盖

#### Scenario: 帮助说明 GLM URL 预设

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 GLM 可省略 base-url / claude-base-url 并使用中国站 Coding Plan 预设，显式传入则覆盖

#### Scenario: 帮助列出 dsh

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出用显示名 DeepSeek Harness（dsh）称呼该工具，并说明 `--tool` 可指定 `dsh`

#### Scenario: 帮助列出 pi

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `--tool` 可指定 `pi`

#### Scenario: 帮助列出 usage

- **WHEN** 用户执行 `agent-cli --help`
- **THEN** 输出说明 `token usage` 按 profile 分段展示余量、段间空行，可用 `--name` 指定 profile、`--output` 取 `table`（默认）、`text` 或 `raw`，且不将 `--platform` 作为 usage 的参数说明；说明 aliyun 依赖 `bl`、deepseek 与 kimi 使用 profile token、tencent 查询需 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`（可 `TENCENTCLOUD_REGION` 覆盖 region）；并说明智谱 GLM 暂不支持 API 余额查询、需前往控制台；不得把腾讯云列为「暂不支持 API 余额查询」的平台