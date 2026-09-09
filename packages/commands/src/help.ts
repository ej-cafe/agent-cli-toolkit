import { toolkitName } from "@agent-cli-toolkit/core";

export function printHelp(): void {
  process.stdout.write(`${toolkitName}

Usage:
  agent-cli [--help] [--version]
  agent-cli token add [--name <name>] [--platform <aliyun|tencent>] [--token <token>] [--base-url <url>] [--claude-base-url <url>]
  agent-cli token delete <name>
  agent-cli token list
  agent-cli token use <name> [--all | --tool <claude-code|opencode>] [--model <id>]
  agent-cli token sync-model-list [--platform <aliyun|tencent>]

Commands:
  token add              添加一套云平台 token profile（可省略标志，在终端问答补齐）
  token delete           按名称删除 profile
  token list             列出已保存的 profile（token 脱敏）
  token use              把 profile 写入 Claude Code / OpenCode 配置
  token sync-model-list  按平台更新模型目录（可指定 --platform）

Flags:
  --all           同步到全部已对接工具（Claude Code、OpenCode）
  --tool          指定工具，可重复：claude-code、opencode
  --model         指定 Claude Code 默认模型（仅对 Claude Code 有效）
  --platform      指定云平台：aliyun、tencent（sync-model-list）
  --token         API token（可能出现在 shell 历史中，请谨慎使用）

同步腾讯云模型列表时使用环境变量 TENCENTCLOUD_SECRET_ID 与 TENCENTCLOUD_SECRET_KEY。
`);
}
