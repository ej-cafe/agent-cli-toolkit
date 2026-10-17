## 1. 实现：aliyun usage 增加 1 个月窗口解析

- [x] 1.1 在 `packages/token-config/src/platforms/aliyun.ts` 的 `aliyunWindowRows` 函数中，在 `push("7 天窗口", ...)` 之后增加 `push("1 个月窗口", data.per1MonthPercentage, data.per1MonthResetTime)`；在 `summarizeAliyunUsage` 函数中，在 `formatWindow("7 天窗口", ...)` 之后增加 `formatWindow("1 个月窗口", data.per1MonthPercentage, data.per1MonthResetTime)`。验证：`pnpm typecheck` 通过。
- [x] 1.2 在 `packages/token-config/test/usage.test.ts` 的 `aliyunTokenPlan` fixture 中增加 `per1MonthPercentage: 0.3231` 和 `per1MonthResetTime: Date.UTC(2027, 3, 22, 0, 0, 0)`；在 "renders the default table from bl JSON" 测试中增加对 "1 个月窗口" 和对应百分比的断言；在 "renders aliyun text and raw output" 的 text 断言中增加 "1 个月窗口: 已用" 的检查。验证：`pnpm --filter token-config test` 全部通过。

## 2. 验证

- [x] 2.1 运行 `pnpm typecheck` 确认类型检查通过，运行 `pnpm test` 确认全部测试通过。
