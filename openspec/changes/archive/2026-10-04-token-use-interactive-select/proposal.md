## Why

`agent-cli token use` 目前把 `<name>` 作为必填位置参数，且在省略 `--model` 时只能隐式采用各工具的旧值或 `models` 第一项，用户必须自己记 profile 名称和模型 id。既然 `token use` 已经在交互式终端里问答选择工具，就应在同一流程里补齐 profile 与默认模型的选择，减少拼长命令和猜 id。

## What Changes

- 省略 `<name>` 且在交互式终端（stdin 为 TTY）时，`token use` 列出已保存 profile 供选择（接受编号或名称）；非 TTY 或没有已保存 profile 时仍报错，不挂起等待输入。
- 未给 `--model`、本次实际写入的工具包含 `claude-code` / `dsh` / `pi` 之一、且 stdin 为 TTY 时，`token use` 列出该 profile 的 `models` 供选择（接受编号或 id）；空回答跳过，保持现有行为。一次选择应用于本次所有可写入模型的目标工具。
- profile 没有模型时跳过模型问答，不显示空菜单。
- 提示顺序为：profile → 工具 → 模型。
- 显式 `--model` 不进入模型问答；非 TTY 不进入任何新问答；`pi` 在跳过模型选择时仍回退到 `models[0].id`，`claude-code` / `dsh` 仍保留已有模型值。
- 帮助与中文 README 说明 `use` 可省略 `<name>` 与 `--model` 以在交互式终端选择；标志用法与非交互缺参路径保持不变。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `token-config`: 扩展「将 profile 切换到 agent 工具」：支持在交互式终端选择 profile 名称与默认模型；帮助需同步说明。

## Impact

- 代码：`packages/token-config` 的 `token use`（`src/commands/use.ts`，复用 `src/commands/add.ts` 的 `node:readline/promises` 问答模式）、`src/commands/token.ts` 的用法与提示文案。
- CLI：`agent-cli token use` 在 TTY 上省略 `<name>` 或 `--model` 时从「立即报错 / 静默回退」变为问答选择；标志路径与非 TTY 路径不破坏现有脚本。
- 文档：根 `README.md` 的中文 `token use` 说明。
- 依赖：不新增运行时依赖（继续用 `node:readline`，不用 Inquirer）。
- 存储与各工具的写入逻辑不变。