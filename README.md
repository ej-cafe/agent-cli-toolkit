# agent-cli-toolkit

TypeScript 命令行工具集，运行在 Node.js 上，使用 pnpm monorepo。当前主要能力是管理云平台 API token profile，并把它们同步到 Claude Code、OpenCode、DeepSeek Harness（dsh）、pi 等代理工具的本地配置。

对外命令：`agent-cli`。

## 要求

- Node.js >= 20
- pnpm 12（见根目录 `packageManager`）

## 安装与运行

从 npm 安装（公开包 `agent-cli-toolkit`）：

```bash
npm install -g agent-cli-toolkit
agent-cli --help
```

从源码构建：

```bash
pnpm install
pnpm build
pnpm exec agent-cli --help
pnpm --filter @agent-cli-toolkit/cli dev   # 用 tsx 跑源码
```

全局标志：

| 标志 | 说明 |
|------|------|
| `--help` | 打印帮助 |
| `--version` | 打印版本 |

## 配置目录

首次运行会创建全局配置目录：

- 默认：`~/.config/agent-cli-toolkit`
- 若设置了 `XDG_CONFIG_HOME`：`$XDG_CONFIG_HOME/agent-cli-toolkit`

token profile（含各自的模型列表）保存在该目录下的 `token-profile.json`。

`token-server` 另用四个文件：`token-server.json`（激活 profile 名）、`token-server.pid`（运行中服务器，`{ pid, host, port }`）、`token-server.log`（守护进程日志）、`token-server.key`（服务器 API key，0600 权限，`gen-api-key` 生成）。

## 命令总览

```bash
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
```

---

## `token add`

添加一套云平台 token profile。添加时会用该套凭据请求 `{baseUrl}/models` 拉取模型列表；请求失败则**不会**写入 profile。

### 用法

```bash
# 交互式：省略标志，在终端问答补齐
agent-cli token add

# 一次性写全参数
agent-cli token add \
  --name <name> \
  --platform <aliyun|tencent|deepseek|kimi|glm> \
  --token <token> \
  [--base-url <url>] \
  [--claude-base-url <url>]
```

### 标志

| 标志 | 必填 | 说明 |
|------|------|------|
| `--name` | 是 | profile 名称（本地唯一键） |
| `--platform` | 是 | `aliyun`、`tencent`、`deepseek`、`kimi`、`glm` |
| `--token` | 是 | API token（可能进入 shell 历史，请谨慎） |
| `--base-url` | 视平台 | OpenAI 兼容 API 根地址 |
| `--claude-base-url` | 否 | Anthropic 兼容 API 根地址 |
| `--product-type` | 否（仅 tencent；默认 `personal`） | 腾讯云 TokenHub 套餐类型：`personal` 个人版（暂不支持 usage 查询）、`enterprise` 企业版专业套餐、`enterprise-auto` 企业版轻享套餐 |

非交互环境（stdin 非 TTY）下，缺失必填项会直接报错，不会进入问答。

### 平台与默认 URL

| 平台 | `--base-url` | `--claude-base-url` |
|------|--------------|---------------------|
| `aliyun` / `tencent` | **必填** | 可选 |
| `deepseek` | 可省略，默认 `https://api.deepseek.com` | 可省略，默认 `https://api.deepseek.com/anthropic` |
| `kimi` | 可省略，默认 `https://api.moonshot.cn/v1`（中国站） | 可省略，默认 `https://api.moonshot.cn/anthropic` |
| `glm` | 可省略，默认 `https://open.bigmodel.cn/api/coding/paas/v4`（中国站 Coding Plan） | 可省略，默认 `https://open.bigmodel.cn/api/anthropic` |

显式传入的 URL 会覆盖预设。Kimi 国际站可将 URL 覆盖为 `api.moonshot.ai` 对应地址。GLM 通用按量可用 `https://open.bigmodel.cn/api/paas/v4`，国际站可用 `api.z.ai` 对应地址。

交互模式下，`deepseek` / `kimi` / `glm` 的 base-url 与 claude-base-url 可直接回车使用预设；`aliyun` / `tencent` 必须填写 base-url。tencent 还会询问套餐类型（默认 personal 个人版）。

### 示例

```bash
agent-cli token add --name ds --platform deepseek --token sk-xxx

agent-cli token add --name zg --platform glm --token sk-xxx

agent-cli token add \
  --name bailian \
  --platform aliyun \
  --token sk-xxx \
  --base-url https://dashscope.aliyuncs.com/compatible-mode/v1 \
  --claude-base-url https://dashscope.aliyuncs.com/apps/anthropic
```

---

## `token delete`

按名称删除已保存的 profile。

### 用法

```bash
agent-cli token delete <name>
```

`<name>` 为必填位置参数；成功后打印 `已删除 profile: <name>`。

