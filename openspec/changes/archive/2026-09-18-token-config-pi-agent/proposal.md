## Why

`token use` 已能把 profile 同步到 Claude Code、OpenCode 与 DeepSeek Harness，但还不能写入 pi coding agent（`~/.pi/agent`）的自定义 provider 与凭据。用户需要用同一套阿里云/腾讯云 token profile 驱动 pi，避免手工维护 `models.json` / `auth.json`。

## What Changes

- 新增 `token use` 目标工具 `pi`：把选定 profile 写入 pi agent 的自定义 provider 与 API key。
- `--all`、交互选择工具、帮助与 README 覆盖 `pi`。
- `--model` 在目标含 `pi` 时写入 pi 的启动默认 provider/model；仅 `opencode` 时仍拒绝 `--model`。
- 不改 profile 存储、`token add` / `delete` / `list` / `sync-model-list` 的既有语义；删除 profile 不清理 pi 配置。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: 扩展「将 profile 切换到 agent 工具」与帮助；新增「更新 pi agent 的 provider」需求。

## Impact

- 代码：`packages/token-config` 新增 `apply/pi.ts`；扩展 `AgentTool`、`token use`、帮助文案；根 README。
- 运行时文件：默认读写 `~/.pi/agent/models.json`、`auth.json`、（可选）`settings.json`；支持 `PI_CODING_AGENT_DIR` 覆盖 agent 目录。
- 依赖：无新增运行时依赖（JSON 合并，复用现有 `json-file.ts`）。
