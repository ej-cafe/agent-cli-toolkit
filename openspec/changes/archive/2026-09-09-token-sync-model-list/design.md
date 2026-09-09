## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`addProfile` 目前直接调用 `modelsForPlatform`，把 `catalog.ts` 内置列表写入每个 profile。配置目录只有 `token-profile.json`。`writeJsonAtomic` 已用于原子写 JSON。腾讯云 TokenHub 管控面为 [DescribeModelList](https://cloud.tencent.com/document/product/1823/132614)：`POST https://tokenhub.tencentcloudapi.com/`，`X-TC-Action: DescribeModelList`，`X-TC-Version: 2026-03-22`，默认 Limit 20、最大 100，需分页。鉴权为 API 3.0 TC3-HMAC-SHA256（SecretId/SecretKey），与 profile 里的推理 `token` 不是同一套密钥。不引入腾讯云 SDK。

## Goals / Non-Goals

**目标：**

- 平台目录独立落到 `getConfigDir()/model-list.json`，`sync-model-list` 与 `add` 共用同一套按平台写入逻辑。
- `aliyun` 以 `catalog.ts` 为种子；`tencent` 以 TokenHub 接口为唯一同步来源。
- 非空 JSON 在 add 时不被覆盖。

**非目标：**

- 引入 `tencentcloud-sdk-nodejs` 或其它新运行时依赖。
- 用 profile.`token` 调管控面。
- 同步时改写 Claude Code / OpenCode 配置。
- 从 profile 上去掉 `models` 字段。
- 阿里云走百炼 HTTP 接口。

## Decisions

### 1. 独立文件 `model-list.json`

根对象按平台键存放数组：`{ "aliyun": [{ "id", "name" }, ...], "tencent": [...] }`。与 `token-profile.json` 同目录，同一套 `readJsonObject` / `writeJsonAtomic`。只覆盖本次同步的平台键，保留其它键。腾讯云失败时不写该键（已有内容保持不变）。

**原因：** 规格要求按平台存储、与 profile 文件分开；接口失败不得毁掉已有腾讯目录。

**备选：** 把目录嵌进 `token-profile.json` 的 `catalogs` 字段。否决：和凭据文件耦在一起。

### 2. 腾讯云走 TC3 + fetch，不用 SDK

实现薄客户端：`node:crypto` 按 [签名方法 v3](https://cloud.tencent.com/document/product/1823/132284) 生成 `Authorization`，`fetch` POST JSON。`Limit=100`，用 `Offset` 循环直到 `Offset + ModelSet.length >= TotalCount` 或本页为空。映射：`id = ModelId`，`name = DisplayName`（空则 `ModelName`）；跳过缺少 `ModelId` 的条目。请求体不传 `ModelIds`/`ModelNames` 过滤，以拿到完整列表。

密钥只读 `process.env.TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`。地域：`process.env.TENCENTCLOUD_REGION` 或 `ap-guangzhou`，写入 `X-TC-Region`。把 HTTP 调用收成可注入函数，便于用桩验证分页与失败路径，实现时不必打真实腾讯云。

**原因：** 符合管控面鉴权；无新依赖；profile token 是推理密钥，签不了该接口。

**备选：** 官方 Node SDK。否决：新增运行时依赖。备选：用 profile token。否决：接口要的是 CAM 密钥。

### 3. `ensurePlatformModels` 供 add 与命令共用

先读 JSON：该平台键为非空数组则返回它。否则按该平台的同步来源写入该键（阿里云内置 / 腾讯云接口），若已有 profile 则更新同平台 `models`，再返回列表。`addProfile` 改为调用它。腾讯云在缺密钥或接口失败时 `fail`，`addProfile` 不得写入新 profile。

**原因：** 规格要求缺失时与 `sync-model-list --platform` 相同。

### 4. 命令解析

`runTokenSyncModelList`：`parseArgs` 接受可选 `--platform`；`positionals.length > 0` 则失败。未给标志则先 `aliyun` 再 `tencent`（腾讯失败时阿里云若已写成功，保持已写入的 `aliyun`，但不得写 `tencent`）。在 `runTokenCommand` 增加 `sync-model-list` 分支。

## Risks / Trade-offs

- **同步腾讯云必须能访问 tokenhub.tencentcloudapi.com 且具备 CAM 权限** → 缓解：缺密钥或失败即明确报错，不写空列表。
- **默认地域 `ap-guangzhou` 若不被 TokenHub 接受** → 缓解：可用 `TENCENTCLOUD_REGION` 覆盖。
- **JSON 被手改后，再 sync 会覆盖** → 缓解：规格如此；add 不会覆盖非空列表。
- **分页或字段变更导致解析失败** → 缓解：无法得到非空 `id`/`name` 列表则失败，不写盘。

## Migration Plan

无需改仓库内数据。本机首次 `add` 或 `sync-model-list` 创建 `model-list.json`。回滚后该文件可留在配置目录，旧版本 CLI 会忽略它。
