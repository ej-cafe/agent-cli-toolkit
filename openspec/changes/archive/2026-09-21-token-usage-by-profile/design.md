## Context

See proposal.md — Why。现状：`usage.ts` 默认 `--platform aliyun`（`bl`），deepseek/kimi 按平台选 profile。用户要求：取消 `--platform`，按 profile 分别查询与展示，`--name` 指定单套。

阿里云仍无 API Key，保留 `bl`；结果按 aliyun profile 名展示（多套共享一次 `bl` 调用）。

## Goals / Non-Goals

**Goals:**

- usage 只接受可选 `--name`；拒绝 `--platform`。
- 无 `--name` → 全部 profile（按名排序）逐套查询并分别输出。
- 有 `--name` → 仅该套；不存在则整次非 0。
- deepseek/kimi/aliyun/tencent 按上表语义；尽力而为 exit 码。

**Non-Goals:**

- 为 aliyun 改用 profile API Key；tencent 余额；改变 `bl` 鉴权方式。

## Decisions

### 1. 目标列表

`loadProfiles()` 后：有 `--name` 则取单套（缺失 → fail 整次）；否则 `Object.keys(profiles).sort()`。空列表 → 「暂无 profile」、exit 0。

### 2. 按 platform 分派

对每个目标名调用内部 `queryOne(name, profile)`：
- deepseek / kimi：现有 HTTP 余额逻辑，摘要前打印 `name (platform)` 头。
- aliyun：走 `runBlTokenPlanUsage`；进程内缓存首次结果，后续 aliyun profile 复用。
- tencent：抛「暂不支持」。

### 3. 编排与 exit

循环 catch：stderr 写 `name: …`；统计成功数。结束时成功数 > 0 → 0，否则非 0。`--name` 缺失 profile 不进入循环。

### 4. 拒绝 `--platform`

`parseArgs` 仍可解析到该键时，若用户传入则 `fail` 说明已取消。或使用 strict 未知选项；实现上显式检测并报错更清晰。

## Risks / Trade-offs

- [多套 aliyun 展示相同 `bl` 摘要] → 符合「分别展示」；控制台余量本就不绑 API Key。
- [无 profile 时 exit 0 vs 旧默认查 aliyun] → **BREAKING**；与 `token list` 空列表一致。
- [脚本依赖 `--platform`] → 改为 `--name` 或查全部。

## Migration Plan

用 `--name` 替代 `--platform deepseek|kimi`；要仅 aliyun 时对 aliyun profile 使用 `--name`。回滚恢复 platform 模式。
