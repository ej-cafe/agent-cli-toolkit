## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

当前实现（`packages/token-config/src/store.ts`）以 `model-list.json` 按 `platform` 分键存目录；`syncPlatformModels` 拉一次后 `applyModelsToProfiles` 扇出到同平台全部 profile；`addProfile` 经 `ensurePlatformModels` 在平台目录非空时跳过拉取。`sync-model-list` 命令只接受 `--platform`。OpenAI 兼容拉取已在 `openai-models.ts`，可复用。无自动化测试文件；以规格场景与手工/`pnpm` 检查为准。

## Goals / Non-Goals

**目标：**

- `profile.models` 为唯一真相；删除平台级目录读写与扇出。
- `sync-model-list` 支持 `--name`；`--platform` 仅过滤目标 profile。
- `token add` 始终用新凭据拉 `/models`，只写新 profile。
- 多目标同步：成功保留、失败不写、整命令非 0。
- 更新帮助与 README。

**非目标：**

- 重命名子命令（仍用 `sync-model-list`）。
- 删除用户磁盘上已有的 `model-list.json`（忽略即可）。
- 新增平台类型；给 sync 增加 `--base-url` / `--token`；用 `claudeBaseUrl` 拉 `/models`。
- 分页或过滤 `/models` 结果；手动编辑 models 的 CLI。
- 改动 `token use` / apply 路径（仍读目标 profile 的 `models`）。

## Decisions

### 1. 存储：砍掉 model-list.json API

从 `store.ts` 移除 `modelListFilePath`、`getStoredPlatformModels`、`writePlatformModels`、`applyModelsToProfiles`、`ensurePlatformModels`、`syncPlatformModels`，以及按平台收集多组凭据轮询的逻辑。

新增按 profile 的同步：例如 `syncProfileModels(name: string)` —— 加载该 profile，用其 `baseUrl`/`token` 调 `tryFetchOpenAiModels`，成功则只更新该条目并 `saveProfiles`。`addProfile` 直接拉 `/models` 后写入新 profile，不再走平台 ensure。

**原因：** 列表属于凭据/网关，不是平台标签；profile 里已有 `models` 字段。

**备选：** 把 `model-list.json` 改成按 profile 名分键。否决：与 `token-profile.json` 重复。

### 2. sync 目标解析

`runTokenSyncModelList` 解析可选 `--name`、`--platform`：

1. 有 `--name`：解析得到单元素目标列表；若同时有 `--platform` 且不匹配 → `fail`。
2. 无 `--name`：从 `loadProfiles()` 取全部名称排序；有 `--platform` 则过滤。
3. 目标为空 → `fail`。
4. 对目标逐个 `syncProfileModels`；记录失败名；任一失败则最终非 0，但已成功的不回滚。

**原因：** 与探索结论 A 及「成功保留 + 非 0」一致（用户未另选回滚；按探索推荐落盘）。

**备选：** 省略 `--name` 必须配 `--all`。否决：已选 A。全部回滚。否决：实现成本高且与现有多平台循环语义不一致。

### 3. 请求形状不变

继续 `GET {trimTrailingSlash(baseUrl)}/models`，Bearer token；解析规则保持 `openai-models.ts` 现状。每个目标只用自己的一组凭据，不再「同平台试下一套」。

### 4. 文档与帮助

`packages/commands/src/help.ts`、`packages/token-config/src/commands/token.ts` 内嵌用法、README：去掉 `model-list.json` 与「按平台目录」表述；写上 `--name`、按 profile 拉取、`--platform` 为过滤器。

## Risks / Trade-offs

- **[BREAKING] 同平台曾共享的 models 在首次 per-profile sync 前可能仍是旧的扇出拷贝** → 缓解：README/帮助说明按 profile sync；现有拷贝仍可用直到刷新。
- **[BREAKING] `token add` 每次打网关，不能再「蹭」同平台缓存** → 缓解：正确性优先；失败则不写 profile。
- **多目标部分成功非 0** → 缓解：stderr 点名失败 profile；调用方可再 `--name` 重试。
- **遗留 `model-list.json` 占盘** → 缓解：规格要求忽略；不自动删，避免越权删用户文件。

## Migration Plan

1. 发布后 CLI 停止读写 `model-list.json`。
2. 用户对需刷新的 profile 跑 `token sync-model-list`（或带 `--name`）。
3. 可选：用户自行删除配置目录下的 `model-list.json`。
4. 回滚旧 CLI 会再次读写 `model-list.json`；若文件仍在且非空，旧行为会恢复平台共享扇出。
