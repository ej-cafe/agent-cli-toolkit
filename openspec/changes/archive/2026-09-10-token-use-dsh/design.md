## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`token use` 在 `packages/token-config/src/commands/use.ts` 解析 `--all` / `--tool` / `--model`；`AgentTool` 目前只有 `claude-code` 与 `opencode`。适配器是 JSON 合并写入：`apply/claude-code.ts`、`apply/opencode.ts`，原子写见 `json-file.ts`。仓库无 YAML 依赖、无测试框架。DSH 官方把用户可改配置放在 `$DSH_HOME/settings.yaml`（默认 `~/.dsh/settings.yaml`），密钥在同目录 `.credentials.yaml`（根映射 `ENV_NAME: value`），`settings.yaml` 只放 `apiKeyEnv` 引用。

## Goals / Non-Goals

**目标：**

- 新增 `apply/dsh.ts`，与现有适配器并列；`use.ts` 把 `dsh` 纳入 `--all`、交互列表与 `--model` 校验。
- 合并写入 YAML：保留未触及的键、注释与其它 provider。
- 凭据文件 `0600`、目录 `0700`；token 不进 `settings.yaml`。

**非目标：**

- 写入 `$DSH_HOME/.env` 或项目目录下的 `.dsh/`。
- 用 Anthropic 协议或 `claudeCompatibleUrl` 作为 dsh 的 `baseURL`。
- 写入 `llm-deepseek`、顶层 `providers`，或 `settings.yaml` 里除 `llm-pi-ai.providers` 以外的其它 provider 树。
- 把默认模型写进 provider 条目（必须用顶层 `agent-default-model`）。
- 自动补 `compat`（如 `maxTokensField`）。
- `token delete` 时删除 dsh 里对应 provider / 凭据键。
- 引入测试运行器。

## Decisions

### 1. 配置根目录：`DSH_HOME` 否则 `~/.dsh`

`dshHome()`：`process.env.DSH_HOME?.trim()` 非空则用之，否则 `join(homedir(), ".dsh")`。文件为 `settings.yaml` 与 `.credentials.yaml`。不走 `XDG_CONFIG_HOME`。

**原因：** 与 DSH 文档一致；用户说的 `.dsh/settings.yaml` 即该默认路径。

**备选：** 当前工作目录 `.dsh/`。否决：DSH 热加载的是 Harness home，不是项目树。

### 2. 运行时依赖 `yaml`

仅在 `@agent-cli-toolkit/token-config` 增加 `yaml`（eemeli）。用 `parseDocument` 读入、改 CST/Document、再 stringify，尽量保留未改节点的注释。根不是 map 则 `fail`，两文件都不写。凭据文档无包裹层，按根映射 upsert 一个键。

原子写：先写同目录临时文件再 `rename`；凭据 `writeFileSync` 使用 `mode: 0o600`；对 `$DSH_HOME` `mkdirSync(..., { recursive: true, mode: 0o700 })`，写入凭据后 `chmod` 目录 `0o700`、文件 `0o600`。

**原因：** 现有 `settings.yaml` 含用户注释与其它插件块，不能当 JSON 处理。手写 YAML 无法安全合并。

**备选：** 无依赖拼接字符串。否决：已有文件结构未知。`js-yaml`：默认丢注释。

实现前须确认该依赖（AGENTS.md）。若用户拒绝，本设计不能按规格合并已有 YAML。

### 3. 模型 provider 只写在 `llm-pi-ai.providers`

每次应用一套 profile，只 upsert `settings.yaml` 里这一条路径：`llm-pi-ai.providers.<profile-name>`。不创建平行的 provider 树。形状如下（`<name>` 为 profile 名）：

```yaml
llm-pi-ai:
  providers:
    <name>:
      displayName: <name>
      api: openai-completions
      baseURL: <profile.baseUrl>
      apiKeyEnv: AGENT_CLI_<NAME>_API_KEY
      models:
        - id: ...
          name: ...
```

字段：

- `displayName` = profile name
- `api`: `openai-completions`
- `baseURL`: `profile.baseUrl`（不是 `claudeCompatibleUrl`）
- `apiKeyEnv`: `AGENT_CLI_` + `name.toUpperCase()` 中非 `[A-Z0-9]` 换成 `_` + `_API_KEY`
- `models`: 数组 upsert（按 `id` 合并 `name`，保留其它字段，保留 profile 未列出的旧项）

**原因：** DSH 自定义网关走 `llm-pi-ai` + `openai-completions`；阿里云/腾讯云 token 的 OpenAI 地址在 `baseUrl`。OpenCode 仍用 Anthropic 地址，互不影响。

### 4. 默认模型只写在顶层 `agent-default-model`

`--model` 且目标含 `dsh` 时，只改 `settings.yaml` 顶层的 `agent-default-model`，不写进 `llm-pi-ai.providers` 条目：

```yaml
agent-default-model:
  provider: <name>
  model: <模型 id>
```

`provider` 为本次 profile 名（与 `llm-pi-ai.providers` 下的键相同），`model` 为 `--model` 的 id。未给 `--model` 时不得改写已有的 `agent-default-model`。

**原因：** DSH 用这一项作为会话默认路由，与 provider 目录分开。

**备选：** 把默认模型写在 provider 上（如 `defaultModel`）。否决：DSH 不认这条路径。

**备选：** `api: anthropic` + Claude 地址。否决：手写路由文档以 `openai-completions` 为准，且会与 OpenCode 抢同一套 Claude URL 语义。

### 5. `token use` 扩展

`AgentTool` 增加 `"dsh"`。交互提示增加 `3) dsh`。`resolveModel`：`--model` 在目标含 `claude-code` 或 `dsh` 时通过；仅 `opencode` 仍 `fail`。`applyTools` 增加 `applyDsh(name, profile, modelId)`。`delete` 仍只改 `token-profile.json`。

帮助与 README：`--tool` 列出 `dsh`；`--model` 改为对 Claude Code 与 dsh 有效；`--all` 文案含 DeepSeek Harness。

## Risks / Trade-offs

- **写坏用户 YAML** → 缓解：解析失败则中止并保留原文件；只改目标 provider 与一个凭据键。
- **`yaml` stringify 重排无关键** → 缓解：用 Document 就地改节点；验收时用含注释的夹具确认其它块仍在。
- **网关需要 `compat` 才能通** → 缓解：规格不自动写；用户可在同一 provider 上手改，再次 sync 会保留未覆盖字段。
- **process env 已有同名 `AGENT_CLI_*` 时 DSH 优先用环境变量** → 缓解：这是 DSH 分层规则；引用名带 `AGENT_CLI_` 前缀降低碰撞。
- **rename 后 umask 可能放宽凭据权限** → 缓解：rename 后显式 `chmod 0o600`。

## Migration Plan

无需改仓库内数据。本机首次 `--tool dsh` 或 `--all` 创建 `$DSH_HOME` 下两个文件。回滚 CLI 后这两个文件可留着，DSH 继续用。不迁移、不删除用户已有的其它 provider。
