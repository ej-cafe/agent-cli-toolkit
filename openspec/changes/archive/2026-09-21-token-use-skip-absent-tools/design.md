## Context

See proposal.md — Why。`runTokenUse` 在 `packages/token-config/src/commands/use.ts` 里按候选工具直接调用 `applyClaudeCode` / `applyOpenCode` / `applyDsh` / `applyPi`。`writeJsonAtomic` 与 `writeYamlAtomic` 会对文件父目录 `mkdirSync({ recursive: true })`，`applyDsh` 还会 `mkdirSync(dshHome())`。因此配置目录不存在时会被创建。四个 apply 都不检查程序是否在 `PATH` 上。`token usage` 查找 `bl` 的方式是真正执行命令；这里不能照搬，因为不能启动 `claude` / `opencode` / `dsh` / `pi`。

目录解析已经存在：Claude 为 `dirname(claudeSettingsPath())`（`~/.claude`），OpenCode 为 `dirname(openCodeConfigPath())`，DeepSeek Harness（dsh）为 `dshHome()`，pi 为 `piAgentDir()`。

## Goals / Non-Goals

**Goals:**

- 写入前用同一套判定：配置目录是目录，且 `PATH` 上有对应可执行文件。
- 未通过的工具不调用会建目录的写入，并在 stderr 说明缺的是目录、程序或两者。
- 已有 apply 单测在目录已存在时仍能写入；缺目录或缺程序的用例不产生目录。

**Non-Goals:**

- 改 `writeJsonAtomic` / `writeYamlAtomic` 的一般语义（父目录已存在时仍可创建文件）。
- 改进行中的 `token-use-pi-defaults`：pi 实际写入时如何选 `defaultModel` 保持现状。
- 探测 macOS `.app` 包或非 `PATH` 安装位置。

## Decisions

### 1. 存在性判定集中在一个函数，apply 与 `token use` 共用

新增按工具返回「可写 / 缺目录 / 缺程序 / 两者都缺」的函数。目录用现有路径函数加 `stat`：`ENOENT` 或缺的不是目录算缺目录；其它 `stat` 错误仍失败，不当成跳过。程序名固定为 `claude`、`opencode`、`dsh`、`pi`。在 `PATH`（按 `path.delimiter` 拆分）里找同名且 `X_OK` 的文件，不搜索当前目录，不 `spawn`。

`runTokenUse` 在交互或 `--tool` / `--all` 得到候选之后做过滤，只对可写工具调用 apply，并用过滤后的列表做 `--model` 校验与 stdout。apply 函数入口再查一次：不可写则直接返回、不写文件。这样单测直接调用 apply 时也不会建目录。

**Alternatives:** 只在 `use.ts` 过滤 — `apply*.ts` 仍会通过递归 `mkdir` 建目录。用 `execFile(name)` 探测 — 可能启动代理或产生副作用。

### 2. 去掉「为了写入而创建工具根目录」

`applyDsh` 删除 `mkdirSync(dshHome())`。目录已存在时，仍可 `chmod` 该目录，并让现有原子写创建目录内的文件。不可写时不得调用这些写函数。`writeJsonAtomic` / `writeYamlAtomic` 保持对已有父目录的 `mkdir`（已存在则无操作）。

**Alternatives:** 给写函数加 `recursive: false` — 会波及 profile 存储等其它调用方。

### 3. 过滤发生在 pi 模型 id 解析之前

当前 `applyTools` 只要候选含 `pi` 就会取模型 id（无 `--model` 时用列表第一项）。被跳过的 pi 不得进入该分支，以免空模型列表把整次命令打失败。profile 不存在仍在写文件和「全部跳过、退出码 0」之前拒绝。

stderr 用现有中文风格，用显示名点名被跳过的工具并区分缺目录与缺程序。DeepSeek Harness（dsh）写作 `DeepSeek Harness（dsh）`，交互菜单、stdout 和帮助同样使用该显示名；`--tool` 仍接受 `dsh`，`PATH` 上的程序名仍是 `dsh`。全部跳过时 stdout 不输出「已将 profile … 应用到」。

**Alternatives:** 跳过也算失败并返回非 0 — 与「忽略」不符。

### 4. 测试用临时 `PATH` 与已存在的配置目录

可写路径：配置目录用 `mkdtemp`（dsh / pi / OpenCode 的现有夹具已经这样），并在临时目录放 `0o755` 的同名空文件，把 `PATH` 指到该目录。Claude 依赖 `os.homedir()`，测试必须设置 `HOME` 后再解析 `~/.claude`。每个用例结束恢复 `PATH` 与 `HOME`，避免碰到开发者本机的真实配置或真实二进制。

## Risks / Trade-offs

- [只认 `PATH` 上的命令名，GUI 安装或不在 `PATH` 的二进制会被跳过] → 与规格一致；帮助说明需要程序在 `PATH` 上。
- [目录在但用户从未跑过该工具、里面没有配置文件] → 仍写入并创建文件；只拒绝创建目录本身。
- [现有 apply 单测在目录存在但 `PATH` 上没有对应程序时会变为不写文件] → 这些用例补上可执行桩。
- [与 `token-use-pi-defaults` 都改 `use.ts`] → 本变更只把「是否包含 pi」换成「过滤后是否包含 pi」，不改默认模型取值。

## Migration Plan

无数据迁移。已安装并跑过的工具（目录和程序都在）行为不变。此前靠 `token use` 顺带建出 `~/.claude`、OpenCode 配置目录、`~/.dsh` 或 `~/.pi/agent` 的用法不再建目录；需要先安装程序并让该目录存在。回滚即恢复递归创建目录的实现。
