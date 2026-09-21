## Why

用户需要把 Kimi（Moonshot）官方 API Key 与 baseUrl 存成 token profile，并与现有 aliyun / tencent / deepseek 一样走 `add` / `sync-model-list` / `use`，并可用 `token usage` 查询账户余额。当前 `platform` 不含 `kimi`。官方端点固定，应提供可覆盖预设 URL；余额接口为 Bearer 鉴权的 `GET /v1/users/me/balance`。

## What Changes

- 将受支持的 profile `platform` 扩展为含 `kimi`。
- `token add` 接受 `--platform kimi`；交互问答增加 Kimi 选项（编号 `4`）。
- Kimi 中国站预设：`baseUrl` = `https://api.moonshot.cn/v1`，`claudeBaseUrl` = `https://api.moonshot.cn/anthropic`。省略 URL（及交互空答）时写入预设；显式填写则覆盖。国际站（`api.moonshot.ai`）用户通过覆盖 URL 使用。
- `token sync-model-list --platform kimi` 可过滤 Kimi profile；模型拉取仍走 `{baseUrl}/models`。
- `token usage --platform kimi` 查询账户余额：`GET {baseUrl}/users/me/balance`（Bearer profile `token`）；`--name` 规则与 deepseek 相同（指定 / 唯一自动 / 零或多套拒绝）。成功摘要至少含 `available_balance`、`voucher_balance`、`cash_balance`（响应 `code === 0` 且含 `data`）。aliyun / deepseek 行为不变；`tencent` 仍拒绝。
- 帮助与 README 同步平台列表、Kimi 预设及 usage 说明。
- 不改动 `token use` 各 agent 适配器写入语义。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: 扩展 profile / `add` / `sync-model-list` / `usage` / 帮助，纳入 `kimi`（含可覆盖预设与余额查询）。

## Impact

- 代码：`Platform` / `isPlatform`、Kimi 预设、`add`、`sync-model-list`、`usage`（kimi 余额路径）；help；README。
- 对外 CLI：`--platform kimi`；usage 支持 kimi + 可选 `--name`。
- 存储：新 profile 可写 `"platform": "kimi"`；旧 profile 无需迁移。
- 依赖：无新运行时依赖。
- 非目标：腾讯云 usage、按平台特化 apply、默认国际站端点。
