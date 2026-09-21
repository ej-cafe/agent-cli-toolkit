## Why

把 profile 应用到 pi 时，只在传入 `--model` 才会改 `settings.json` 的 `defaultProvider` / `defaultModel`。不带该标志时 pi 仍可能继续用别的 provider 启动，和刚写入的凭据不同步。

## What Changes

- **BREAKING**：只要本次 `token use` 的目标包含 `pi`，就必须写入 pi agent 目录 `settings.json` 的 `defaultProvider` 与 `defaultModel`，覆盖已有值。
- `defaultProvider` 必须为该 profile 的 `name`。
- `defaultModel`：若提供了 `--model`，必须为该 id（仍须存在于该 profile 的 `models`）；若未提供，必须为 `models` 数组第一项的 `id`。`models` 为空时必须拒绝且不写入任何工具配置。
- 未传 `--model` 时，Claude Code 与 dsh 仍不得写入模型选择；OpenCode 行为不变。
- 帮助说明上述 pi 默认：应用到 pi 即设置这两项；`--model` 覆盖，否则用列表第一项。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: `token use` 应用到 pi 时始终同步 `defaultProvider` / `defaultModel`；未传 `--model` 时用 profile 模型列表第一项，并覆盖已有启动默认。

## Impact

- 代码：`apply/pi.ts`（无 `--model` 也写 `settings.json`）；`use.ts` 解析默认模型 id；help / README / `token` 用法说明。
- 对外 CLI：`token use … --tool pi`（及 `--all` 中的 pi）在不传 `--model` 时也会改 pi 启动默认。
- 依赖：无新运行时依赖。
- 非目标：改变 Claude Code、dsh、OpenCode 的默认模型规则；不改 pi provider / auth 写入字段。
