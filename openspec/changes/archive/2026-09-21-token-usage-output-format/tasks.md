## 1. 输出格式

- [x] 1.1 在 `usage.ts` 增加 `--output table|text|raw`（省略为 `table`；非法值在查询前拒绝）。`table` 按平台输出等宽表（aliyun：窗口/已用/重置时间；deepseek：币种/总额/赠送/充值，同段写可用状态；kimi：项目/金额；缺值为 `-`）。`text` 保留现有标签摘要。`raw` 输出该次查询原始响应 JSON（kimi 为响应根对象）。每段以 profile 名与平台开头，相邻成功段之间恰好一个空行。确认：默认 aliyun 为表；`--output text` 非表；`--output raw` 为 JSON；两段之间一个空行；`--output csv` 不查询且非 0

## 2. 文档

- [x] 2.1 更新 help、`token` 用法与 README：分段、空行、`--output`（`table` 默认 / `text` / `raw`）。确认 `pnpm build`、`pnpm typecheck` 与 `--help` 文案
