## 1. Platform enum & add/sync

- [x] 1.1 将 `Platform` / `isPlatform` 扩展为含 `deepseek`；新增 DeepSeek 预设常量（`baseUrl`=`https://api.deepseek.com`，`claudeBaseUrl`=`https://api.deepseek.com/anthropic`）。更新 `add.ts`：`parsePlatform` 接受 `3`/`deepseek`；菜单第三项；`deepseek` 下省略或空的 base-url/claude-base-url 写入预设，非空则覆盖；aliyun/tencent 仍要求 base-url。用临时配置目录确认：仅 `--name/--platform deepseek/--token` 写入含双预设的 profile；显式 URL 覆盖；`/models` 失败不写入；`--platform aws` 仍拒绝
- [x] 1.2 更新 `sync-model-list.ts`（及 `token.ts` 内嵌用法）平台说明为 `aliyun|tencent|deepseek`。确认 `--platform deepseek` 只同步该平台 profile，无匹配目标时非 0；未知平台仍拒绝

## 2. Usage reject & docs

- [x] 2.1 扩展 `usage.ts` 的 `UsagePlatform` 含 `deepseek`，对 `deepseek` 与 `tencent` 一样拒绝并说明暂不支持。确认 `token usage --platform deepseek` 非 0 且不调用 `bl`
- [x] 2.2 更新 `help.ts`、`token.ts` 用法与 README：平台含 `deepseek`；注明 DeepSeek 的 base-url/claude-base-url 可省略（官方预设）且可覆盖；`usage` 仍仅 `aliyun`。确认 `pnpm build` 与 `pnpm typecheck` 通过，且 `--help` 出现 `deepseek` 与预设说明
