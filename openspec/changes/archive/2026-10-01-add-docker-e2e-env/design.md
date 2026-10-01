## Context

见 `proposal.md` 的 Why。影响方案的前提事实（均在本机核对过）：

- 四个工具本机均已安装，安装来源互不相同：
  - `claude` → npm `@anthropic-ai/claude-code`
  - `pi` → npm `@earendil-works/pi-coding-agent`
  - `dsh` → npm `@deepseek-ai/dsh`
  - `opencode` → Homebrew `anomalyco/tap/opencode-v2`，实际下载的是 `https://opencode.ai/files/bin/<ver>/opencode-linux-x64-baseline.tar.gz`；**不是** npm 上的 `opencode-ai`（那是另一个产品，v1.x）。
- 非交互调用方式：`claude -p`、`opencode run`、`pi --print`、`dsh --profile headless "<task>"`。
- 本机安装的 opencode v2 读 `~/.config/opencode/opencode.json` 的 `provider` 段，与 `token-config` 写入的 schema 一致（已用 `opencode debug paths` 与实机配置核对）。
- `token use` 的写入前提是「配置目录已存在且为目录」+「程序在 `PATH` 上」；不满足即跳过。容器内 `PATH` 天然满足，配置目录需预创建。
- 现有测试体系：`node --import tsx --test packages/*/test/*.test.ts`，全部在本机、用临时 `XDG_CONFIG_HOME` 隔离；没有 Docker、没有 CI。

## Goals / Non-Goals

**Goals:**

- 一个可复现的 `linux/amd64` 镜像，内置四个真实 CLI 与本仓构建出的 `agent-cli`。
- A/B 两条验收路径可分别一键运行（compose 一次性任务），失败有明确退出码与非零信号。
- 容器内全新 `$HOME`：宿主机 `~/.claude`、`~/.config/opencode`、`~/.dsh`、`~/.pi/agent`、`~/.config/agent-cli-toolkit` 一律不挂载、不改写。
- 真实凭据只经 compose/环境变量进入，不落进镜像层、不落进仓库。

**Non-Goals:**

- 不进 CI、不做 mock 上游、不做多架构（先 `linux/amd64`）、不做镜像发布。
- 不改 `apps/`、`packages/`、对外 CLI 行为、`token-config` 规格。
- 不替代现有 `node:test` 单测；不与 `pnpm test` 合并。
- 不追求覆盖全部平台；默认只跑 `aliyun`。

## Decisions

### D1. 容器内全新隔离，不挂载宿主机配置（而非挂载宿主目录）

只注入真实凭据，不 `-v` 宿主 `~/.claude` 等。理由：测试环境要可抛弃、可重复、零污染；同时正好覆盖「全新环境下 `token use` 从零创建配置」这条路径。挂载宿主配置会让容器写入回流宿主，且掩盖首次创建逻辑的缺陷。

### D2. 只用真实上游，不做 mock 上游（用户明确选择）

容器内直接打真实平台。代价：不能离线、会消耗真实额度、断言只能到「有非空正常返回」而非精确内容。因此默认平台取 `aliyun`（百炼），因其同时提供 OpenAI 兼容与 Anthropic 兼容端点，一个账号即可覆盖四家工具；`deepseek`/`kimi`/`glm` 仍可通过 `.env` 覆盖。

### D3. 两个独立脚本 + compose 一次性服务（而非单个大脚本，也不并入 node:test）

`docker/scripts/run-a-config-use.sh` 与 `run-b-token-server.sh` 各自可单独运行、单独失败。理由：A 与 B 关注的失败点不同，合并会让一处失败掩盖另一处；不并入 `node:test` 是因为它需要 Docker、真实凭据、真实额度，属重型验收而非日常单测。

### D4. 工具来源与版本全部 pin

- `@anthropic-ai/claude-code`、`@earendil-works/pi-coding-agent`、`@deepseek-ai/dsh` 用固定版本 `npm i -g <pkg>@<ver>`。
- `opencode` 用 `curl https://opencode.ai/files/bin/2.0.19/opencode-linux-x64-baseline.tar.gz` 并校验 Dockerfile 内写死的 sha256（取自上游 Homebrew formula）。
- 基础镜像用 `node:22-bookworm-slim`。理由：pin 住的 `pi` 0.87.1 声明 `node >= 22.19.0`，`claude-code` 2.1.278 声明 `node >= 22.0.0`，Node 20 下 `pi` 直接因 `node:module` 缺 `enableCompileCache` 起不来。注意这不覆盖仓库自身的 `engines.node >= 20`，只是验收镜像跟随真实工具的下限。
理由：四个 CLI 的非交互 flag 与配置 schema 会随版本漂移，pin 是可复现的前提。备选（`npm i -g opencode-ai`）被否，因那是另一个产品。

### D5. 断言用 Node 脚本（而非 jq / yq / python）

镜像内已有 `node` 与仓库 `node_modules`（含 `yaml`）。A/B 的配置文件断言写成 `docker/scripts/assert-*.mjs`，直接 `import YAML from "yaml"` 解析 `settings.yaml`/`.credentials.yaml`，避免为 Docker 额外引入 `jq`/`yq`。JSON 用原生 `JSON.parse`。

### D6. 配置目录预创建 + 四家都必须实际写入

A 脚本在执行 `token use --all` 前 `mkdir -p` 四个配置目录（模拟用户已首启过工具）。随后断言 stdout 列出四家、且四个配置文件都被真实写入——若某家被跳过（例如程序不在 `PATH`），脚本直接 fail。这保证 A 不会「静默少测一家」。

