## Context

See proposal.md — Why。`applyPi` 仅在传入 `modelId` 时读写 `settings.json` 的 `defaultProvider` / `defaultModel`。`runTokenUse` 在未给 `--model` 时把 `undefined` 传给 `applyPi`。Claude Code 与 dsh 仍只在有 `--model` 时写默认模型。用户已确认：未给 `--model` 时用 `profile.models` 第一项，并覆盖已有值。

## Goals / Non-Goals

**Goals:**

- 目标含 `pi` 时总是写入 `defaultProvider`（profile 名）与 `defaultModel`。
- 无 `--model` 时 `defaultModel` 取 `models[0].id`；空列表则整次 `token use` 失败且不写工具配置。
- 保留 `settings.json` 其它字段；文件不存在则创建。

**Non-Goals:**

- 改 Claude Code / dsh / OpenCode 的默认模型规则。
- 改 pi `models.json` / `auth.json` 的字段语义。
- 按「仅当尚无默认时才写」或让用户另选「非第一项」。

## Decisions

### 1. 在 `use.ts` 解析 pi 的模型 id，再传给 `applyPi`

未给 `--model` 且目标含 `pi` 时，在调用任何 apply 之前取 `models` 第一项非空 `id`。空则 `fail`，从而 Claude / OpenCode / dsh 也不会被写入。已给 `--model` 时沿用现有校验（id 必须在列表中），原样传给 pi。

**Alternatives:** 在 `applyPi` 内自己挑第一项 — 失败发生在前面工具已写入之后，违反「不写入任何工具配置」。

### 2. `applyPi` 只要收到模型 id 就写 `settings.json`

调用方保证 pi 路径总能拿到 id。合并写入：`{ ...existing, defaultProvider: name, defaultModel: modelId }`。根节点不是对象时仍整次拒绝（读失败发生在写文件之前）。

**Alternatives:** 无模型 id 时在 `applyPi` 内再读 profile — 与决策 1 重复，且空列表时难以回滚已写的 `models.json`。

### 3. 保留场景名，改结论

主规格场景「未指定模型时保留启动默认」必须留在 MODIFIED 块里（归档不会丢掉已有场景名）。WHEN/THEN 改为：未给 `--model` 时用 `models` 第一项覆盖 `defaultProvider` / `defaultModel`。场景名不再描述「保留」。

## Risks / Trade-offs

- [不带 `--model` 的 `token use --tool pi` / `--all` 会改掉用户已设的 pi 启动模型] → 帮助写明；回滚需再执行一次 `token use` 或手改 `settings.json`。
- [`models` 顺序即默认模型] → 与「数组第一项」约定一致；要别的模型仍用 `--model`。
- [空 `models` 导致整次 use 失败，即使同时还选了 Claude] → 与「不得写入任何工具配置」一致；正常 `token add` 不会写出空列表。

## Migration Plan

发布后，下一次把 profile 应用到 pi 就会覆盖 `defaultProvider` / `defaultModel`。不迁移已有 `settings.json`。回滚代码后，已改过的默认值不会自动还原。
