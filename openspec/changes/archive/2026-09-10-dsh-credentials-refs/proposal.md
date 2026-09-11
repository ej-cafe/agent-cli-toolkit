## Why

`token use --tool dsh` 目前把 `apiKeyEnv` 写成 `AGENT_CLI_<NAME>_API_KEY`，并把 token 写在 `$DSH_HOME/.credentials.yaml` 的根映射上。当前 DeepSeek Harness 凭据文档必须是 `version: 1`，密钥只允许出现在 `refs:` 下；根上多写一个键会让 DSH 拒绝整份文件。需要按 profile 名称生成引用名，并把值写进 `refs:`。

## What Changes

- **BREAKING**：`apiKeyEnv` 改为由 profile `name` 派生 POSIX 标识符（大写、非 `[A-Z0-9]` 换成 `_`，再加 `_API_KEY`，例如 `tencent-token-plan` → `TENCENT_TOKEN_PLAN_API_KEY`），不再使用 `AGENT_CLI_` 前缀。
- **BREAKING**：profile 的 token 必须写在 `.credentials.yaml` 的 `refs:` 下，与 `apiKeyEnv` 同一键；不得再写在根映射。文件仍为 `$DSH_HOME/.credentials.yaml`（不是 `.credential.yaml`）。
- 写入时必须保留 `version`、`records` 以及 `refs:` 中其它键；新建或升级文档时使用 `version: 1`。
- 若已有文件是 DSH 预发布扁平布局（根上直接是环境变量键、无 `version`），必须先把这些键迁到 `refs:` 再写入本次 token，避免 DSH 无法启动。
- 不得把 token 明文写入 `settings.yaml`。凭据文件权限与目录权限保持 `0600` / `0700`。
- Claude Code、OpenCode、`token delete`、帮助文案不在本次范围内。

## Capabilities

### New Capabilities

- 无

### Modified Capabilities

- `token-config`: 修改「更新 DeepSeek Harness 的 provider」：`apiKeyEnv` 命名规则，以及 `.credentials.yaml` 必须按 `version` / `refs` / `records` 写入。

## Impact

- 代码：`packages/token-config` 的 `apply/dsh.ts`（`apiKeyEnvForProfile` 与凭据 YAML 合并）。
- 用户文件：`$DSH_HOME/.credentials.yaml` 与对应 `settings.yaml` 中的 `apiKeyEnv`。
- 已用旧 CLI 写入的 `AGENT_CLI_*` 根键或扁平文档，在下次 `token use` 到 dsh 时按新布局收敛。
