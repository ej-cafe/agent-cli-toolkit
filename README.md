# agent-cli-toolkit

TypeScript 命令行工具集，运行在 Node.js 上，使用 pnpm monorepo。用于构建与管理 AI 代理应用，规划支持插件扩展与多环境部署。

## 要求

- Node.js >= 20
- pnpm 12（见根目录 `packageManager`）

## 使用

```bash
pnpm install
pnpm build
pnpm test
pnpm exec agent-cli --help
pnpm --filter @agent-cli-toolkit/cli dev
```

对外命令：`agent-cli`。首次运行会创建 `~/.config/agent-cli-toolkit`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/agent-cli-toolkit`），全局配置统一存放于此。token profile（含各自的模型列表）保存在该目录下的 `token-profile.json`。

```bash
agent-cli token add
agent-cli token add --name <name> --platform <aliyun|tencent|deepseek|kimi> --token <token> [--base-url <url>] [--claude-base-url <url>]
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
agent-cli token sync-model-list --platform deepseek
agent-cli token sync-model-list --platform kimi
agent-cli token usage
agent-cli token usage --name <profile>
agent-cli token usage --output text
agent-cli token usage --output raw
```

`token add` 可省略标志，在交互式终端问答补齐缺失字段；添加时会用该套凭据请求 `{baseUrl}/models`，失败则不写入 profile。`--platform deepseek` 时可省略 `--base-url` / `--claude-base-url`，默认分别为 `https://api.deepseek.com` 与 `https://api.deepseek.com/anthropic`，显式传入则覆盖。`--platform kimi` 时可省略 URL，默认分别为 `https://api.moonshot.cn/v1` 与 `https://api.moonshot.cn/anthropic`（国际站可覆盖为 `api.moonshot.ai`）。`aliyun` / `tencent` 仍需提供 `--base-url`。`token list` 列出已保存的 profile，token 会脱敏。`token use` 可将当前 profile 写入 Claude Code（`~/.claude/settings.json` 的 `env`）、OpenCode（`~/.config/opencode/opencode.json` 中以 profile 名称为键的 provider）、DeepSeek Harness（`$DSH_HOME/settings.yaml` 的 `llm-pi-ai.providers.<name>`，默认 `$DSH_HOME` 为 `~/.dsh`）和 pi（`$PI_CODING_AGENT_DIR` 下的 `models.json` / `auth.json` / `settings.json`，默认 `~/.pi/agent`）。应用到 pi 时会设置 `defaultProvider`（profile 名称）与 `defaultModel`：有 `--model` 时用该 id，否则用该 profile 模型列表第一项。`--model` 对 Claude Code 与 dsh 仍仅在传入时写入默认模型（分别是 `env.ANTHROPIC_MODEL` 与顶层 `agent-default-model`）。未指定 `--all` 或 `--tool` 时，会在命令行选择目标工具。`token sync-model-list` 按 profile 更新模型列表：可指定 `--name`，可按 `--platform` 过滤，省略 `--name` 则同步全部目标；每个目标用自己的 `{baseUrl}/models`。`token usage` 按已保存 profile 分段查询套餐余量或账户余额并展示，成功段之间以空行分隔；省略 `--name` 时查询全部 profile，可用 `--name` 指定单套。`--output` 可取 `table`（默认，命令行表格）、`text`（文本摘要）或 `raw`（原始 JSON 响应）。deepseek 查询账户余额（`GET {baseUrl}/user/balance`），kimi 查询账户余额（`GET {baseUrl}/users/me/balance`），aliyun 用本机 `bl` 查询百炼 Token Plan（需 `bl auth login --console`，不读 profile API Key），tencent 暂不支持。`--token` 可能出现在 shell 历史中，请谨慎使用。

## 参与贡献

1. Fork 本仓库
2. 新建功能分支
3. 提交代码
4. 新建 Pull Request
