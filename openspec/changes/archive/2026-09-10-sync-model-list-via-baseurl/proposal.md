## Why

`token sync-model-list` 目前阿里云只写内置目录、腾讯云只打 TokenHub 管控面。网关已经提供 OpenAI 兼容的 `{baseUrl}/models`，用 profile 的 token 就能拿到当前可用模型。腾讯云不必再配管控面密钥，也不再维护 TokenHub 客户端。

## What Changes

- `{baseUrl}/models` 对全部已支持平台生效（`aliyun` 与 `tencent`），不按平台开关。`--platform` 只决定同步哪些平台：指定则只更新该平台；省略则同步全部平台。每个被同步的平台都必须先 `GET {baseUrl}/models`（Bearer token）。
- 成功且列表非空则写入 `model-list.json` 该平台键，并更新该平台全部 profile 的 `models`。
- 凭据来源：`sync-model-list` 使用已保存的该平台 profile；`token add` 在目录缺失而自动同步时，使用正在添加的 `baseUrl` 与 `token`。
- `/models` 失败、空列表或没有可用凭据时，该平台必须失败且不写对应键、不改 profile。不再使用 CLI 内置模型目录，不再调用 TokenHub。
- 删除 `catalog.ts`、`tencent-models.ts` 与 `TENCENTCLOUD_*`。`--help` 与 README 说明各平台都从 `{baseUrl}/models` 拉取。

## Capabilities

### New Capabilities

- （无）扩展已有 token-config。

### Modified Capabilities

- `token-config`: 全部已支持平台只从 `{baseUrl}/models` 取列表；去掉内置目录与 TokenHub。

## Impact

- 代码：`packages/token-config` 的同步路径（`store` / `sync-model-list` / `add`）；删除 `catalog.ts` 与 `tencent-models.ts`；帮助与 README。
- CLI：`sync-model-list` 与首次 `token add` 都依赖 `{baseUrl}/models`；不再使用内置目录或 `TENCENTCLOUD_*`。
- 依赖：无新运行时依赖（继续用 `fetch`）。
- 文档：`--help` 与 README。
