import { toolkitName } from "@agent-cli-toolkit/core";

export function printHelp(): void {
  process.stdout.write(`${toolkitName}

Usage:
  agent-cli [--help] [--version]
  agent-cli token add [--name <name>] [--platform <aliyun|tencent>] [--token <token>] [--base-url <url>] [--claude-base-url <url>]
  agent-cli token delete <name>
  agent-cli token list
  agent-cli token use <name> [--all | --tool <claude-code|opencode|dsh|pi>] [--model <id>]
  agent-cli token sync-model-list [--name <profile>] [--platform <aliyun|tencent>]
  agent-cli token usage [--platform aliyun]

Commands:
  token add              添加一套云平台 token profile（可省略标志，在终端问答补齐）
  token delete           按名称删除 profile
  token list             列出已保存的 profile（token 脱敏）
  token use              把 profile 写入 Claude Code / OpenCode / DeepSeek Harness / pi 配置
  token sync-model-list  按 profile 更新模型列表（可指定 --name；--platform 过滤；省略 --name 则同步全部目标）
  token usage            查询套餐余量（当前仅支持阿里云百炼；需本机 bl 且已 bl auth login --console）

Flags:
  --all           同步到全部已对接工具（Claude Code、OpenCode、DeepSeek Harness、pi）
  --tool          指定工具，可重复：claude-code、opencode、dsh、pi
  --model         指定默认模型（对 Claude Code、dsh 与 pi 有效）
  --name          指定要同步的 profile（sync-model-list）
  --platform      指定云平台：aliyun、tencent（sync-model-list 过滤器；usage 当前仅 aliyun）
  --token         API token（可能出现在 shell 历史中，请谨慎使用）

同步模型列表时每个目标 profile 都请求自己的 {baseUrl}/models，没有平台级共享目录。
token usage 查询的是百炼 Token Plan 订阅级余量，不读取 token-profile.json 中的 API Key。
`);
}
