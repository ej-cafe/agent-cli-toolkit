## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`applyOpenCode` 目前用 `openCodeProviderId(platform)` 得到 `bailian` 或 `tencent`。`applyTools` 虽有 profile `name`，但只把 `TokenProfile`（不含 name）传给适配器。OpenCode 自定义 provider 以 `provider` 对象的键为 id，并用条目上的 `name` 作为 UI 显示名。不引入新依赖。

## Goals / Non-Goals

**目标：**

- `applyOpenCode` 使用调用方传入的 profile `name` 作为 provider 键，并写入显示名。
- 模型 upsert、凭据合并、仅新建时设 `npm` 的规则保持不变。

**非目标：**

- 把已有 `bailian` / `tencent` 条目迁到新键，或从 OpenCode 删除它们。
- 改 Claude Code 适配器或 `token-profile.json` 结构。
- 限制 profile 名称字符集（沿用现有 name 校验）。

## Decisions

### 1. provider 键与显示名都用 profile `name`

`applyOpenCode(name, profile)`：`id = name`。写入 `provider[id].name = name`（OpenCode 的显示名）。`options.apiKey` / `options.baseURL` / `models` 仍按现有合并逻辑更新。删除 `openCodeProviderId`。

**原因：** 规格要求用 name 定义 provider；OpenCode 的 id 是对象键，`name` 字段只影响 UI。两者对齐，切换时列表里看到的就是 profile 名。

**备选：** 键仍用 `bailian`/`tencent`，只改显示名。否决：多套同平台 profile 仍会互相覆盖。  
**备选：** 键用 name，不写显示名。否决：OpenCode UI 可能只显示 id 或空名称，和「用 name 定义」不一致。

### 2. 不迁移旧键

已存在的 `provider.bailian` / `provider.tencent` 当作其它 provider 保留。用户需在 OpenCode 里改选新的 `<name>` provider。

**原因：** 自动搬迁可能冲掉用户手改过的旧条目，也无法判断哪套 profile 曾对应 `bailian`。

## Risks / Trade-offs

- **已用 `bailian`/`tencent` 的用户要改选模型** → 缓解：README 写明按 profile 名称写入；旧键保留。
- **profile 名含空格或特殊字符时 OpenCode 是否接受** → 缓解：沿用现有 name 规则；若后续有问题再收紧校验。

## Migration Plan

无仓库内数据迁移。回滚即恢复按平台映射。用户本机 OpenCode 配置中新写入的 `provider.<name>` 不会随回滚自动删除。
