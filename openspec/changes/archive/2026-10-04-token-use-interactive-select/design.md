## Context

`token use` 的实现集中在 `packages/token-config/src/commands/use.ts`：解析标志 → 解析工具（`--all` / `--tool`，否则 `promptTools()` 问答）→ 存在性检查并分流 ready/skipped → `resolveModel()` 校验 `--model` → `applyTools()` 写入。`promptTools()` 目前自己创建并关闭一个 `readline` 会话。

`token add`（`src/commands/add.ts`）已经确立了交互约定：仅在 `process.stdin.isTTY === true` 且字段缺失时才进入问答；非 TTY 缺字段立即 `fail`；问答只问缺失字段。本次沿用同一约定。

参见 `proposal.md` 了解动机，`specs/token-config/spec.md` 了解行为契约。

## Goals / Non-Goals

**Goals:**

- 在交互式终端补齐两个此前必须显式提供的输入：profile 名称、默认模型。
- 让新问答与现有工具问答共用一次 `readline` 会话，提示顺序 profile → 工具 → 模型。
- 保持非 TTY 与全标志路径的可观察行为不变，脚本不受影响。

**Non-Goals:**

- 不改各工具配置文件格式或写入逻辑（`apply/*.ts`）。
- 不引入交互式 UI 库（继续用 `node:readline/promises`）。
- 不改 `token add` / `sync-model-list` / `usage` 的问答。
- 不做 profile 的新增/删除（仍由 `add` / `delete` 负责）。

## Decisions

### 单一 readline 会话，按需创建

把 `promptTools()` 内联的会话改为一个延迟创建的共享 `readline` 会话：只有当本次运行确实需要至少一次问答时才创建，并在所有问答结束后 `close()`。三个问答函数（profile、工具、模型）接收同一个会话。

替代方案：每个问答各自开一个会话。实现改动更小，但 `node:readline` 对同一 stdin 反复创建/关闭容易丢字节，且新增两个问答会放大该问题。选择共享会话。

### 提示顺序 profile → 工具 → 模型

模型菜单依赖两个前置结果：哪个 profile（决定可选模型列表）和哪些工具真正会写入（决定是否需要模型、以及本次目标集合）。因此只能放在工具选择与存在性检查之后。profile 是其余一切的前提，放最前。

### 模型问答的触发条件

仅当同时满足以下条件才提示：未传 `--model`、存在 ready 的模型相关工具（`claude-code` / `dsh` / `pi`）、该 profile `models` 非空、且 `stdin.isTTY`。四个条件缺一即不提示，按「未传 `--model`」的原规则处理。空回答同样视为未选择。

替代方案：只要未传 `--model` 就提示。会在 profile 没有模型时显示空菜单，也会在目标只有 OpenCode 时问一个用不到的模型，故选当前方案。

### 空回答语义与现有回退一致

空回答 = 未选择模型：`pi` 仍回退到 `models[0].id`，`claude-code` / `dsh` 保留已有值。非空回答构造一个与 `--model` 相同的已校验 id，复用 `resolveModel()` 之后的同一写入路径，因此无需为「交互选中的模型」新增写入分支。

### 交互选择的编号/名称解析

profile 菜单接受编号或名称；模型菜单接受编号或 id。沿用 `promptTools()` 现有的「编号或 id」解析风格，解析失败一律 `fail`，不写入任何配置。

### 非 TTY 与全标志路径保持原样

`--model` 给定、`<name>` 给定、`stdin` 非 TTY 时不进入任何新问答。profile 缺省且非 TTY、或没有任何已保存 profile 时，先 `fail`（不创建会话），退出码非 0。

## Risks / Trade-offs

- [现有测试用单行 stdin 且部分会触发 dsh 问答] → 选中 dsh 后会多一次模型问答，单行 stdin 在第二次询问时遇到 EOF。缓解：为受影响用例补足 stdin 行或改用 OpenCode（模型无关）路径；`withStdin` 支持多行文本。
- [共享会话在提前 `fail` 时可能未关闭] → 用 `try/finally` 关闭已创建的会话，保证异常路径不泄漏，也不挂起进程。
- [非 TTY 判定依赖 `process.stdin.isTTY`] → 与 `token add` 完全一致，测试通过 `withStdin` 替换 stdin 对象来覆盖交互分支。
- [菜单输出影响 stdout 断言] → 菜单沿用现有「写 stdout」约定，写入成功的汇总行仍是 `已将 profile <name> 应用到: ...`，依赖该行的既有断言不变。

## Migration Plan

无数据迁移。命令语法向后兼容：`<name>` 从必填位置参数变为可选（省略时仅交互选择），`--model` 行为仅在交互式终端新增提示。回滚只需还原 `use.ts` / `token.ts` / 帮助与 README 文案。

## Open Questions

无。