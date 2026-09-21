## 1. DeepSeek usage query

- [x] 1.1 在 `usage.ts` 解析可选 `--name`：`aliyun` 若带 `--name` 则 `fail`；移除对 `deepseek` 的「暂不支持」拒绝。按 design 从 store 解析 deepseek 目标 profile（`--name` / 唯一自动 / 零或多套拒绝）。确认：aliyun+`--name` 非 0；无 deepseek profile、多套未给 `--name`、`--name` 指向 aliyun profile 均非 0
- [x] 1.2 实现 `GET {baseUrl}/user/balance`（Bearer + Accept），格式化 `is_available` 与 `balance_infos` 摘要到 stdout。用 mock fetch / 临时配置确认：唯一 deepseek profile 成功输出且不含完整 token；HTTP 失败非 0。确认默认/`--platform aliyun` 仍走 `bl` 路径不变

## 2. Docs

- [x] 2.1 更新 `printTokenUsage`、`help.ts` 与 README：`usage` 支持 `aliyun`（默认）与 `deepseek`（余额 + 可选 `--name`）；`tencent` 仍不支持。确认 `pnpm build`、`pnpm typecheck` 通过，且 `--help` 出现 deepseek usage 说明