### 示例

```bash
agent-cli token delete ds
```

---

## `token list`

列出已保存的全部 profile。token 会脱敏（过短则显示 `****`，否则保留首尾各 4 位）。

### 用法

```bash
agent-cli token list
```

无 profile 时输出 `暂无 profile`。有数据时每个 profile 输出：

- `platform`
- `baseUrl`
- `claudeBaseUrl`（若有）
- `token`（脱敏）
- `models`（模型条数）

---

## `token use`

把指定 profile 写入一个或多个本地代理工具的配置文件。

### 用法

```bash
agent-cli token use <name> [--all | --tool <id>] [--model <id>]
```

| 标志 | 说明 |
|------|------|
| `--all` | 同步到全部已对接工具 |
| `--tool` | 指定工具，可重复：`claude-code`、`opencode`、`dsh`、`pi`。`dsh` 的显示名是 DeepSeek Harness（dsh） |
| `--model` | 指定默认模型 id（须存在于该 profile 的模型列表中） |

未指定 `--all` 或 `--tool` 时，会在交互终端选择目标工具（编号或 id，逗号/空格分隔）。`--model` 仅对 `claude-code`、`dsh`、`pi` 有效；若目标只有 `opencode` 并传了 `--model`，会报错。

配置目录或对应程序不存在的工具会被**跳过**（不创建该配置目录），并向 stderr 说明缺失项；stdout 只列出实际写入的工具。全部候选都被跳过时以退出码 0 结束。

### 各工具写入位置与行为

| `--tool` | 配置路径 | 行为摘要 |
|----------|----------|----------|
| `claude-code` | `~/.claude/settings.json` 的 `env` | 写入 `ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL`；有 `--model` 时写入 `ANTHROPIC_MODEL` |
| `opencode` | `~/.config/opencode/opencode.json`（或 `$XDG_CONFIG_HOME/opencode/opencode.json`） | 以 profile 名称为键写入 `provider`，含模型列表；`--model` 对其无效 |
| `dsh` | `$DSH_HOME/settings.yaml`（默认 `$DSH_HOME` 为 `~/.dsh`），以及同目录 `.credentials.yaml` | 写入 `llm-pi-ai.providers.<name>`；有 `--model` 时写入顶层 `agent-default-model` |
| `pi` | `$PI_CODING_AGENT_DIR` 下的 `models.json` / `auth.json` / `settings.json`（默认 `~/.pi/agent`） | 总会设置 `defaultProvider`（profile 名）与 `defaultModel`：有 `--model` 用该 id，否则用模型列表第一项 |

### 示例

```bash
# 同步到全部工具
agent-cli token use ds --all

# 只写 Claude Code，并指定默认模型
agent-cli token use ds --tool claude-code --model deepseek-chat

# 同时写多个工具
agent-cli token use ds --tool claude-code --tool opencode --tool dsh --tool pi

# 应用到 pi（无 --model 时用列表第一项作为 defaultModel）
agent-cli token use ds --tool pi
agent-cli token use ds --tool pi --model deepseek-chat
```

---

## `token sync-model-list`

按 profile 重新请求 `{baseUrl}/models` 并更新本地模型列表。每个目标 profile 用自己的 baseUrl，没有平台级共享目录。

### 用法

```bash
agent-cli token sync-model-list [--name <profile>] [--platform <aliyun|tencent|deepseek|kimi|glm>]
```

| 标志 | 说明 |
|------|------|
| `--name` | 只同步指定 profile |
| `--platform` | 过滤平台；与 `--name` 同时使用时，若 profile 平台不匹配会报错 |

省略 `--name` 时同步全部匹配目标（可再按 `--platform` 过滤）。部分失败时：成功的会打印，失败的写到 stderr，退出码为 1。

### 示例

```bash
agent-cli token sync-model-list
agent-cli token sync-model-list --name ds
agent-cli token sync-model-list --platform aliyun
agent-cli token sync-model-list --platform kimi
agent-cli token sync-model-list --platform glm
```

---

## `token usage`

按已保存 profile 查询套餐余量或账户余额，并分段展示（各 profile 的输出之间以空行分隔，成功与失败均如此）。

### 用法

```bash
agent-cli token usage [--name <profile>] [--output table|text|raw]
```

| 标志 | 说明 |
|------|------|
| `--name` | 只查指定 profile；省略则按名称排序查询全部 |
| `--output` | `table`（默认，命令行表格）、`text`（文本摘要）、`raw`（原始 JSON） |

不再支持 `--platform`；请按 profile 查询。

### 各平台查询方式

