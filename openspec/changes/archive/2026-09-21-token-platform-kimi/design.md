## Context

See proposal.md — Why。`Platform` 现为 `aliyun` | `tencent` | `deepseek`；deepseek 已有可覆盖预设、菜单 `3)`，以及 `token usage` 的 `{baseUrl}/user/balance`。Kimi（Moonshot）提供 OpenAI 兼容 `https://api.moonshot.cn/v1`、Anthropic 兼容 `.../anthropic`，余额为 `GET {baseUrl}/users/me/balance`（响应信封 `code` / `data.available_balance` 等）。国际站 `api.moonshot.ai`。默认中国站预设。

## Goals / Non-Goals

**Goals:**

- 纳入 `kimi` 平台枚举、add 预设与菜单、sync 过滤。
- `token usage --platform kimi` 用 kimi profile 查余额并打印摘要（`--name` 规则对齐 deepseek）。
- 帮助/README 同步。

**Non-Goals:**

- 默认国际站端点。
- 按平台分支改 apply。
- 腾讯云 usage。
- 迁移已有 profile。

## Decisions

### 1. 平台 id 为 `kimi`

菜单 `4) kimi`，接受 `4` / `kimi`。

### 2. 中国站预设，显式覆盖

| 字段 | 预设 |
| --- | --- |
| `baseUrl` | `https://api.moonshot.cn/v1` |
| `claudeBaseUrl` | `https://api.moonshot.cn/anthropic` |

含 `/v1`，使 `{baseUrl}/models` 与 `{baseUrl}/users/me/balance` 均为官方路径。

### 3. `usage`：官方余额 API + profile 凭据

- 请求：`GET {baseUrl}/users/me/balance`，`Authorization: Bearer <token>`，`Accept: application/json`。
- 成功：HTTP 成功且 `code === 0`（或等价成功），解析 `data.available_balance` / `voucher_balance` / `cash_balance`。
- 失败：HTTP 失败、`code !== 0`、`status === false`、或缺 `data` → `fail`。
- Profile 选择：与 deepseek 相同（`--name` / 唯一自动 / 零或多套拒绝；非 kimi profile 拒绝）。
- `aliyun` 仍禁止 `--name`；`tencent` 仍拒绝。

**Alternatives:** 写死 `api.moonshot.cn` 忽略 profile `baseUrl` — 国际站与代理无法覆盖。

### 4. 摘要输出

标题「Kimi 账户余额」；打印可用 / 代金券 / 现金余额数值。不推断币种字段（文档按站点为 CNY 或 USD）；可不打印币种单位，或根据 `baseUrl` 含 `moonshot.ai` vs `moonshot.cn` 标注 USD/CNY（实现可选，规格要求至少三数字段）。

## Risks / Trade-offs

- [中国站 / 国际站 Key 与域名不匹配] → 覆盖 URL。
- [HTTP 200 但 `code !== 0`] → 按失败处理，不打印假余额。
- [`baseUrl` 误写成无 `/v1` 的根] → `/users/me/balance` 可能 404；用户改回预设或补 `/v1`。

## Migration Plan

`token add --platform kimi --token SECRET` 后即可 `token usage --platform kimi`。回滚前删除 kimi profile。
