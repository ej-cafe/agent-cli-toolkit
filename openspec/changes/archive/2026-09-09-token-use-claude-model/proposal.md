## Why

Claude Code 只认一个默认模型，profile 里却存了整份模型列表。`token use` 目前只写 token 和地址，无法把本次要用的模型写进 Claude Code。现在要能在 `use` 时指定模型，且只影响 Claude Code。

## What Changes

- `token use` 增加可选 `--model <id>`。id 必须属于该 profile 的 `models`；未知 id 拒绝且不写任何工具配置。
- 当本次目标包含 Claude Code 时，把该 id 写入 `~/.claude/settings.json` 的 `env.ANTHROPIC_MODEL`。未给 `--model` 时不得改动已有 `ANTHROPIC_MODEL`。
- `--model` 不得改变 OpenCode 的模型列表或默认模型。若本次目标不含 Claude Code，传 `--model` 必须失败且不写配置。
- `--help` 与 README 说明 `--model` 仅对 Claude Code 有效。

## Capabilities

### New Capabilities

- （无）扩展已有 token-config。

### Modified Capabilities

- `token-config`: 扩展「将 profile 切换到 agent 工具」「更新 Claude Code 的 env」和帮助：支持 `--model`，仅写入 Claude Code。

## Impact

- 代码：`packages/token-config` 的 `token use` 与 Claude Code 适配器。
- CLI：`agent-cli token use <name> --model <id>`。
- 依赖：无新运行时依赖。
- 文档：`--help` 与 README。
- 与进行中的 `opencode-provider-by-name` 独立，不改 OpenCode provider 键。
