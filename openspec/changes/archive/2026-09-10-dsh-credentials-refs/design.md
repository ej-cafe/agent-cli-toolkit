## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`apply/dsh.ts` 已能合并写入 `settings.yaml` 的 `llm-pi-ai.providers.<name>`，但 `apiKeyEnvForProfile` 仍生成 `AGENT_CLI_<NAME>_API_KEY`，凭据用 `credentials.set(apiKeyEnv, token)` 写在 `.credentials.yaml` 根上。当前 DSH `dsh-credentials-local` 只接受 `version: 1` 文档：密钥在 `refs`，授权记录在 `records`；根上多一个键会启动失败。YAML 读写仍走现有 `yaml-file.ts`，不新增依赖。

## Goals / Non-Goals

**目标：**

- 只改 `apply/dsh.ts` 的引用名与凭据文档布局；settings 其它字段、`--model`、路径解析保持原样。
- 写入前先规范化凭据文档，失败则两文件都不写。
- `version` 必须是 YAML 整数 `1`（不能是字符串 `"1"`），否则 DSH 会拒绝。

**非目标：**

- 改 Claude Code / OpenCode 适配器、帮助、README、`token delete`。
- 调用 DSH 的 `ctx.credentials.set` 或改 `$DSH_HOME/.env`。
- 删除 `refs` 里遗留的 `AGENT_CLI_*` 键（只处理根上的未知键）。
- 把 `apiKeyEnv` 写成未经派生的原始 `name`（含连字符，DSH 引用语法不接受）。

## Decisions

### 1. 引用名：`NAME_API_KEY`，不要 `AGENT_CLI_` 前缀

`apiKeyEnvForProfile(name)`：`name.toUpperCase().replace(/[^A-Z0-9]/gu, "_") + "_API_KEY"`。写入 settings 与 `refs` 前用 `/^[A-Za-z_][A-Za-z0-9_]*$/` 校验（与 DSH `credentialRef` 相同）；失败则 `fail`。

**原因：** 与用户现有 `tencent-token-plan` → `TENCENT_TOKEN_PLAN_API_KEY` 一致；去掉前缀避免和 DSH 文档里手写的键对不上。原始 `name` 常含 `-`，不能当环境变量名。

**备选：** 继续 `AGENT_CLI_` 前缀。否决：用户要求按 profile.name 设定变量名。只用大写 name、不加 `_API_KEY`。否决：与现有 `TENCENT_TOKEN_PLAN_API_KEY` 不一致。

### 2. 凭据只写 `refs`，根布局与 DSH 对齐

路径仍是 `dshCredentialsPath()` → `.credentials.yaml`。规范化顺序：

1. 空文档或不存在：`version: 1`，创建 `refs` 映射。
2. 无 `version`：把根上每个 POSIX 标识符键（及节点）挪进 `refs`，再设 `version: 1`；非 POSIX 键则 `fail`。
3. `version === 1`：把根上除 `version` / `refs` / `records` 外的 POSIX 键挪进 `refs`；`refs` 缺失或 null 则创建映射；`refs` 不是映射、`version` 不是整数 `1`、或根上有无法迁移的键则 `fail`。
4. `refs.set(apiKeyEnv, profile.token)`。保留 `records` 与其它 `refs` 键。迁移时用 `get` + `delete` + `set` 挪节点，尽量保住注释。

**原因：** 与 `dsh-credentials-local` 的 `parseCredentialsDocument` 一致；旧 CLI 写在根上的 `AGENT_CLI_*` 必须搬走，否则 DSH 报 unknown top-level key。

**备选：** 只支持已有 `version: 1` 的文件，扁平文档让用户手改。否决：本 CLI 自己写过扁平根映射，下次 `token use` 必须能修好。

### 3. 先校验再写两个文件

在改 settings Document 之前完成 `apiKeyEnv` 校验与凭据规范化。然后照旧：先 `writeYamlAtomic` settings，再写凭据（`0600` / `0700`）。规范化失败时内存里的 settings 改动丢弃，磁盘不变。

**原因：** 非法名称或坏凭据文档不应留下半更新的 provider。

## Risks / Trade-offs

- **`yaml` 把 `version` 写成 `"1"`** → 缓解：`set("version", 1)` 用数字；验收时断言文件含无引号的 `version: 1`。
- **搬家时弄丢 `records` 或其它 `refs`** → 缓解：只挪未知根键；禁止 `Document` 整份重建。
- **新引用名与 process env 里已有同名变量冲突** → 缓解：DSH 规定环境变量优先；这是 DSH 分层，不在 CLI 里改名躲避。
- **旧 `AGENT_CLI_*` 仍留在 `refs`** → 缓解：无害多余密钥；规格不要求删除。用户可手删。

## Migration Plan

无需改仓库内数据。用户下次 `token use <name> --tool dsh`（或 `--all`）会改本机 `$DSH_HOME` 两个文件。若 DSH 已因根上多键无法启动，这次写入应把文档收成 `version` / `refs` / `records`。回滚 CLI 后，新布局文件 DSH 仍能读；旧 CLI 再 use 会再次把键写回根上并破坏文档。
