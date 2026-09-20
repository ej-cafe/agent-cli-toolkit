# agent-cli-toolkit

TypeScript 命令行工具集，运行在 Node.js 上，使用 pnpm monorepo。用于构建与管理 AI 代理应用，规划支持插件扩展与多环境部署。

## 要求

- Node.js >= 20
- pnpm 12（见根目录 `packageManager`）

## 使用

```bash
pnpm install
pnpm build
pnpm exec agent-cli --help
pnpm --filter @agent-cli-toolkit/cli dev
```

对外命令：`agent-cli`。首次运行会创建 `~/.config/agent-cli-toolkit`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/agent-cli-toolkit`），全局配置统一存放于此。token profile（含各自的模型列表）保存在该目录下的 `token-profile.json`。

```bash
agent-cli token add
agent-cli token add --name <name> --platform <aliyun|tencent> --token <token> --base-url <url> [--claude-base-url <url>]
agent-cli token delete <name>
agent-cli token list
agent-cli token use <name> --all
agent-cli token use <name> --tool claude-code --model <id>
agent-cli token use <name> --tool dsh --model <id>
agent-cli token use <name> --tool pi --model <id>
agent-cli token use <name> --tool claude-code --tool opencode --tool dsh --tool pi
agent-cli token sync-model-list
agent-cli token sync-model-list --name <profile>
agent-cli token sync-model-list --platform aliyun
agent-cli token usage
agent-cli token usage --platform aliyun
```

`token add` 可省略标志，在交互式终端问答补齐缺失字段；添加时会用该套凭据请求 `{baseUrl}/models`，失败则不写入 profile。`token list` 列出已保存的 profile，token 会脱敏。`token use` 可将当前 profile 写入 Claude Code（`~/.claude/settings.json` 的 `env`）、OpenCode（`~/.config/opencode/opencode.json` 中以 profile 名称为键的 provider）、DeepSeek Harness（`$DSH_HOME/settings.yaml` 的 `llm-pi-ai.providers.<name>`，默认 `$DSH_HOME` 为 `~/.dsh`）和 pi（`$PI_CODING_AGENT_DIR` 下的 `models.json` / `auth.json`，默认 `~/.pi/agent`）。`--model` 对 Claude Code、dsh 与 pi 有效：分别写入 `env.ANTHROPIC_MODEL`、顶层 `agent-default-model`，以及 pi 的 `defaultProvider` / `defaultModel`。未指定 `--all` 或 `--tool` 时，会在命令行选择目标工具。`token sync-model-list` 按 profile 更新模型列表：可指定 `--name`，可按 `--platform` 过滤，省略 `--name` 则同步全部目标；每个目标用自己的 `{baseUrl}/models`。`token usage` 查询套餐余量（当前仅支持阿里云百炼 Token Plan，默认 `--platform aliyun`）；需本机已安装 `bl`（bailian-cli）并完成 `bl auth login --console`，查询的是订阅级余量，不读取 profile 中的 API Key。`--token` 可能出现在 shell 历史中，请谨慎使用。

## 参与贡献

1. Fork 本仓库
2. 新建功能分支
3. 提交代码
4. 新建 Pull Request
