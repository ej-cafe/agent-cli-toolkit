## Why

`token use` 写入 OpenCode 时按平台固定成 `bailian` / `tencent`，多套 profile 会互相覆盖同一 provider，也无法在 OpenCode 里用 profile 名称区分。现在改为用 profile 的 `name` 作为 provider，一套配置对应一个可选择的 provider。

## What Changes

- **BREAKING**：应用到 OpenCode 时，`provider` 下的键改为 profile 的 `name`，不再按 `aliyun` → `bailian`、`tencent` → `tencent` 映射。
- 写入该 provider 的 `name` 显示名为 profile 名称；`options.apiKey`、`options.baseURL` 与 `models` 的合并规则不变。
- 不删除、不迁移已有的 `bailian` / `tencent` 或其它 provider 条目。
- Claude Code 的写入路径不变。README 中关于 OpenCode provider id 的说明改为 profile 名称。

## Capabilities

### New Capabilities

- （无）本变更只改已有 OpenCode 写入行为。

### Modified Capabilities

- `token-config`: 修改「更新 OpenCode 的 provider」：provider id 与显示名使用 profile `name`。

## Impact

- 代码：`packages/token-config` 的 OpenCode 适配器（`openCodeProviderId` / `applyOpenCode`）以及 `token use` 传入 profile 名称。
- OpenCode：`~/.config/opencode/opencode.json`（或 `$XDG_CONFIG_HOME/opencode/opencode.json`）中的 `provider.<profile-name>`。
- 依赖：无新运行时依赖。
- 文档：根 README 中 `bailian` / `tencent` 的表述。
