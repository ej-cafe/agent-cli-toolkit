## Why

`agent-cli token add` 目前必须一次给齐全部必填标志，在终端里手工拼长命令既容易漏项，也容易把 token 留进 shell 历史。现在就要加问答填写：缺字段时在终端逐步询问，脚本化的全标志用法保持不变。

## What Changes

- `token add` 在必填字段未通过标志给齐时，于交互式终端按问答补齐：`name`、`platform`、`token`、`base-url`，以及可选的 `claude-base-url`。
- 已用标志提供的字段不再询问；四项必填标志都给齐时行为与现在相同（不进入问答）。
- 帮助与 README 说明可省略标志以启动问答；标志路径与校验规则（平台、重名、空值）保持不变。
- 非交互环境（stdin 非 TTY）且缺少必填字段时，仍立即失败，不挂起等待输入。

## Capabilities

### New Capabilities

- （无）本变更扩展已有 token profile 能力，不新增独立能力。

### Modified Capabilities

- `token-config`: 扩展「添加 token profile」：支持交互问答补齐缺失字段；帮助需提到该用法。

## Impact

- 代码：`packages/token-config` 的 `token add`（改为异步 readline，与 `token use` 同类）、`packages/commands` 的 help 文案、根 README。
- CLI：`agent-cli token add` 在 TTY 上无必填标志时从「立即报缺标志」变为问答；全标志与非 TTY 缺字段路径不破坏现有脚本。
- 依赖：不新增运行时依赖（继续用 `node:readline`，不用 Inquirer）。
- 存储与应用到 Claude Code / OpenCode 的逻辑不变。
