## Why

`token usage` 现在把每个 profile 的余量打成一段标签文本，多套 profile 放在一起时不好扫。默认改成按 profile 分段的命令行表格，并用 `--output` 保留原来的文本摘要。

## What Changes

- **BREAKING**：省略 `--output` 时，成功结果默认以命令行表格输出，不再是现在的「标签 · 值」文本行。
- 仍按 profile 分段：每套一段，段首能区分 profile 名称与平台；相邻成功段落之间必须有一个空行。
- 新增 `--output <table|text|raw>`。`table` 为默认；`text` 为现有可读文本摘要；`raw` 输出该次查询得到的原始 JSON（仍按 profile 分段）。未知取值拒绝、不发起查询，非 0 退出。
- 表格列按平台固定：aliyun 为窗口 / 已用 / 重置时间；deepseek 为币种 / 总额 / 赠送 / 充值（同段写出是否可用）；kimi 为项目 / 金额。缺字段的单元格用 `-`。不得打印完整密钥。
- 帮助与 README 说明分段、空行、`--output`（含 `raw`）及默认表格。查询目标、失败语义与退出码不变。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: `token usage` 的 stdout 展示格式与 `--output`；帮助文案。

## Impact

- 代码：`usage.ts` 的摘要格式化与参数解析；help / `token` 用法 / README。
- 对外 CLI：**BREAKING** 默认 stdout 从文本行变为表格。依赖旧文本的脚本应加 `--output text`。
- 依赖：不引入新的运行时依赖。
- 非目标：额外的封装 envelope（如统一 `{profiles:[…]}`）；CSV；改变查询接口、profile 选择或失败时的 stderr / 退出码。
