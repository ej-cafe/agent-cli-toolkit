## Why

阿里云百炼 Token Plan 的 `bl usage token-plan` 接口返回了 1 个月用量窗口（`per1MonthPercentage` / `per1MonthResetTime`），但当前 aliyun usage 解析只识别 5 小时和 7 天两个窗口，导致月度窗口数据被静默忽略，用户无法在 `token usage` 输出中看到该信息。

## What Changes

- 在 aliyun platform 的 usage 解析中增加对 `per1MonthPercentage` / `per1MonthResetTime` 字段的识别
- table 输出新增"1 个月窗口"行
- text 输出新增"1 个月窗口: 已用 XX%"行
- raw 输出不受影响（已打印完整 JSON）

## Capabilities

### New Capabilities

（无新增 capability）

### Modified Capabilities

（无 spec 级行为变更。现有 token-config spec 对 aliyun usage 的描述已涵盖"用量窗口与重置时间，若存在"，新增窗口属于实现细节。）

## Impact

- 影响文件：`packages/token-config/src/platforms/aliyun.ts`（`aliyunWindowRows` 与 `summarizeAliyunUsage`）
- 影响测试：`packages/token-config/test/usage.test.ts`（需在 mock 数据和断言中加入 `per1Month*` 字段）
- 不影响其它平台、其它命令、不引入新依赖
