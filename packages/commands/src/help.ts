import { toolkitName } from "@agent-cli-toolkit/core";

export function printHelp(): void {
  process.stdout.write(`${toolkitName}

Usage:
  agent-cli [--help] [--version]
  agent-cli token add [--name <name>] [--platform <aliyun|tencent>] [--token <token>] [--base-url <url>] [--claude-base-url <url>]
  agent-cli token delete <name>
  agent-cli token list
  agent-cli token use <name> [--all | --tool <claude-code|opencode>]

Commands:
  token add       添加一套云平台 token profile（可省略标志，在终端问答补齐）
  token delete    按名称删除 profile
  token list      列出已保存的 profile（token 脱敏）
  token use       把 profile 写入 Claude Code / OpenCode 配置

Flags:
  --all           同步到全部已对接工具（Claude Code、OpenCode）
  --tool          指定工具，可重复：claude-code、opencode
  --token         API token（可能出现在 shell 历史中，请谨慎使用）
`);
}
