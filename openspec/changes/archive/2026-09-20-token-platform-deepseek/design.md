## Context

See proposal.md — Why。当前 `Platform` / `isPlatform` 仅认 `aliyun` | `tencent`；`add` 交互菜单只有两项；`sync-model-list` 与帮助文案写死二元平台。DeepSeek 官方 API 与现有路径一致：OpenAI 兼容 `{baseUrl}/models` + Bearer token。官方文档固定端点：OpenAI `https://api.deepseek.com`，Anthropic `https://api.deepseek.com/anthropic`。`token use` 各适配器不读 `platform`，只消费 profile 的 token / URL / models。

## Goals / Non-Goals

**Goals:**

- 以最小改动把 `deepseek` 纳入平台枚举与校验链路。
- DeepSeek 添加时对 `baseUrl` / `claudeBaseUrl` 使用可覆盖预设，用户只需提供 name + token（及 platform）。
- 保持 add / sync 的 HTTP 与存储语义不变（仍按最终写入的 URL 拉 `/models`）。
- `usage` 识别 `deepseek` 为已知但未支持的平台（与 `tencent` 同类拒绝文案）。

**Non-Goals:**

- 不实现 DeepSeek 套餐余量查询。
- 不为 aliyun / tencent 增加预设 URL。
- 不按平台分支改写 apply 适配器。
- 不迁移或改写已有 aliyun/tencent profile。

## Decisions

### 1. 平台 id 为 `deepseek`

与现有小写 id（`aliyun`、`tencent`）一致。交互菜单增加 `3) deepseek`，并接受编号 `3` 或字面 `deepseek`。

**Alternatives:** `deepseek-api` / `ds` — 更短但与用户口头「DeepSeek」和常见文档不一致。

### 2. 复用现有 OpenAI `/models` 拉取，无专用客户端

`addProfile` / `syncProfileModels` 已按 profile 凭据请求 `{baseUrl}/models`。DeepSeek 文档提供 OpenAI 兼容端点，无需新依赖。预设 `baseUrl` 为 `https://api.deepseek.com` 时，请求路径为 `https://api.deepseek.com/models`。

**Alternatives:** 官方 SDK 或写死模型目录 — 增加依赖或与真实账户可用模型脱节。

### 3. `usage` 将 `deepseek` 视为已知未支持平台

扩展 `UsagePlatform` 含 `deepseek`，在 `tencent` 分支旁拒绝并说明暂不支持；未知 id（如 `aws`）仍走「未知平台」错误。避免用户以为 `deepseek` 拼写错误，又明确本阶段不做余量查询。

**Alternatives:** 把 `deepseek` 当未知平台 — 与「已支持 profile 平台」心智不一致。

### 4. DeepSeek 预设 URL，显式值覆盖

常量（集中定义，供 `add` 使用）：

| 字段 | 预设 |
| --- | --- |
| `baseUrl` | `https://api.deepseek.com` |
| `claudeBaseUrl` | `https://api.deepseek.com/anthropic` |

解析规则（仅 `platform === "deepseek"`）：

- 未提供 `--base-url`（或交互空答）→ 用预设 `baseUrl`。
- 提供非空 `--base-url` → 覆盖。
- 未提供 `--claude-base-url`（或交互空答 / 未询问）→ 写入预设 `claudeBaseUrl`（必须写入，不得因空而省略该字段——Anthropic 端点与 OpenAI base 不同）。
- 提供非空 `--claude-base-url` → 覆盖。

aliyun / tencent：`base-url` 仍必填；未给 `claude-base-url` 时仍省略 `claudeBaseUrl`（回退到 `baseUrl`）。

交互：选 DeepSeek 时，base-url / claude-base-url 提示标明可选（回车用预设）；不得因二者为空而拒绝。

**Alternatives:** 仅预设 `baseUrl`、不写 `claudeBaseUrl` — Claude Code / OpenCode 会错误地用 OpenAI base 当 Anthropic 地址。

## Risks / Trade-offs

- [DeepSeek `/models` 路径或鉴权与假设不符] → 失败时与现网一致：不写入 profile；用户可用 `--base-url` 覆盖后重试。
- [官方日后改端点] → 常量集中一处；用户仍可覆盖；帮助注明预设值。
- [帮助文案漏改] → tasks 显式覆盖 help、token 内嵌用法、README（含 DeepSeek 预设与可覆盖说明）。
- [主 spec Purpose 仍写「阿里云与腾讯云」] → archive 合并后可顺手刷新 Purpose（非行为合同）。

## Migration Plan

- 发布后即可 `token add --name ds --platform deepseek --token SECRET`（URL 用预设）；旧 profile 无需迁移。
- 回滚：恢复 `Platform` 枚举后，已写入的 `deepseek` profile 会在加载时被 `isPlatform` 拒绝——若需回滚，应先删除或改写这些 profile。
