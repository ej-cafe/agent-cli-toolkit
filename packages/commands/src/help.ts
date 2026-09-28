import { toolkitName } from "@agent-cli-toolkit/core";

export function printHelp(): void {
  process.stdout.write(`${toolkitName}

Usage:
  agent-cli [--help] [--version]
  agent-cli token add [--name <name>] [--platform <aliyun|tencent|deepseek|kimi|glm>] [--token <token>] [--base-url <url>] [--claude-base-url <url>] [--product-type <productType>]
  agent-cli token delete <name>
  agent-cli token list
  agent-cli token use <name> [--all | --tool <claude-code|opencode|dsh|pi>] [--model <id>]
  agent-cli token sync-model-list [--name <profile>] [--platform <aliyun|tencent|deepseek|kimi|glm>]
  agent-cli token usage [--name <profile>] [--output table|text|raw]
  agent-cli token-server start [--port <port>] [--foreground]
  agent-cli token-server stop
  agent-cli token-server switch <profile>
  agent-cli token-server use <profile> [--all | --tool <claude-code|opencode|dsh|pi>] [--model <id>]
  agent-cli token-server gen-api-key

Commands:
  token add              添加一套云平台 token profile（可省略标志，在终端问答补齐；deepseek / kimi / glm 可省略 URL 用官方预设；glm 为中国站 Coding Plan）
  token delete           按名称删除 profile
  token list             列出已保存的 profile（token 脱敏）
  token use              把 profile 写入 Claude Code / OpenCode / DeepSeek Harness（dsh） / pi 配置。配置目录或对应程序不存在时跳过该工具，且不创建该配置目录
  token sync-model-list  按 profile 更新模型列表（可指定 --name；--platform 过滤；省略 --name 则同步全部目标）
  token usage            按 profile 分段查询余量（段间空行；可用 --name / --output）
  token-server start     在后台启动本地转发服务器（--foreground 前台运行，--port 覆盖默认端口）
  token-server stop      停止运行中的本地转发服务器并清理 pidfile
  token-server switch    设置激活 profile（服务器每个请求都读取最新激活值，无需重启）
  token-server use       把 profile 指向本地服务器：激活该 profile，并把选中工具的 baseUrl 指向 token-server、apiKey 写为生成的服务器 key
  token-server gen-api-key  生成服务器 API key（客户端访问凭据；仅显示一次，保存在配置目录）

Flags:
  --all           同步到全部已对接工具（Claude Code、OpenCode、DeepSeek Harness（dsh）、pi）。配置目录或程序不存在的工具会跳过，且不创建该配置目录
  --tool          指定工具，可重复：claude-code、opencode、dsh、pi。dsh 的显示名是 DeepSeek Harness（dsh）
  --model         指定默认模型（对 Claude Code、DeepSeek Harness（dsh）与 pi 有效；应用到 pi 时总会设置 defaultProvider 与 defaultModel，有 --model 用该 id，否则用模型列表第一项）
  --name          指定 profile（sync-model-list；token usage）
  --output        token usage 输出格式：table（默认）、text、raw
  --port          token-server 监听端口，默认 8787
  --foreground    token-server 在前台运行，不转入后台
  --platform      指定云平台：aliyun、tencent、deepseek、kimi、glm（add / sync-model-list）
  --token         API token（可能出现在 shell 历史中，请谨慎使用）

DeepSeek 预设 base-url 为 https://api.deepseek.com，claude-base-url 为 https://api.deepseek.com/anthropic；显式传入则覆盖。
Kimi 中国站预设 base-url 为 https://api.moonshot.cn/v1，claude-base-url 为 https://api.moonshot.cn/anthropic；显式传入则覆盖（国际站可用 api.moonshot.ai）。
GLM 中国站 Coding Plan 预设 base-url 为 https://open.bigmodel.cn/api/coding/paas/v4，claude-base-url 为 https://open.bigmodel.cn/api/anthropic；显式传入则覆盖（通用按量可用 …/api/paas/v4；国际站可用 api.z.ai）。
仅 tencent 可指定 --product-type，缺省 personal（个人版，token usage 暂不支持个人版查询），可设 enterprise（企业版专业套餐）或 enterprise-auto（企业版轻享套餐）。
同步模型列表时每个目标 profile 都请求自己的 {baseUrl}/models，没有平台级共享目录。
token usage：按已保存 profile 分段查询并展示，各 profile 输出之间以空行分隔（成功段与失败段均如此）；省略 --name 时查询全部 profile。--output 可取 table（默认命令行表格）、text（文本摘要）、raw（原始 JSON）。deepseek 为 GET {baseUrl}/user/balance，kimi 为 GET {baseUrl}/users/me/balance；aliyun 用本机 bl 查询百炼 Token Plan（需 bl auth login --console，不读 profile API Key）；腾讯云调用 TokenHub OpenAPI（DescribeTokenPlanList）查询套餐余量，需设置环境变量 TENCENTCLOUD_SECRET_ID 与 TENCENTCLOUD_SECRET_KEY，region 可用 TENCENTCLOUD_REGION 覆盖、默认 ap-guangzhou，凭据缺失时提示设置或前往控制台；profile 需声明 productType（enterprise 企业版专业套餐 / enterprise-auto 企业版轻享套餐），个人版暂不支持查询；智谱 GLM 暂不支持 API 余额查询，请前往控制台。
token-server：本地转发服务器，仅监听 127.0.0.1（默认端口 8787，可用 --port 覆盖），客户端 baseUrl 指向本机即可；服务器使用 token-server switch / use 选定的激活 profile，按 /anthropic 前缀路由到 claudeBaseUrl（缺失时回退 baseUrl）、其余路由到 baseUrl，并注入激活 profile 的凭据。首次使用前必须先执行 token-server gen-api-key：服务器对每个请求校验 Authorization: Bearer <key>，未生成或 key 不匹配时返回 401。token-server use 会把选中工具（claude-code 与 opencode 写 /anthropic、dsh 与 pi 写 /v1）的 baseUrl 指向本地服务器，apiKey 写为生成的服务器 key，并把该 profile 设为激活。
`);
}
