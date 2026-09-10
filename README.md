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

对外命令：`agent-cli`。首次运行会创建 `~/.config/agent-cli-toolkit`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/agent-cli-toolkit`），全局配置统一存放于此。token profile 保存在该目录下的 `token-profile.json`，平台模型目录保存在 `model-list.json`。

```bash
agent-cli token add
agent-cli token add --name <name> --platform <aliyun|tencent> --token <token> --base-url <url> [--claude-base-url <url>]
agent-cli token delete <name>
agent-cli token list
agent-cli token use <name> --all
agent-cli token use <name> --tool claude-code --model <id>
agent-cli token use <name> --tool dsh --model <id>
agent-cli token use <name> --tool claude-code --tool opencode --tool dsh
agent-cli token sync-model-list
agent-cli token sync-model-list --platform aliyun
agent-cli token sync-model-list --platform tencent
```

`token add` 可省略标志，在交互式终端问答补齐缺失字段。若该平台在 `model-list.json` 中尚无模型列表，会先同步再写入 profile。`token list` 列出已保存的 profile，token 会脱敏。`token use` 可将当前 profile 写入 Claude Code（`~/.claude/settings.json` 的 `env`）、OpenCode（`~/.config/opencode/opencode.json` 中以 profile 名称为键的 provider）和 DeepSeek Harness（`$DSH_HOME/settings.yaml` 的 `llm-pi-ai.providers.<name>`，默认 `$DSH_HOME` 为 `~/.dsh`）。`--model` 对 Claude Code 与 dsh 有效：分别写入 `env.ANTHROPIC_MODEL` 与顶层 `agent-default-model`。未指定 `--all` 或 `--tool` 时，会在命令行选择目标工具。`token sync-model-list` 按平台更新模型目录：阿里云用内置目录，腾讯云请求 TokenHub 接口（需环境变量 `TENCENTCLOUD_SECRET_ID` 与 `TENCENTCLOUD_SECRET_KEY`）。`--token` 可能出现在 shell 历史中，请谨慎使用。

## 参与贡献

1. Fork 本仓库
2. 新建功能分支
3. 提交代码
4. 新建 Pull Request
