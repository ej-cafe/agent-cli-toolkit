## 1. apiKeyEnv 与凭据文档

- [x] 1.1 修改 `apiKeyEnvForProfile`：由 profile `name` 派生 `NAME_API_KEY`（大写、非 `[A-Z0-9]` 换成 `_`，无 `AGENT_CLI_` 前缀），写入前用 `/^[A-Za-z_][A-Za-z0-9_]*$/` 校验。用临时 `DSH_HOME` 跑 `token use --tool dsh`：`work` → settings 中 `apiKeyEnv: WORK_API_KEY` 且 `.credentials.yaml` 的 `refs.WORK_API_KEY` 为 token；`tencent-token-plan` → `TENCENT_TOKEN_PLAN_API_KEY`；`version` 为无引号整数 `1`；根上无该键；`settings.yaml` 不含 token；凭据 `0600`、目录 `0700`
- [x] 1.2 在写 settings 之前规范化 `.credentials.yaml`：空文件创建 `version`/`refs`；扁平根键迁入 `refs`；`version: 1` 时把根上多余 POSIX 键迁入 `refs`；保留其它 `refs` 与 `records`；非法派生名或无法迁移则两文件都不写。用临时 `DSH_HOME` 确认：已有 `refs.DEEPSEEK_API_KEY` 与 `records` 保留；扁平 `DEEPSEEK_API_KEY` 迁入 `refs` 后仍在；根上 `AGENT_CLI_WORK_API_KEY` 迁入 `refs` 且根上消失；profile 名 `123` 非 0 且两文件未改

## 2. 检查

- [x] 2.1 在仓库根目录运行 `pnpm typecheck` 与 `pnpm build`，确认两者都通过