### D7. 模型选择从 profile 的 `models` 里取，不写死

`token use --model <id>` 要求 id 存在于该 profile 的 `models`。A/B 脚本从 `token-profile.json`（或 `token list`）读取 `models[0].id` 作为默认，允许 `.env` 的 `E2E_MODEL` 覆盖（百炼的 Anthropic 端点与 OpenAI 端点对模型名可能有别）。

### D8. 非交互调用加最小化副作用

统一用最小 prompt（默认「只回复 pong」），并尽量关掉工具调用：`pi --no-tools`、`claude --allowedTools ""`（**不用** `--bare`，因为它只认 `ANTHROPIC_API_KEY`，会绕开 `ANTHROPIC_AUTH_TOKEN`，与 token-server 注入方式冲突）。dsh 用 `--profile headless`。理由：验收目标是连通性与配置生效，不是 agent 能力。

### D9. B 的断言边界

除「四家经 token-server 真跑一轮成功」外，额外断言：无 key 的裸请求返回 401；`token add` 第二个 profile 后 `token-server switch` 能让后续请求继续成功；`token-server.log` 与 401 响应体不含真实 token 或服务器 key。`switch` 的第二个 profile 复用同一真实凭据/上游（只有一个真 key），因此只证明「切换后仍可用」，不证明「确实换了上游」——该局限见风险。

### D10. 构建上下文与忽略规则

compose 的 build context 为仓库根，`dockerfile: docker/Dockerfile`；Dockerfile 只 `COPY` 构建所需路径（`apps/`、`packages/`、根 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`tsconfig*.json`、`openspec/` 不需要），并新增根 `.dockerignore` 排除 `**/node_modules`、`docker/.env`、`.git`。理由：pnpm 的 `node_modules` 是符号链接，拷进镜像会坏且巨大。

### D11. A 实跑暴露的 opencode `baseURL` 缺陷：就地修复（超出原定非目标）

首轮 A 实跑中只有 opencode 失败（`Provider request failed with HTTP 404`），其余三家正常。定位：`token use` 写入的 `provider.<id>.options.baseURL` 是 `claudeBaseUrl`（不带 `/v1`），而 `@ai-sdk/anthropic` 只在 `baseURL` 后拼 `/messages`，于是请求 `{claudeBaseUrl}/messages`；真实 Anthropic 兼容端点（claude-code 走 `{claudeBaseUrl}/v1/messages`）只提供后者。证据三层：严格 stub 抓包得 `POST /messages`；上游 `.../anthropic/messages` → 404 对 `.../anthropic/v1/messages` → 401；手工给 `opencode.json` 的 `baseURL` 补 `/v1` 后立刻返回。

处理：在 `packages/token-config/src/apply/opencode.ts` 按「最终 npm 为 `@ai-sdk/anthropic` 时 `baseURL` 自带 `/v1`」写入（已以 `/v1` 结尾则不重复追加），并补单测与 `assert-config.mjs` 的 A 期望值。选这个方案而非「只记入已知局限」的理由：不修则 A 无法达成失败目标，环境交付的意义就是发现并消除这类差异。不改 `claudeCompatibleUrl()` 本身 —— claude-code 的 `ANTHROPIC_BASE_URL` 必须不带 `/v1`（它自己拼 `/v1/messages`）。B 路径不受影响：`token-server use` 传 `@ai-sdk/openai` 且合成 profile 已去掉 `claudeBaseUrl`（回退到已带 `/v1` 的 `baseUrl`）。

遗留：`openspec/specs/token-config/spec.md` 中「`options.baseURL` 写成 Claude 兼容地址」对「客户端是否自带协议版本段」有二义性，本次未改主规格（本 change 声明 `skip_specs`）。

## Risks / Trade-offs

- [真实额度消耗] → prompt 最小化；单次运行只做 4～8 次极短调用；不设自动重试。
- [工具在非交互下尝试工具调用/权限阻塞导致挂起或失败] → D8 的最小 prompt + 禁工具 flag；脚本对每条调用设超时并 fail 而不无限等。
- [CLI flag 随版本漂移导致脚本失效] → D4 全部 pin 版本；flag 细节以实现时 `--help` 输出为准。
- [百炼 Anthropic 与 OpenAI 端点模型名不一致] → `E2E_MODEL` 可覆盖；脚本默认取 `models[0].id`。
- [dsh headless 可能需要先初始化 profile 才可启动] → 实现时先跑 `dsh --profile headless --dump-config` 验证，必要时用 `--from-default-profile` 初始化。
- [B 的 switch 无法证明换了上游] → 在 README 写明该局限；不强行伪造第二个上游。
- [构建需联网（npm/opencode tarball/真实 `/models`）] → 明确写入 README 前置条件；镜像构建与运行均需网络。
- [opencode tarball URL 未来不可用] → 版本与 URL 一起 pin；失效时按 formula 手动更新并同步 sha256。

## Migration Plan

纯新增，无数据迁移。落地即「新增 `docker/` 与 `.dockerignore`、改 `.gitignore`」。回滚 = 删除这些新增文件、还原 `.gitignore` 一行；不留运行时残留（容器 `--rm`，宿主配置零写入）。

## Open Questions

两者均已在实现期用 `--help` 与实跑确定，不再待解：

- `dsh --profile headless` 开箱可用（headless profile 随包提供），无需先初始化。
- `opencode run` 的免权限/模型 flag：`--standalone`、`--model <provider>/<model>`，见 `docker/scripts/run-*.sh`。
