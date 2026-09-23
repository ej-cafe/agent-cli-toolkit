import { toolkitName } from "@agent-cli-toolkit/core";

export function printHelp(): void {
  process.stdout.write(`${toolkitName}

Usage:
  agent-cli [--help] [--version]
  agent-cli token add [--name <name>] [--platform <aliyun|tencent|deepseek|kimi|glm>] [--token <token>] [--base-url <url>] [--claude-base-url <url>]
  agent-cli token delete <name>
  agent-cli token list
  agent-cli token use <name> [--all | --tool <claude-code|opencode|dsh|pi>] [--model <id>]
  agent-cli token sync-model-list [--name <profile>] [--platform <aliyun|tencent|deepseek|kimi|glm>]
  agent-cli token usage [--name <profile>] [--output table|text|raw]

Commands:
  token add              添加一套云平台 token profile（可省略标志，在终端问答补齐；deepseek / kimi / glm 可省略 URL 用官方预设；glm 为中国站 Coding Plan）
  token delete           按名称删除 profile
  token list             列出已保存的 profile（token 脱敏）
  token use              把 profile 写入 Claude Code / OpenCode / DeepSeek Harness（dsh） / pi 配置。配置目录或对应程序不存在时跳过该工具，且不创建该配置目录
  token sync-model-list  按 profile 更新模型列表（可指定 --name；--platform 过滤；省略 --name 则同步全部目标）
  token usage            按 profile 分段查询余量（段间空行；可用 --name / --output）

Flags:
  --all           同步到全部已对接工具（Claude Code、OpenCode、DeepSeek Harness（dsh）、pi）。配置目录或程序不存在的工具会跳过，且不创建该配置目录
  --tool          指定工具，可重复：claude-code、opencode、dsh、pi。dsh 的显示名是 DeepSeek Harness（dsh）
  --model         指定默认模型（对 Claude Code、DeepSeek Harness（dsh）与 pi 有效；应用到 pi 时总会设置 defaultProvider 与 defaultModel，有 --model 用该 id，否则用模型列表第一项）
  --name          指定 profile（sync-model-list；token usage）
  --output        token usage 输出格式：table（默认）、text、raw
  --platform      指定云平台：aliyun、tencent、deepseek、kimi、glm（add / sync-model-list）
  --token         API token（可能出现在 shell 历史中，请谨慎使用）

DeepSeek 预设 base-url 为 https://api.deepseek.com，claude-base-url 为 https://api.deepseek.com/anthropic；显式传入则覆盖。
Kimi 中国站预设 base-url 为 https://api.moonshot.cn/v1，claude-base-url 为 https://api.moonshot.cn/anthropic；显式传入则覆盖（国际站可用 api.moonshot.ai）。
GLM 中国站 Coding Plan 预设 base-url 为 https://open.bigmodel.cn/api/coding/paas/v4，claude-base-url 为 https://open.bigmodel.cn/api/anthropic；显式传入则覆盖（通用按量可用 …/api/paas/v4；国际站可用 api.z.ai）。
同步模型列表时每个目标 profile 都请求自己的 {baseUrl}/models，没有平台级共享目录。
token usage：按已保存 profile 分段查询并展示，成功段之间空行分隔；省略 --name 时查询全部 profile。--output 可取 table（默认命令行表格）、text（文本摘要）、raw（原始 JSON）。deepseek 为 GET {baseUrl}/user/balance，kimi 为 GET {baseUrl}/users/me/balance；aliyun 用本机 bl 查询百炼 Token Plan（需 bl auth login --console，不读 profile API Key）；腾讯云与智谱 GLM 暂不支持 API 余额查询，请前往控制台。
`);
}
