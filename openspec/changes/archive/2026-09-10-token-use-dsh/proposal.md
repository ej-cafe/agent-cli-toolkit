## Why

`token use` 目前只能把 profile 写入 Claude Code 与 OpenCode。DeepSeek Harness（简称 dsh）用 `$DSH_HOME/settings.yaml`（默认 `~/.dsh/settings.yaml`）管理自定义 provider，凭据则在同目录 `.credentials.yaml`，无法从现有命令切换。

## What Changes

- `token use` 新增受支持工具 `dsh`。`--tool dsh` 只写 dsh 配置；`--all` 同时应用到 Claude Code、OpenCode 与 dsh；交互选择列出 `dsh`。
- 应用到 dsh 时，只在 `settings.yaml` 的 `llm-pi-ai.providers.<profile-name>` 写入 OpenAI 兼容路由（`api`、`baseURL`、模型列表、`apiKeyEnv`），并把 token 写入 `.credentials.yaml` 对应键。不得把 token 明文写进 `settings.yaml`。不得写入 `llm-deepseek` 或顶层 `providers`。
- `--model` 在本次目标含 `dsh` 时，把默认模型写在 `settings.yaml` 顶层 `agent-default-model`（`provider` + `model`），不写进 provider 条目。仅 OpenCode 时传 `--model` 仍须拒绝。
- `--help` 与 README 列出 `dsh`。删除 profile 仍不得改 dsh 文件。

## Capabilities

### New Capabilities

- （无）扩展已有 token-config。

### Modified Capabilities

- `token-config`: 新增 dsh 作为 `token use` 目标；写入 `settings.yaml` 与 `.credentials.yaml`；`--all` / 交互选择 / `--model` / 帮助同步覆盖 dsh。

## Impact

- 代码：`packages/token-config` 新增 dsh 适配器；扩展 `AgentTool`、`token use`、删除约束与帮助。
- CLI：`--tool dsh`；`--all` 含三个工具。
- 依赖：解析/合并 YAML 需要运行时依赖 `yaml`（仅 `token-config`）。实现前须确认（AGENTS.md：新增运行时依赖先问）。
- 文档：`--help` 与 README。
- 用户文件：`$DSH_HOME/settings.yaml` 与 `$DSH_HOME/.credentials.yaml`（未设 `DSH_HOME` 时为 `~/.dsh/`）。
