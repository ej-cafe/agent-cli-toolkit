## 1. `token use` 交互选择实现

- [x] 1.1 在 `packages/token-config/src/commands/use.ts` 把 `promptTools()` 自建的 `readline` 会话改为一个延迟创建、profile/工具/模型三个问答共用的会话，并在 `try/finally` 中 `close()`；验证：`node --import tsx --test packages/token-config/test/use.test.ts` 中既有非交互用例仍通过且不挂起（仓库无 per-package test 脚本，统一从根目录跑）
- [x] 1.2 让 `<name>` 变为可选位置参数：省略且在交互式终端（`process.stdin.isTTY === true`）时列出全部已保存 profile（接受编号或名称）并选中；省略且非 TTY、或没有任何已保存 profile 时 `fail` 且不创建会话；验证：新增用例「交互选择 profile」「非交互省略 name 时拒绝」「没有已保存 profile 时拒绝」通过
- [x] 1.3 在工具选择与存在性检查之后加入模型问答：仅当未传 `--model`、本次 ready 工具含 `claude-code`/`dsh`/`pi` 之一、该 profile `models` 非空且 stdin 为 TTY 时，列出模型 `id`（可附 `name`）并接受编号或 id，空回答视为未选择；选中 id 复用与 `--model` 相同的校验与写入路径；验证：新增用例「交互选择默认模型写入 Claude Code」「交互选择默认模型写入 pi」「模型问答空回答时保留 Claude 默认」「模型问答空回答时 pi 用列表第一项」「profile 无模型时不进入模型问答」「非交互省略 --model 时不进入模型问答」「显式 --model 时不进入模型问答」通过
- [x] 1.4 更新 `packages/token-config/src/commands/token.ts` 中 `use` 的 `usage` 与 `hint`：位置参数写作 `[<name>]`，并说明省略 `<name>` 可在交互式终端选择 profile、省略 `--model` 可交互选择默认模型；验证：`pnpm exec agent-cli --help` 的 `token use` 用法行含 `[<name>]`，`token use` 提示含交互选择说明

## 2. 帮助与中文文档

- [x] 2.1 更新 `packages/commands/src/help.ts`：Usage 里 `token use` 改为 `[<name>]`，`Commands` 与 `Flags`（`--model`）文案补充「省略 `<name>` / `--model` 可在交互式终端选择」以及 pi `defaultModel` 支持交互选择；验证：`packages/commands/test/help.test.ts` 新增/更新断言通过
- [x] 2.2 更新 `README.md` 的 `## token use`：用法行改 `[<name>]`，说明省略 `<name>` 与 `--model` 时的交互选择、提示顺序 profile → 工具 → 模型、空回答/非 TTY 保持原行为，并补一条省略参数的示例；验证：README 文案与 `--help` 一致，且不含真实密钥

## 3. 测试

- [x] 3.1 扩展 `packages/token-config/test/use.test.ts`：为 1.2 / 1.3 的每个新场景加用例（用 `withStdin` 提供多行输入），并把既有的 dsh 单行 stdin 用例补足行数或改用 OpenCode 路径以免模型问答遇 EOF；验证：`pnpm --filter @agent-cli-toolkit/token-config test` 全绿
- [x] 3.2 扩展 `packages/commands/test/help.test.ts`：断言 `--help` 说明 `token use` 可省略 `<name>` 与 `--model` 并交互选择；验证：`pnpm --filter @agent-cli-toolkit/commands test` 全绿

## 4. 检查

- [x] 4.1 在仓库根目录运行 `pnpm typecheck` 并通过
- [x] 4.2 在仓库根目录运行 `pnpm test` 并通过
- [x] 4.3 运行 `openspec validate token-use-interactive-select` 并以退出码 0 结束（RFC 2119 英文 MUST 警告与项目中文 spec 用「必须」的约定一致，可接受）