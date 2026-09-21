## Context

See proposal.md — Why。`usage.ts` 已按 profile 查询，成功段用 `name (platform)` 开头，`chunks.join("\n")` 在段之间留空行。摘要函数现在只产标签文本。阿里云结果缓存在已格式化的字符串上。

## Goals / Non-Goals

**Goals:**

- `--output table|text|raw`，省略为 `table`。
- 同一套查询结果可渲染成表格、文本或原始 JSON；段间空行保持恰好一行。
- 不新增依赖。

**Non-Goals:**

- 统一 envelope / CSV；改查询与退出码。

## Decisions

### 1. 自绘等宽表格

用字符串按列宽补空格，表头一行、数据行紧随，不用边框字符、不用 Markdown。列宽取该表各行（含表头）的显示宽度。中文按宽字符计（`Intl.Segmenter` 不可用时，非 ASCII 计 2）。

**Alternatives:** 引入 `cli-table` — 违反「先问再加依赖」，且此处只有三张小表。

### 2. 缓存原始对象再格式化

查询路径统一返回「原始响应对象」：aliyun 为 `bl` 根对象；deepseek / kimi 为 HTTP JSON 根对象（kimi 校验仍看根上的 `code`/`data`，但 `raw` 打印整棵根）。打印时按 `--output` 选择 `tabulate*` / `summarize*` / `JSON.stringify(…, null, 2)`。DeepSeek 的「可用」在 table 模式下放在表上方同一段内。

### 3. 先校验 `--output` 再查询

非法取值在 `loadProfiles` / 网络 / `bl` 之前 `fail`。

## Risks / Trade-offs

- [默认从文本变表格] → **BREAKING**；`--output text` 保留旧语义；`--output raw` 便于脚本解析。
- [等宽在窄终端会换行] → 接受；列少，不截断字段值。
- [重置时间含本地化空格] → 单元格内不换行，整格参与列宽。
- [多 profile 的 raw 不是单一 JSON 文档] → 仍按段输出；要单文档时可 `--name` 只查一套。

## Migration Plan

依赖旧文本的调用加上 `--output text`。需要原始响应时用 `--output raw`。回滚后默认恢复标签文本，并移除 `--output`。
