## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`runTokenAdd` 目前同步解析标志，缺任一项必填就 `fail`。`runTokenUse` 已用 `node:readline/promises` 做交互选工具；`runTokenCommand` 对 `use` 已经 `await`。仓库禁止新增 Inquirer 一类运行时依赖。不引入测试运行器。

## Goals / Non-Goals

**目标：**

- 把「缺字段」从一律报错改为：TTY 上问答补齐，非 TTY 仍立即失败。
- 复用现有 readline 风格，不新增 CLI 框架。
- `runTokenAdd` 改为 async，由现有 `runTokenCommand` 等待。

**非目标：**

- 隐藏 token 输入（不引入 raw-mode / 第三方 prompt）。
- 从环境变量或文件读 token。
- 给 `delete` / `list` 加问答。
- 改 `token-profile.json` 结构或 add 成功后的模型目录逻辑。

## Decisions

### 1. 只补缺失字段，全必填标志则完全跳过问答

解析标志后：`name` / `platform` / `token` / `base-url` 均已非空则直接 `addProfile`，即使未给 `--claude-base-url` 也不问可选地址（与当前脚本用法一致）。仅当至少一项必填为空时，才在 `process.stdin.isTTY === true` 时进入问答；非 TTY 则沿用「缺少必填标志」失败。可选 `claude-base-url` 只在这次进入问答且标志未提供时询问；空行省略该字段。

**原因：** 规格要求全标志路径不变；脚本不应被新的可选提示打断。

**备选：** 无标志才问答、给了任意标志就禁止问答。否决：半条命令补齐更符合「问答填写」。  
**备选：** 全必填给齐仍询问 Claude 地址。否决：会改变现有「省略即不写 claudeBaseUrl」的脚本行为。

### 2. 一次 readline 会话问完，platform 用编号

与 `token use` 相同：`createInterface({ input: process.stdin, output: process.stdout })`，问完再 `close`。提问顺序：缺失的 name → platform → token → base-url，然后（若需要）Claude 地址。platform 打印：

```
1) aliyun
2) tencent
```

接受 `1` / `2` 或 `aliyun` / `tencent`。其它输入按未知平台失败。必填项空回答按空值拒绝（不循环再问），与现有空标志失败一致。Ctrl-C / EOF 导致非 0，不写 profile。

**原因：** 已有交互先例；零新依赖。失败即退出，避免模糊的「再问一次」循环。

**备选：** Inquirer。否决（AGENTS.md：先问新依赖）。  
**备选：** 空必填再问一遍。否决：与当前标志校验不一致，也难测。

### 3. token 明文回显

问答中的 token 走普通 `rl.question`，终端可见。帮助里已有的「`--token` 可能进 shell 历史」仍然有效；问答的收益是 token 不必出现在 argv。

**原因：** 隐藏输入需要自己做 stdin raw mode，首版范围外。

**备选：** 关闭 echo。推迟：实现与测试成本高，规格未要求。

## Risks / Trade-offs

- **非 TTY 误判导致脚本挂起** → 缓解：只用 `stdin.isTTY`；缺字段且非 TTY 立即 `fail`。
- **token 仍出现在屏幕** → 缓解：不进 argv / shell 历史；帮助提醒谨慎。
- **部分标志 + 问答时，标志里的无效 platform 仍应在提问前失败** → 缓解：已给的 `--platform` 先 `isPlatform` 校验，再决定是否提问。

## Migration Plan

无存量数据迁移。回滚即还原 `token add` 命令；用户已写入的 `token-profile.json` 不受影响。
