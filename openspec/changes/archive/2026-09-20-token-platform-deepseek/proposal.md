## Why

用户需要把 DeepSeek 官方 API Key 与 baseUrl 存成 token profile，并与现有 aliyun / tencent 一样走 `add` / `sync-model-list` / `use`。当前 `platform` 只允许 `aliyun` | `tencent`，无法合法保存 DeepSeek 凭据。DeepSeek 官方端点固定，应提供预设 URL，减少必填项。

## What Changes

- 将受支持的 profile `platform` 扩展为 `aliyun` | `tencent` | `deepseek`。
- `token add` 接受 `--platform deepseek`；交互问答增加 DeepSeek 选项。
- DeepSeek 预设：`baseUrl` = `https://api.deepseek.com`，`claudeBaseUrl` = `https://api.deepseek.com/anthropic`。省略 `--base-url` / `--claude-base-url`（及交互空答）时写入预设；用户显式填写则覆盖对应字段。aliyun / tencent 仍要求显式 `base-url`，行为不变。
- `token sync-model-list --platform deepseek` 可过滤 DeepSeek profile；模型拉取仍走该 profile 的 `{baseUrl}/models`（OpenAI 兼容）。
- 帮助文案、`token` 子命令用法与 README 中的平台列表及 DeepSeek 预设说明同步更新。
- **不**为本阶段新增 `token usage --platform deepseek`：余量查询仍仅支持 `aliyun`；传入 `deepseek` 时与 `tencent` 一样拒绝并说明暂不支持。
- 不改动 `token use` 各 agent 适配器的写入语义（适配器不按平台分支）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: 扩展 profile / `add` / `sync-model-list` / 帮助中的平台枚举，纳入 `deepseek`；DeepSeek 的 `baseUrl` / `claudeBaseUrl` 使用可覆盖预设；明确 `usage` 仍不支持 `deepseek`。

## Impact

- 代码：`packages/token-config` 的 `Platform` / `isPlatform`、DeepSeek 预设常量、`add` 解析与交互、`sync-model-list` 用法字符串；`packages/commands` 的 help；根 README。
- 对外 CLI：`--platform` 合法值增加 `deepseek`；DeepSeek 下 `--base-url` / `--claude-base-url` 变为可选（向后兼容；既有 aliyun/tencent 行为不变）。
- 存储：既有 `token-profile.json` 无需迁移；新 profile 可写 `"platform": "deepseek"`，并写入预设或覆盖后的 URL。
- 依赖：无新运行时依赖；不引入 DeepSeek SDK。
- 非目标：DeepSeek 套餐余量查询、按平台特化的 apply 逻辑。
