## Context

See proposal.md — Why。`token usage` 已实现 aliyun（`bl usage token-plan`）并拒绝 `deepseek`。DeepSeek 官方文档提供 `GET /user/balance`（Bearer API Key），返回 `is_available` 与 `balance_infos[]`（`currency` / `total_balance` / `granted_balance` / `topped_up_balance`）。平台控制台用量接口需 session cookie，本变更不采用。已有 deepseek profile 含 `token` 与 `baseUrl`（默认 `https://api.deepseek.com`）。

## Goals / Non-Goals

**Goals:**

- `--platform deepseek` 走余额查询并打印可读摘要。
- 凭据来自 deepseek profile；`--name` 可选，省略时唯一 deepseek profile 自动选用。
- 保持 aliyun 默认与 `bl` 路径不变；`tencent` 仍拒绝。

**Non-Goals:**

- 平台控制台 `/api/v0/usage/*` 或 cookie 抓取。
- 历史 token 用量时间序列 / CSV。
- `--json` 原样透传。
- 腾讯云 usage。
- 新增运行时依赖。

## Decisions

### 1. 数据源：官方 `GET {baseUrl}/user/balance`

对选中 profile：`baseUrl` 去尾 `/` 后请求 `/user/balance`，头：`Authorization: Bearer <token>`、`Accept: application/json`。与 add/sync 的 OpenAI 兼容根一致；预设下即为 `https://api.deepseek.com/user/balance`。

**Alternatives:** 固定写死 `https://api.deepseek.com` 忽略 profile `baseUrl` — 代理部署无法覆盖。控制台 session API — 鉴权与凭据模型与 CLI 不一致。

### 2. 凭据：profile API Key + `--name` 规则

DeepSeek 余额是账户级，但官方用 API Key 鉴权，故必须读 profile。规则：

| 情况 | 行为 |
| --- | --- |
| `--name` 指定且为 deepseek | 用该套 |
| `--name` 缺失且恰好一套 deepseek | 用该套 |
| 零套 / 多套且无 `--name` | `fail` |
| `--name` 不存在或非 deepseek | `fail` |
| `aliyun` + `--name` | `fail`（百炼不走 profile） |

**Alternatives:** 环境变量 `DEEPSEEK_API_KEY` — 与 token-config 以 profile 为中心的模型冲突。强制始终 `--name` — 单 profile 场景啰嗦。

### 3. 输出摘要字段

标题标明 DeepSeek 余额；打印 `is_available`；逐条打印 `balance_infos` 的币种与三类余额字符串。缺字段则跳过该行；完全无法识别时 `fail` 或打印有限调试信息（不得含完整 token）。

### 4. 命令面

`token usage [--platform aliyun|tencent|deepseek] [--name <profile>]`。默认 platform 仍为 `aliyun`。

## Risks / Trade-offs

- [自定义 `baseUrl` 不实现 `/user/balance`] → 失败提示可改回官方 URL 或检查代理。
- [API Key 权限不足以读余额] → 透传 HTTP 错误，不静默。
- [与百炼「窗口已用比例」语义不同] → 帮助写明 deepseek 为账户余额；规格分平台描述。
- [`--name` 扩展 usage 标志面] → 仅 deepseek/aliyun 校验约束；文档写清。

## Migration Plan

无数据迁移。用户需已有 deepseek profile（`token add --platform deepseek`）。回滚后 `--platform deepseek` 再拒绝即可。
