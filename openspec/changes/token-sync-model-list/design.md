## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`addProfile` 目前直接调用 `modelsForPlatform`，把 `catalog.ts` 内置列表写入每个 profile。配置目录只有 `token-profile.json`。`writeJsonAtomic` 已用于原子写 JSON。不引入新依赖。

## Goals / Non-Goals

**目标：**

- 平台目录独立落到 `getConfigDir()/model-list.json`，`sync-model-list` 与 `add` 共用同一套按平台写入逻辑。
- 内置 `catalog.ts` 仍是同步时的种子；非空 JSON 在 add 时不被覆盖。

**非目标：**

- 向云厂商 HTTP API 拉模型。
- 同步时改写 Claude Code / OpenCode 配置。
- 从 profile 上去掉 `models` 字段（`token use --model` 与 OpenCode 仍读 profile）。

## Decisions

### 1. 独立文件 `model-list.json`

根对象按平台键存放数组：`{ "aliyun": [{ "id", "name" }, ...], "tencent": [...] }`。与 `token-profile.json` 同目录，同一套 `readJsonObject` / `writeJsonAtomic`。只覆盖本次同步的平台键，保留其它键。

**原因：** 规格要求按平台存储、与 profile 文件分开；用户可改 JSON 后 add 仍用已有列表。

**备选：** 把目录嵌进 `token-profile.json` 的 `catalogs` 字段。否决：和凭据文件耦在一起，sync 失败时更容易破坏 profile。

### 2. 内置目录作为 sync 的唯一来源

`sync-model-list` 用现有 `modelsForPlatform` 覆盖 JSON 中该平台键，再把同平台所有 profile 的 `models` 写成同一份拷贝。不发网络请求。

**原因：** 无新依赖；与当前模型数据同源。升级 CLI 后用户跑 sync 即可刷新。

**备选：** 调百炼 / 腾讯云接口。否决：需鉴权、网络与新依赖，超出本次范围。

### 3. `ensurePlatformModels` 供 add 与命令共用

先读 JSON：该平台键为非空数组则返回它。否则按 sync 写入该键（必要时创建文件），若已有 profile 则同步更新同平台 `models`，再返回列表。`addProfile` 改为调用它，不再直接 `modelsForPlatform`。

**原因：** 规格要求 add 缺失时与 `sync-model-list --platform` 相同。

**备选：** add 只写 JSON 不更新其它 profile。否决：与「相同的目录写入」不一致，同平台旧 profile 会继续过期。

### 4. 命令解析

`runTokenSyncModelList`：`parseArgs` 接受可选 `--platform`；`positionals.length > 0` 则失败。`--platform` 用现有 `isPlatform` / 与 add 相同的未知平台错误。未给标志则依次同步 `aliyun` 与 `tencent`。在 `runTokenCommand` 增加 `sync-model-list` 分支。

## Risks / Trade-offs

- **JSON 被手改后，再 sync 会覆盖回内置目录** → 缓解：规格如此；add 不会覆盖非空列表。
- **存量 profile 在首次 sync/add 前仍是旧快照** → 缓解：用户跑 `sync-model-list` 或添加同平台时会更新该平台全部 profile。
- **损坏的 `model-list.json` 导致 add 失败** → 缓解：与 profile 文件一样解析失败即 `fail`，不静默忽略。

## Migration Plan

无需改仓库内数据。本机首次 `add` 或 `sync-model-list` 创建 `model-list.json`。回滚后该文件可留在配置目录，旧版本 CLI 会忽略它。
