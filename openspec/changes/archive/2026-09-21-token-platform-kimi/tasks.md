## 1. Platform enum & add/sync

- [x] 1.1 扩展 `Platform` / `isPlatform` 含 `kimi`；新增 Kimi 预设常量（`baseUrl`=`https://api.moonshot.cn/v1`，`claudeBaseUrl`=`https://api.moonshot.cn/anthropic`）。更新 `add.ts`：`parsePlatform` 接受 `4`/`kimi`；菜单第四项；`kimi` 与 `deepseek` 一样省略 URL 用预设、非空覆盖。用临时配置确认：仅 name/platform/token 写入双预设；显式国际站 URL 覆盖；`/models` 失败不写入；`--platform aws` 仍拒绝
- [x] 1.2 更新 `sync-model-list` 与 `token.ts` 平台说明含 `kimi`。确认 `--platform kimi` 只同步该平台；无匹配 / 未知平台非 0

## 2. Usage & docs

- [x] 2.1 在 `usage.ts` 支持 `--platform kimi`：按 deepseek 同款规则解析 kimi profile；`GET {baseUrl}/users/me/balance`；校验 `code === 0` 与 `data` 三字段后打印摘要。确认：唯一 profile 成功且不含完整 token；多套未给 `--name` / 零套 / `--name` 非 kimi / HTTP 或 `code !== 0` 均非 0；`tencent` 仍拒绝；aliyun 路径不变
- [x] 2.2 更新 help、README：平台含 `kimi`；Kimi 中国站 URL 预设可覆盖；`usage` 支持 aliyun / deepseek / kimi。确认 `pnpm build`、`pnpm typecheck` 通过，且 `--help` 出现 kimi usage 说明
