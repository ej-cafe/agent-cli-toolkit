## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`applyClaudeCode` 目前只写 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_BASE_URL`。`runTokenUse` 用 `parseArgs` 解析 `--all` 与可重复 `--tool`。profile 的 `models` 已在 `token add` 时写入。不引入新依赖。本变更不改 OpenCode provider 键（那是独立变更 `opencode-provider-by-name`）。

## Goals / Non-Goals

**目标：**

- 给 `token use` 增加可选 `--model`，校验后只传给 Claude Code 适配器。
- 未给 `--model` 时保持现有「不碰 `ANTHROPIC_MODEL`」行为。

**非目标：**

- 为 OpenCode 设置默认模型或按 `--model` 裁剪 `models`。
- 交互问答选择模型（只接受标志）。
- 一次指定多个模型。

## Decisions

### 1. 标志 `--model`，id 必须在 profile.models 中

在解析工具目标之后、写入之前：若有 `--model`，先 `getProfile`，确认 `models` 里存在该 `id`，再确认目标含 `claude-code`。缺任一条件则 `fail`，两个适配器都不调用。`--all --model` 视为目标含 Claude Code，OpenCode 仍走原来的 `applyOpenCode`（不接收 model）。

**原因：** 规格要求未知模型与「仅 OpenCode」都不得写文件；先校验再写最简单。

**备选：** 仅 OpenCode 时忽略 `--model`。否决：静默忽略容易让用户以为 OpenCode 也切了模型。

### 2. 写入 `env.ANTHROPIC_MODEL`

`applyClaudeCode(profile, modelId?: string)`：有 `modelId` 时设置 `env.ANTHROPIC_MODEL`；否则不增不删该键。仍只合并这两个（或三个）键。

**原因：** Claude Code 用该环境变量作为默认模型；与既有「不改其它 env 键」一致。

**备选：** 写 `ANTHROPIC_DEFAULT_OPUS_MODEL` 等。否决：规格要的是本次指定的单一默认模型。

## Risks / Trade-offs

- **用户在 Claude Code 里手改过默认模型，下次不带 `--model` 的 use 不会覆盖** → 缓解：这是规格要求；要用新模型必须再传 `--model`。
- **模型 id 与云平台实际可用列表可能过期** → 缓解：只校验 profile 内置目录，与 `token add` 同源。

## Migration Plan

无存量数据迁移。回滚即停止写入 `ANTHROPIC_MODEL`；用户本机已写入的该键不会随回滚删除。
