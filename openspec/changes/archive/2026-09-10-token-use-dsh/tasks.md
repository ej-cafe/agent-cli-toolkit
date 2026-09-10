## 1. YAML 与 dsh 适配器

- [x] 1.1 在 `@agent-cli-toolkit/token-config` 添加运行时依赖 `yaml`（实现前确认），`pnpm install` 后 `package.json` 含该依赖且 lockfile 更新
- [x] 1.2 实现 `apply/dsh.ts`：`$DSH_HOME` 或 `~/.dsh`；合并写入 `settings.yaml` 的 `llm-pi-ai.providers.<name>`（`displayName`、`api: openai-completions`、`baseURL=profile.baseUrl`、`apiKeyEnv`、models upsert）与 `.credentials.yaml` 对应键；token 不进 settings；凭据 `0600`、目录 `0700`。用临时 `DSH_HOME` 确认：新建文件内容符合规格；已有其它 provider 与模型额外字段保留；`settings.yaml` 不含 token

## 2. token use

- [x] 2.1 扩展 `AgentTool` 与 `runTokenUse`：支持 `--tool dsh`、`--all` 含 dsh、交互列出 `3) dsh`；`--model` 在目标含 `claude-code` 或 `dsh` 时通过。用临时 `HOME`/`XDG_CONFIG_HOME`/`DSH_HOME` 确认：`--tool dsh` 不改 Claude/OpenCode；`--tool claude-code` 不改 dsh；`--tool opencode --model` 非 0 且不写文件；`--tool dsh --model` 写入 `agent-default-model`；`--all --model` 写 Claude 与 dsh 默认模型且不因该标志改 OpenCode 模型选择
- [x] 2.2 确认 `token delete` 仍不改 dsh 文件：删除 profile 后临时 `DSH_HOME` 中已写入的 settings/credentials 保持不变

## 3. 文档与检查

- [x] 3.1 更新 `printHelp()`、`printTokenUsage()` 与 `README.md`：`--tool` 含 `dsh`，`--model` 对 Claude Code 与 dsh 有效，`--all` 含 DeepSeek Harness。确认 `./apps/cli/dist/main.js --help`（或 build 后）出现 `dsh`
- [x] 3.2 在仓库根目录运行 typecheck 与 build，确认两者都通过
