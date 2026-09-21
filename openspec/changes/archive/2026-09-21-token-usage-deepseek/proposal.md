## Why

`token usage` 已能查阿里云百炼 Token Plan 余量，但 `--platform deepseek` 仍被拒绝。DeepSeek 用户同样需要在 CLI 里查看账户可用额度；官方提供 Bearer 鉴权的 `GET /user/balance`，可用已保存的 deepseek profile API Key 查询。

## What Changes

- `agent-cli token usage --platform deepseek` 查询 DeepSeek 账户余额（`is_available`、各币种 `total_balance` / `granted_balance` / `topped_up_balance`），不再拒绝。
- DeepSeek 查询使用已保存 deepseek profile 的 `token`：支持可选 `--name <profile>`；省略时若恰好只有一套 deepseek profile 则用之，否则拒绝并提示指定 `--name`。
- 请求官方余额接口：对选中 profile 的 OpenAI 兼容 `baseUrl` 发起 `GET {baseUrl}/user/balance`（`Authorization: Bearer <token>`）。aliyun 路径（`bl` + 控制台登录）与默认 `--platform aliyun` 不变；`tencent` 仍拒绝。
- 更新帮助与 README：说明 deepseek 用量/余额查询及 `--name` 规则。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: 扩展「查询套餐余量」与帮助要求，使 `deepseek` 成为受支持的 usage 平台（余额语义），并定义 profile 凭据选择规则。

## Impact

- 代码：`packages/token-config` 的 `commands/usage.ts`（及必要时的 store 读 profile）；`packages/commands` help；根 README。
- 对外 CLI：`token usage` 增加 deepseek 支持与可选 `--name`；默认仍为 aliyun。
- 依赖：无新运行时依赖；复用现有 `fetch`。
- 非目标：腾讯云 usage；DeepSeek 平台控制台 session / cookie 用量接口；`--json` 透传；改变 aliyun 的 `bl` 路径。
