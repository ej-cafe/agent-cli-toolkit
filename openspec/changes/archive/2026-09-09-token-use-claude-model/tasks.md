## 1. Claude Code 模型写入

- [x] 1.1 给 `applyClaudeCode` 增加可选模型 id：有值时写 `env.ANTHROPIC_MODEL`，无值时不改该键。用临时 `HOME` 确认：无 model 时已有 `ANTHROPIC_MODEL` 保留；有 model 时该键被更新，且 `hooks` 仍在
- [x] 1.2 给 `token use` 增加 `--model`：id 必须在 profile.`models` 中，且本次目标须含 `claude-code`。用临时配置确认：`--tool claude-code --model <合法 id>` 写入 Claude Code；`--tool opencode --model …` 与未知 id 均非 0 且不写文件；`--all --model` 仍更新 OpenCode 凭据但不因该标志改 OpenCode 模型选择

## 2. 文档与检查

- [x] 2.1 更新 `printHelp()`、`printTokenUsage()` 与 `README.md`，说明 `--model` 仅对 Claude Code 有效；确认 `agent-cli --help` 仍列出 add/delete/list/use，并出现 `--model`
- [x] 2.2 在仓库根目录运行 typecheck 与 build，确认两者都通过
