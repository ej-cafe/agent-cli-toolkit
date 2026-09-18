## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`token use` 已支持 `claude-code` / `opencode` / `dsh`（`packages/token-config/src/commands/use.ts`，`AgentTool` 在 `types.ts`）。JSON 适配器走 `json-file.ts` 原子写；dsh 走 YAML。本机 pi（`@earendil-works/pi-coding-agent`）把用户配置放在 `~/.pi/agent/`：自定义 provider 在 `models.json` 的 `providers`，凭据在 `auth.json`（`{ type: "api_key", key }`），启动默认在 `settings.json` 的 `defaultProvider` / `defaultModel`。可用 `PI_CODING_AGENT_DIR` 覆盖 agent 目录（等同 pi 自身 `getAgentDir()`）。`models-store.json` 是内置目录缓存，不是自定义入口。

## Goals / Non-Goals

**目标：**

- 新增 `apply/pi.ts`，与现有适配器并列；`use.ts` 把 `pi` 纳入 `--all`、交互列表与 `--model` 校验。
- 合并写入 `models.json` / `auth.json`（及可选的 `settings.json`）；保留未触及的键与其它 provider。
- `auth.json` 权限 `0600`；token 不进 `models.json`。

**非目标：**

- 读写项目目录 `.pi/` 或 `models-store.json`。
- 用 Anthropic / `claudeBaseUrl` 作为 pi 的 `baseUrl`（与 dsh 一致，用 OpenAI 兼容 `baseUrl`）。
- 在 `models.json` 里写明文 `apiKey`（凭据只进 `auth.json`）。
- `token delete` 时清理 pi 的 provider / auth 键。
- 自动补 `cost` / `contextWindow` / `compat` 等可选模型字段。
- 新增运行时依赖或测试框架。

## Decisions

### 1. Agent 目录：`PI_CODING_AGENT_DIR` 否则 `~/.pi/agent`

`piAgentDir()`：`process.env.PI_CODING_AGENT_DIR?.trim()` 非空则用之，否则 `join(homedir(), ".pi", "agent")`。文件为同目录下的 `models.json`、`auth.json`、`settings.json`。不走 `XDG_CONFIG_HOME`。

**原因：** 与 pi 源码 `getAgentDir()` 一致；用户确认 home 为 `.pi`，agent 配置在其下的 `agent/`。

**备选：** 只认 `~/.pi` 根、或另设 `PI_HOME`。否决：pi 实际读写的是 `agent` 子目录，且官方覆盖变量是 `PI_CODING_AGENT_DIR`。

### 2. Provider 写在 `models.json` 的 `providers.<name>`

形状：

```json
{
  "providers": {
    "<name>": {
      "baseUrl": "<profile.baseUrl>",
      "api": "openai-completions",
      "authHeader": true,
      "models": [{ "id": "...", "name": "..." }]
    }
  }
}
```

- `baseUrl` = `profile.baseUrl`（不是 `claudeCompatibleUrl`）
- `api`: `openai-completions`
- `authHeader`: `true`（Bearer）
- `models`: 数组按 `id` upsert `name`，保留其它字段与 profile 未列出的旧项
- 不写 `apiKey`

**原因：** 与 [pi Custom Models](https://pi.dev/docs/latest/models) 一致；OpenAI 网关与 dsh 的 `openai-completions` 对齐。

**备选：** `anthropic-messages` + Claude 地址。否决：与 dsh/OpenCode 分工冲突，且阿里云/腾讯云 token 主路径是 OpenAI 兼容。

### 3. 凭据只写 `auth.json`

```json
{
  "<name>": { "type": "api_key", "key": "<token>" }
}
```

原子写后 `chmod 0o600`。根已存在且非对象则 `fail`，两文件（及未写完的 settings）都不落脏状态：先在内存合并，校验通过后再写。

**原因：** pi 凭据解析优先 `auth.json`；文档建议自定义 provider 可省略 `models.json` 的 `apiKey`。比把 token 写进 `models.json` 更安全，也与 dsh 的「settings 不含 token」一致。

**备选：** `models.json` 内嵌 `apiKey`。否决：明文进模型目录、且与 `/login` 路径不一致。

### 4. `--model` 写 `settings.json` 的 `defaultProvider` + `defaultModel`

目标含 `pi` 且给了 `--model` 时：`defaultProvider` = profile name，`defaultModel` = 模型 id。未给 `--model` 则不改这两键，也不为缺省模型单独创建 `settings.json`。

**原因：** pi 用这对字段作为启动默认（`/model` Ctrl+S 同路径），自定义 provider 必须同时设 provider。

**备选：** 只写 `defaultModel`。否决：多 provider 下仅 model id 可能歧义。

### 5. `token use` 扩展

`AgentTool` 增加 `"pi"`。交互提示增加 `4) pi`。`resolveModel`：`--model` 在目标含 `claude-code` / `dsh` / `pi` 时通过。`applyTools` 增加 `applyPi(name, profile, modelId)`。`delete` 仍只改 `token-profile.json`。

帮助与 README：`--tool` 列出 `pi`；`--model` 文案含 pi；`--all` 含 pi。

## Risks / Trade-offs

- **写坏用户 JSON** → 缓解：根非对象则中止并保留原文件；只改目标 provider / auth 键与可选默认字段。
- **网关需要额外 `compat`** → 缓解：规格不自动写；再次 sync 保留用户手改字段。
- **`authHeader: true` 与部分网关不兼容** → 缓解：与 OpenAI 兼容 Bearer 惯例一致；若遇例外可后续改为可配置，本变更不引入开关。
- **rename 后 umask 放宽 `auth.json` 权限** → 缓解：写入后显式 `chmod 0o600`。

## Migration Plan

无需改仓库内数据。本机首次 `--tool pi` 或 `--all` 创建/合并 `~/.pi/agent` 下文件。回滚 CLI 后文件可留着，pi 继续用。不迁移、不删除用户已有的其它 provider。
