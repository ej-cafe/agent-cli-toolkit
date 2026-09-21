## 1. pi 启动默认

- [x] 1.1 在 `use.ts` 于任何 apply 之前解析 pi 的模型 id：已给 `--model` 时沿用现有校验；未给且目标含 `pi` 时取 `models` 第一项非空 `id`，空列表则失败且不写工具配置。`applyPi` 只要目标是 pi 就合并写入 `settings.json` 的 `defaultProvider`（profile 名）与 `defaultModel`，保留其它字段；根节点非对象则拒绝且不改任一 pi 文件。用临时 `PI_CODING_AGENT_DIR` 确认：未给 `--model` 时覆盖已有默认且用第一项而非后续项；`--model` 仍用指定 id；空 `models` 时 `models.json` / `auth.json` / `settings.json` 均不新增或改写；`--tool opencode --model` 仍拒绝；未给 `--model` 的 `--tool claude-code` 不写 `ANTHROPIC_MODEL`

## 2. 文档

- [x] 2.1 更新 help、`token` 用法与 README：应用到 pi 会设置 `defaultProvider` 与 `defaultModel`；有 `--model` 用该 id，否则用模型列表第一项。确认 `pnpm build`、`pnpm typecheck` 通过，且 `agent-cli --help` 出现该说明
