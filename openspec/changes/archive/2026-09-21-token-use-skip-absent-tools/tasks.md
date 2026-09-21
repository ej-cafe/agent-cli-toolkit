## 1. 存在性判定

- [x] 1.1 在 `packages/token-config` 增加共用判定：`claude-code` → `~/.claude` + `claude`，`opencode` → `dirname(openCodeConfigPath())` + `opencode`，DeepSeek Harness（dsh）（工具 id `dsh`）→ `dshHome()` + `dsh`，`pi` → `piAgentDir()` + `pi`。目录用 `stat`（`ENOENT` 或不是目录算缺目录，其它 `stat` 错误仍失败）。程序只在 `PATH` 上找同名且 `X_OK` 的文件，不 `spawn`。用临时目录与临时 `PATH` 覆盖：两者都在、只缺目录、只缺程序、两者都缺、路径是文件而不是目录。确认这些用例通过，且不创建缺失目录。

## 2. 写入守卫

- [x] 2.1 `applyClaudeCode`、`applyOpenCode`、`applyDsh`、`applyPi` 在不可写时直接返回，不调用会建父目录的写入。删掉 `applyDsh` 里的 `mkdirSync(dshHome())`；目录已存在时仍可 `chmod` 并创建目录内缺失的配置文件。给 `packages/token-config/test/apply.test.ts` 里期望写入的用例补上对应可执行桩，并加用例：缺目录或缺程序时不创建该工具根目录、不改已有文件；目录和程序都在但配置文件不存在时仍创建文件。确认这些用例通过，且 `writeJsonAtomic` / `writeYamlAtomic` 对其它调用方的建目录行为不变。

## 3. token use

- [x] 3.1 在 `runTokenUse` 里于 apply 以及 pi 模型 id 解析之前按 1.1 过滤候选（`--all`、重复 `--tool`、交互选择都走这里）。交互菜单仍列出四个工具，DeepSeek Harness（dsh）显示为 `DeepSeek Harness（dsh）`，仍可用 `3` 或 `dsh` 选中。只把可写工具交给 apply 和 `--model` 校验。被跳过的 DeepSeek Harness（dsh）不要求模型 id。profile 不存在仍在写文件或「全部跳过成功」之前拒绝。stderr 用显示名点名被跳过的工具并区分缺目录、缺程序或两者；stdout 只列实际写入的工具，DeepSeek Harness（dsh）写作 `DeepSeek Harness（dsh）`；全部跳过时退出码 0 且不声称已应用；过滤后没有 Claude Code、DeepSeek Harness（dsh）、pi 却带了 `--model` 时拒绝且不写文件。用隔离的 `HOME` / `XDG_CONFIG_HOME` / `DSH_HOME` / `PI_CODING_AGENT_DIR` / `PATH` 覆盖上述情况，确认用例通过。

## 4. 说明

- [x] 4.1 更新 `packages/commands/src/help.ts`、`packages/token-config/src/commands/token.ts` 的 `use` hint，以及 README 里 `token use` 的说明：配置目录或对应程序不存在的工具会被跳过，且不会创建该目录；该工具的显示名是 DeepSeek Harness（dsh），`--tool` 的取值仍是 `dsh`。用测试确认 `agent-cli --help` 与 `token --help` 含跳过说明和显示名 `DeepSeek Harness（dsh）`。确认 `pnpm test` 与 `pnpm typecheck` 通过。
