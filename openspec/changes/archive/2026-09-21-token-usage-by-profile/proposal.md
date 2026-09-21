## Why

`token usage` 按 `--platform` 聚合，和用户按套 profile 管理凭据的方式不一致；要看多套 DeepSeek/Kimi 余额还得反复改参数。余量查询应以 profile 为单元分别展示，并去掉 `--platform`。

## What Changes

- **BREAKING**：`token usage` **取消** `--platform`；若传入该标志，必须拒绝并以非 0 退出。
- 以 **profile** 为查询单元：省略 `--name` 时按名称排序查询**全部**已保存 profile，并分别向 stdout 展示；`--name <profile>` 只查该套（不存在则整次拒绝、非 0）。
- 按 profile 的 `platform` 决定查法：`deepseek` / `kimi` 用该套 `token`+`baseUrl` 调官方余额接口；`aliyun` 仍用本机 `bl` 控制台 Token Plan（不读 profile 的 API Key），输出挂在该 profile 名下；同一轮若多个 aliyun profile，`bl` 只调用一次，各 aliyun profile 分别展示同一份摘要；`tencent` 该套计为失败（暂不支持）。
- **尽力而为**：各 profile 独立成败；成功摘要写 stdout（带 profile 名）；失败写 stderr（带 profile 名）；至少一个成功则 exit 0，全部失败或无任何可尝试目标则非 0。无任何 profile 时：stdout 提示暂无 profile，exit 0。
- 帮助与 README：去掉 usage 的 `--platform`；说明按 profile 查询与 `--name`。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: `token usage` 改为 profile 维度；移除 usage 的 `--platform`；更新帮助。

## Impact

- 代码：`usage.ts` 主流程；help / token 用法 / README。
- 对外 CLI：**BREAKING**（无 `--platform`；默认查全部 profile 而非仅 aliyun）。
- 依赖：无新运行时依赖。
- 非目标：tencent 余额实现；用百炼 API Key 替代 `bl`；并行请求。
