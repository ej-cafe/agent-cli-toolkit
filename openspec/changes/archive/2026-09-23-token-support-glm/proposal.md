## Why

用户需要把智谱 GLM（BigModel）API Key 存成 token profile，并应用到 Claude Code、OpenCode、DeepSeek Harness（dsh）与 pi。现有平台只有 `aliyun`、`tencent`、`deepseek`、`kimi`，无法用官方预设添加 GLM。

## What Changes

- 新增平台 id `glm`（显示与帮助中可称 GLM / 智谱）。
- `token add` / 交互平台菜单接受 `glm`；省略 `--base-url` / `--claude-base-url` 时写入中国站 **GLM Coding Plan** 预设：
  - `baseUrl` = `https://open.bigmodel.cn/api/coding/paas/v4`
  - `claudeBaseUrl` = `https://open.bigmodel.cn/api/anthropic`
- 用户可显式传入 URL 覆盖（通用按量 `…/api/paas/v4`、国际站 `api.z.ai` 等同理）。
- `token sync-model-list`、`--platform` 过滤、帮助与 README 列出 `glm`。
- `token use` 与其它平台相同（凭据写入各 agent 工具；不新增工具）。
- `token usage`：本变更将 `glm` 视为暂不支持余量查询（与 `tencent` 相同：该套失败并说明），不依赖未文档化的控制台余额 / Coding Plan 额度接口。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: 平台枚举、add 预设与问答、sync-model-list 过滤、usage 对不支持平台的处理、帮助文案增加 `glm`。

## Impact

- 代码：`packages/token-config`（`Platform` 类型、平台 registry、`glm` 模块、add/sync/usage/help）、`packages/commands` 帮助、根 `README.md`。
- 无新运行时依赖。
- 已有 profile 与其它平台行为不变；交互菜单平台编号在末尾追加 `5` = `glm`。
