## 1. pi 适配器

- [x] 1.1 实现 `apply/pi.ts`：`PI_CODING_AGENT_DIR` 或 `~/.pi/agent`；合并写入 `models.json` 的 `providers.<name>`（`baseUrl=profile.baseUrl`、`api: openai-completions`、`authHeader: true`、models upsert）与 `auth.json` 的 `{ type: "api_key", key }`；token 不进 `models.json`；`auth.json` `0600`；有 `--model` 时写 `settings.json` 的 `defaultProvider` / `defaultModel`。用临时 `PI_CODING_AGENT_DIR` 确认：新建文件符合规格；已有其它 provider 与模型额外字段保留；未给 `--model` 不改已有默认、不无故创建 `settings.json`

## 2. token use

- [x] 2.1 扩展 `AgentTool` 与 `runTokenUse`：支持 `--tool pi`、`--all` 含 pi、交互列出 `4) pi`；`--model` 在目标含 `claude-code` / `dsh` / `pi` 时通过。用临时 agent 目录确认：`--tool pi` 不改 Claude/OpenCode/dsh；`--tool opencode --model` 仍非 0；`--tool pi --model` 写入默认；`--all --model` 写 Claude、dsh 与 pi 默认且不因该标志改 OpenCode 模型选择
- [x] 2.2 确认 `token delete` / `sync-model-list` 仍不改 pi 文件：操作后临时 agent 目录中已写入的 models/auth 保持不变

## 3. 文档与检查

- [x] 3.1 更新 `printHelp()`、`printTokenUsage()` 与 `README.md`：`--tool` 含 `pi`，`--model` 对 Claude Code、dsh 与 pi 有效，`--all` 含 pi。确认 build 后 `agent-cli --help` 出现 `pi`
- [x] 3.2 在仓库根目录运行 `pnpm typecheck` 与 `pnpm build`，确认两者都通过
