## Why

模型列表已改为从各 profile 的 `{baseUrl}/models` 拉取，但存储与同步仍按平台共享：`model-list.json` 一份目录会扇出到同平台全部 profile。同平台若网关或套餐不同，会被错误写成同一份列表。需要把 models 的真相改到每个 profile 自己。

## What Changes

- **BREAKING** `profile.models` 成为唯一真相：每个 profile 独立保存自己的模型列表；同平台 profile 不再共享、不再互相覆盖。
- **BREAKING** 退役 `model-list.json`：系统不再读写该文件；已有文件可留在配置目录但被忽略。
- **BREAKING** `token add` 总是用正在添加的 `baseUrl`/`token` 请求 `{baseUrl}/models` 并只写入该 profile；不再复用「同平台已有目录」；拉取失败则不写 profile。
- **BREAKING** `token sync-model-list` 改为按 profile 同步：新增可选 `--name <profile>`；省略 `--name` 时同步全部（可被 `--platform` 过滤）。`--platform` 从「同步一个平台目录」变为「过滤要同步的 profile」。
- 每个目标 profile 只用自己的凭据拉 `/models`，成功则只改写该 profile 的 `models`；不得改写其它 profile，不得修改 Claude Code / OpenCode / dsh 配置。
- 多目标同步时：已成功的保留；失败的不写该 profile；命令以非 0 退出并在 stderr 说明失败项。
- `--help` 与 README 改为按 profile 同步的说明，去掉按平台目录 / `model-list.json` 的表述。

## Capabilities

### New Capabilities

- （无）

### Modified Capabilities

- `token-config`: 模型列表按 profile 独立存储与同步；退役平台级 `model-list.json`；调整 `token add` 与 `sync-model-list` 的标志与失败语义。

## Impact

- 代码：`packages/token-config` 的 `store.ts`、`commands/sync-model-list.ts`、`commands/add.ts`、`commands/token.ts`；`packages/commands` 的帮助文案；README。
- CLI：`sync-model-list` 增加 `--name`；`--platform` 语义变为过滤器；`token add` 每次都会请求 `/models`。
- 存量：已有 `token-profile.json` 中的 `models` 可继续使用，直到对该 profile 再次 sync 或重新 add；`model-list.json` 不再被读取。
- 依赖：无新运行时依赖。
