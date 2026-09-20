## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`packages/token-config` 已有 add/delete/list/use/sync-model-list；路由在 `commands/token.ts`，帮助在 `packages/commands/src/help.ts`。百炼 Token Plan 余量官方个人路径依赖控制台鉴权：本机 `bl usage token-plan` 标注 `Authentication: Console`；未登录时 JSON 形如 `{ "error": { "message": "No console access token found.", "hint": "Run \`bl auth login --console\`." } }`。仅 API Key 不能查余量。腾讯云个人版暂无对等公开接口；企业版需云 API AK/SK，本变更不做。

## Goals / Non-Goals

**目标：**

- 新增 `token usage`，默认查阿里云百炼 Token Plan 余量。
- 通过 `spawn`/`execFile` 调用 PATH 上的 `bl usage token-plan --output json`，解析并打印摘要。
- 缺 `bl`、未 console 登录、不支持平台时给出可操作错误。

**非目标：**

- 把 `bailian-cli` 加进 npm 依赖，或捆绑安装 `bl`。
- 自实现百炼控制台 OAuth / cookie 抓取。
- 用 profile 里的 `token`（`sk-sp-`）查询余量。
- 腾讯云或其它平台余量。
- 引入测试框架。

## Decisions

### 1. 命令形态：`token usage [--platform aliyun]`

默认 `--platform aliyun`。不接受 profile `--name`：百炼 Token Plan 余量是订阅/控制台账户级，不是 `token-profile.json` 里某一套 Key 的字段。`tencent` → `fail` 并写明暂不支持。

**备选：** `token quota` / `token remaining`。否决：与 `bl usage` 语义对齐，用 `usage`。

### 2. 数据源：外部 `bl`，必须 Console 登录

实现：`execFile("bl", ["usage", "token-plan", "--output", "json"], …)`（或 `bl` 的绝对解析）。成功解析 JSON 后格式化 stdout；`bl` 非 0 或 `error` 对象存在则 `fail`，优先展示 `hint`（如 `bl auth login --console`）。

不传 `--console-region` / `--console-site`：沿用用户已在 `bl` 里登录的站点；需要切站时由用户对 `bl` 本身处理。

**原因：** 用户已确认余量只能经 console 授权；复用 `bl` 避免自研网关与凭据存储。

**备选：** 自研 console gateway 客户端。否决：本阶段范围过大，且与 `bl` 凭据重复。

**备选：** npm 依赖 `@modelstudio/cli`。否决：AGENTS.md 要求新增运行时依赖先问；PATH 上的 `bl` 已足够。

### 3. 输出

文本摘要即可（窗口已用比例、重置时间等字段以 `bl` JSON 实际键为准，实现时按响应映射，缺失则省略）。可选后续再加 `--json` 原样透传；本变更不做，避免扩大标志面。

### 4. 帮助与文档

`printTokenUsage`、`printHelp`、README：增加 `token usage`，注明仅 `aliyun`、依赖 `bl auth login --console`。

## Risks / Trade-offs

- **用户未装 `bl`** → 缓解：错误信息指向安装/PATH。
- **`bl` 升级改 JSON 字段** → 缓解：尽量宽松解析；未知结构时打印原始 JSON 或失败信息，不静默成功。
- **中国站 / 国际站差异** → 缓解：沿用用户 `bl` 登录站点；文档提示先 `bl auth login --console`。
- **与 profile 平台混淆** → 缓解：规格明确不读 profile token；帮助写「订阅级」。

## Migration Plan

无数据迁移。用户需自行安装 `bailian-cli` 并完成一次控制台登录。回滚 CLI 后不影响已有 profile 与 `bl` 登录态。