| 平台 | 数据来源 | 说明 |
|------|----------|------|
| `deepseek` | `GET {baseUrl}/user/balance` | 使用 profile 中的 API token |
| `kimi` | `GET {baseUrl}/users/me/balance` | 使用 profile 中的 API token |
| `aliyun` | 本机 `bl usage token-plan --output json` | 需已安装 bailian-cli（`bl` 在 PATH 中），并先执行 `bl auth login --console`；**不读** profile 里的 API Key |
| `tencent` | 腾讯云 TokenHub OpenAPI（`DescribeTokenPlanList`） | 使用环境变量 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY` 查询该账户的 TokenPlan 套餐余量；region 用 `TENCENTCLOUD_REGION` 覆盖、默认 `ap-guangzhou`。凭据缺失时不发请求，提示设置或前往控制台：https://console.cloud.tencent.com/tokenhub。**不读** profile 里的 token。profile 的 `productType` 需为 `enterprise`（企业版专业套餐）或 `enterprise-auto`（企业版轻享套餐）；`add` 缺省写入 `personal`（个人版），个人版暂不支持查询 |
| `glm` | — | 暂不支持 API 余额查询，请前往控制台：https://bigmodel.cn/coding-plan/personal/usage |

多个 aliyun profile 只会实际调用一次 `bl`；多个 tencent profile 只会触发一次 TokenHub 查询（复用同一份结果）。某个 profile 失败时，错误写到 stderr，其它 profile 仍会继续；若全部失败则退出码为 1。

### 示例

```bash
agent-cli token usage
agent-cli token usage --name ds
agent-cli token usage --output text
agent-cli token usage --name kimi-cn --output raw
```

---

## `token-server`

本机常驻的凭据注入转发服务器。客户端只需把 baseUrl 指向本机端口，服务器会用 `switch` / `use` 选定的激活 profile 注入凭据并转发到上游；运行中 `switch` 下一个请求即生效，无需改客户端配置或重启客户端。首次使用前必须先执行 `gen-api-key` 生成服务器 API key（写入 `token-server.key`）；服务器对每个请求校验 `Authorization: Bearer <key>`，未生成或 key 不匹配时返回 401，绝不转发凭据到上游。

### 用法

```bash
agent-cli token-server gen-api-key             # 先生成服务器 API key（仅显示一次，重复执行 = 轮换）
agent-cli token-server switch <profile>        # 仅设置激活 profile
agent-cli token-server use <profile> [--all | --tool <id>] [--model <id>]
#  激活该 profile，并把选中工具的 baseUrl 指向本地服务器、apiKey 写为生成的服务器 key
#  claude-code / opencode 写 /anthropic，dsh / pi 写 /v1
agent-cli token-server start                   # 后台启动（默认 127.0.0.1:8787；启动成功会打印两个 baseUrl 与 apiKey）
agent-cli token-server start --port <port> [--foreground]
agent-cli token-server stop                    # 终止并清理 pidfile
```

### 客户端 baseUrl 约定

| 客户端类型 | baseUrl |
|------------|---------|
| OpenAI 兼容 | `http://127.0.0.1:8787/v1` |
| Anthropic 兼容（Claude Code 等） | `http://127.0.0.1:8787/anthropic` |

服务器按路径路由：以 `/anthropic` 开头的请求转发到激活 profile 的 `claudeBaseUrl`（缺失时回退 `baseUrl`），其余请求转发到 `baseUrl`；查询串、请求方法与请求体原样转发，入站 `authorization` / `x-api-key`（先经服务器 key 校验）会被激活 profile 的 token 替换，绝不把服务器 key 透传给上游。

### 安全边界

- 仅监听本机回环地址 `127.0.0.1`，不接受远程连接；请求必须携带 `Authorization: Bearer <key>`，key 由 `token-server gen-api-key` 生成（重复执行会轮换，旧 key 立即失效）。
- 未执行 `gen-api-key` 时 `start` / `use` 会直接报错，服务器也不会放行任何请求。
- 不要在不可信的本机环境下运行；日志、错误响应与帮助文本不包含 token 或 key。

---

## 典型工作流

```bash
# 1. 添加 DeepSeek profile（URL 可用预设）
agent-cli token add --name ds --platform deepseek --token sk-xxx

# 2. 查看已保存内容
agent-cli token list

# 3. 同步到本机代理工具
agent-cli token use ds --all --model deepseek-chat

# 4. 之后刷新模型列表 / 查余额
agent-cli token sync-model-list --name ds
agent-cli token usage --name ds
```

## 参与贡献

1. Fork 本仓库
2. 新建功能分支
3. 提交代码
4. 新建 Pull Request

远程仓库：主库 GitHub `git@github.com:ej-cafe/agent-cli-toolkit.git`（`origin`），备库 Gitee `git@gitee.com:galaxy-explorer/agent-cli-toolkit.git`（`gitee`）。默认分支 `master`。
