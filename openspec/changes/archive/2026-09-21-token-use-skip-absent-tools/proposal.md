## Why

`token use` 现在会为 Claude Code、OpenCode、DeepSeek Harness（dsh）和 pi 递归创建配置目录并写入凭据，即使用户本机没有安装对应程序、也从未有过该配置目录。未安装的工具不该被脚手架出来。

## What Changes

- **BREAKING**：把 profile 应用到 `claude-code`、`opencode`、`dsh`、`pi` 之前，必须同时确认该工具的配置目录存在，且对应可执行文件在 `PATH` 上。二者缺一则跳过该工具：不创建目录、不读写其配置文件，也不因此让整条命令失败。
- 目录与程序都存在时，目录内缺文件仍按现有规则创建并写入。只跳过「目录本身不存在」或「程序不在 `PATH` 上」的工具。
- `--all`、重复 `--tool` 与交互选择都先按上述条件过滤。显式点名一个不存在的工具同样跳过，不报错。stdout 只列出实际写入的工具；被跳过的工具向 stderr 说明原因。
- 所选工具全部被跳过时，不写入任何工具配置，以退出码 0 结束。
- `--model` 只对过滤后仍会写入的 Claude Code、DeepSeek Harness（dsh）、pi 生效。过滤后这三个都不在目标里时，沿用现有拒绝规则，且不得写入任何工具配置。
- 面向用户的名称是 DeepSeek Harness（dsh）：交互菜单、stdout、stderr 和帮助都用这个显示名，不得只写 `dsh`。`--tool` 的 id 仍是 `dsh`，可执行文件名仍是 `dsh`。
- 帮助与 README 说明：目标工具的配置目录或程序不存在时会被忽略。

假设（实现时沿用，除非评审改口）：

- 配置目录分别是 `~/.claude`、OpenCode 配置文件所在目录（`$XDG_CONFIG_HOME/opencode` 或 `~/.config/opencode`）、`$DSH_HOME`（缺省 `~/.dsh`）、`$PI_CODING_AGENT_DIR`（缺省 `~/.pi/agent`）。
- 程序名分别是 `claude`、`opencode`、`dsh`、`pi`。
- 交互菜单仍列出四个工具，DeepSeek Harness（dsh）显示为 `DeepSeek Harness（dsh）`，仍可用 `3` 或 `dsh` 选中；选中后不存在的再跳过。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`：`token use` 应用到 Claude Code、OpenCode、DeepSeek Harness（dsh）、pi 时，配置目录或对应程序不存在则跳过，不得创建该目录。面向用户的名称是 DeepSeek Harness（dsh），工具 id 仍是 `dsh`。

## Impact

- 代码：`packages/token-config` 的 `token use` 与 `apply/claude-code.ts`、`apply/opencode.ts`、`apply/dsh.ts`、`apply/pi.ts`。`writeJsonAtomic` / `writeYamlAtomic` 的递归建目录不得再替缺失的工具根目录开路。
- 对外 CLI：`token use --all` 以及点名未安装工具时，不再创建 `~/.claude`、OpenCode 配置目录、`$DSH_HOME` / `~/.dsh`、`$PI_CODING_AGENT_DIR` / `~/.pi/agent`。
- 文档：`token use` 帮助与 README 中关于写入这四个工具的说明。
- 依赖：无新运行时依赖。
- 非目标：不改 `token add` / `list` / `delete` / `sync-model-list` / `usage`；不改四个工具在目录与程序都存在时的字段写入规则；不改进行中的 `token-use-pi-defaults` 对 pi 默认模型的规则。本变更只加存在性门槛：被跳过的 pi 不写入，也不因 pi 被跳过而要求模型 id。
