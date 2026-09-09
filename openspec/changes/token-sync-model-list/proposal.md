## Why

平台模型目录目前只写在 CLI 源码里，添加 profile 时一次性拷进 `token-profile.json`，之后无法按平台刷新。需要把模型列表落到配置目录的 JSON，并提供按平台同步的命令；添加时若该平台列表还不存在，则自动补齐。

## What Changes

- 新增 `agent-cli token sync-model-list [--platform <aliyun|tencent>]`：按平台把模型列表写入配置目录 JSON；未给 `--platform` 时同步两个平台。
- 模型目录以 JSON 持久化在全局配置目录（与 `token-profile.json` 同级），按 `platform` 分键存储 `id` 与 `name`。
- `token add` 写入 profile 的 `models` 时读取该 JSON；若对应平台列表不存在或为空，必须先同步再写入。
- 同步某平台时，必须同时把该平台下已有 profile 的 `models` 更新为同一份列表。
- `--help` 与 README 列出 `sync-model-list`。

## Capabilities

### New Capabilities

- （无）扩展已有 token-config。

### Modified Capabilities

- `token-config`: 增加按平台同步模型列表；目录存于配置 JSON；`token add` 在列表缺失时自动同步。

## Impact

- 代码：`packages/token-config` 的存储、`token add`、新子命令；`packages/commands` 的帮助。
- CLI：`agent-cli token sync-model-list`。
- 依赖：无新运行时依赖。
- 文档：`--help` 与 README。
- 存量：已有 `token-profile.json` 不改结构；首次同步或添加会创建模型目录 JSON。
