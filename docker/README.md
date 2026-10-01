# Docker 真实工具验收环境

用真实凭据、真实上游，验证 `agent-cli` 的 `token use` 与 `token-server` 对**真实 agent CLI**（Claude Code、OpenCode、pi、DeepSeek Harness）是否真的生效。设计决策见 `openspec/changes/archive/2026-10-01-add-docker-e2e-env/design.md`。

这不是单测的替代品：仓库单测用临时 `XDG_CONFIG_HOME` 跑 `node:test`；这里补齐单测覆盖不到的「配置格式对真实工具是否有效」「转发链路是否真的通」两件事。

两层检查的分工：

| 层 | 命令（均在本仓库根目录） | 覆盖什么 | 依赖 |
|---|---|---|---|
| 单测 | `pnpm build && pnpm typecheck && pnpm test` | 配置内容、参数解析、转发逻辑；临时目录隔离，不碰真实用户配置 | 无 |
| 验收 A | `docker compose -f docker/docker-compose.yml run --rm a-config-use` | 写入的配置真实 CLI 认不认（31 项断言 + 四家真跑） | Docker + 真实凭据 |
| 验收 B | `docker compose -f docker/docker-compose.yml run --rm b-token-server` | 经 token-server 的转发链路（38+4+1+3 项断言 + 四家真跑） | 同上 |

单测快、免费、可反复跑；A/B 有真实调用成本（各向四家工具发一次真实 prompt）。改完代码先让单测绿，再跑 A/B 验收。

## 两条验收路径

| service | 验证内容 |
|---------|----------|
| `a-config-use` | **A：配置写入真实性**。真实 `token add`（拉 `/models`）→ `token use --all` → 断言四家配置文件内容 → 四家各真跑一轮最小 prompt |
| `b-token-server` | **B：token-server 端到端**。起本地 server → 四家指向本地 → 断言鉴权门 401/放行 → 四家经 server 真跑 → `switch` 后仍可用 → 不泄密检查 |

A 证明「写进配置的东西真实工具认」；B 证明「服务器确实注入了凭据并转发了请求」。

镜像用 **Node 22** 而非仓库 `engines` 声明的 20：pin 住的 pi 要求 `node >= 22.19`、claude-code 要求 `node >= 22`（见 `design.md` D4）。

## 前置条件

- Docker（含 Compose v2.24+）。镜像固定 `platform: linux/amd64`：Apple Silicon 上通过模拟运行，构建与运行会明显偏慢。
- 一份**可用的真实凭据**（默认阿里云百炼 API Key），能访问对应平台的 `/models`。
- 不需要联网以外的其它环境；不在 CI 运行。

## 快速开始

下面命令都在**仓库根目录**执行：`docker/.env` 按 compose 文件所在目录解析，而 `--env-file` 的相对路径按当前目录解析。

```bash
# 1. 填凭据（docker/.env 已被 gitignore，不会入库）
cp docker/.env.example docker/.env
$EDITOR docker/.env

# 2. 构建镜像（首次较慢）
docker compose -f docker/docker-compose.yml build

# 3. 跑 A
docker compose -f docker/docker-compose.yml run --rm a-config-use

# 4. 跑 B
docker compose -f docker/docker-compose.yml run --rm b-token-server
```

要经常切平台就用 `docker/envs/` 下的分平台文件，见下一节。

两个 service 都以退出码表达结果：`0` 通过，非 `0` 失败并打印 `[e2e][FAIL] ...`。

## 改了东西之后要不要重建

镜像里跑的是 `pnpm build` 的产物，而 `docker/scripts/` 是**只读挂载**进容器的（`docker-compose.yml` 里 `./scripts:/repo/docker/scripts:ro`）：

| 改了什么 | 要做什么 |
|---|---|
| `docker/scripts/*.sh`、`docker/scripts/assert-config.mjs` | 不用重建，直接重跑 `run --rm …` |
| `packages/` 下的源码、`docker/Dockerfile`、依赖 | 必须先 `docker compose -f docker/docker-compose.yml build` |
| `docker/.env` 或平台 env 文件 | 不用重建，`run` 时才注入 |
| `docker-compose.yml` 的 `environment:` / `command:` | 不用重建 |

容易踩的一点：改了 `packages/token-config/` 这类源码只跑 `pnpm test` 是不够的 —— 容器里是**旧构建产物**，A/B 会照旧给你旧行为，必须先 `build`。

## 一条命令切平台

`docker/envs/` 下五家各一份自包含模板（`aliyun` / `tencent` / `deepseek` / `kimi` / `glm`）：

```bash
cp docker/envs/deepseek.env.example docker/envs/deepseek.env   # 只填 E2E_TOKEN
PKG="docker compose -f docker/docker-compose.yml --env-file docker/envs/deepseek.env"
$PKG run --rm a-config-use
$PKG run --rm b-token-server
```

不传 `--env-file` 时读 `docker/.env`；传了就以它为准（同名变量由它覆盖，实测过）。

每份平台文件把十个变量**显式写全**，该走默认值的写空：空值就是「未设置」，脚本用自己的默认值。这样写不是为了好看，是为了防串台 —— 否则 `docker/.env` 里上一家残留的 URL / 模型会被带进这一家（而平台和地址对不上时，`token add` 会拿 A 家 token 去问 B 家 /models）。

`docker/envs/*.env` 与 `docker/.env` 一样，在 `.gitignore` 和 `.dockerignore` 里都被排除。

## 变量含义（`docker/.env`）

| 变量 | 必填 | 说明 |
|------|------|------|
| `E2E_PLATFORM` | 是 | 平台 id：`aliyun`（默认）/ `tencent` / `deepseek` / `kimi` / `glm` |
| `E2E_TOKEN` | 是 | 真实 API token，`token add` 用它请求 `/models` |
| `E2E_BASE_URL` | 视平台 | OpenAI 兼容根地址；`aliyun` / `tencent` 必填 |
| `E2E_CLAUDE_BASE_URL` | 否 | Anthropic 兼容根地址；留空回退 `E2E_BASE_URL` |
| `E2E_MODEL` | 否 | 指定默认模型 id；留空自动取 profile 拉到的第一个模型 |
| `E2E_PROMPT` | 否 | 发往四个工具的最小 prompt，默认「只回复 pong」 |
| `E2E_PROFILE_NAME` | 否 | 第一个 profile 名，默认 `e2e` |
| `E2E_SWITCH_PROFILE_NAME` | 否 | B 中 `switch` 用的第二个 profile 名，默认 `e2e-switch` |
| `E2E_TIMEOUT` | 否 | 每条真实调用的超时秒数，默认 120 |
| `E2E_SERVER_PORT` | 否 | B 中 token-server 的监听端口，默认 8787 |

默认值按阿里云百炼填写。换平台只需改 `E2E_PLATFORM`（`deepseek` / `kimi` / `glm` 还可把两个 URL 留空走 CLI 预设）。

### 各平台填法

| `E2E_PLATFORM` | `E2E_BASE_URL` | `E2E_CLAUDE_BASE_URL` | 说明 |
|---|---|---|---|
| `aliyun`（默认） | 必填 | 可选 | 百炼同时提供 OpenAI 与 Anthropic 兼容端点，一个账号覆盖四家 |
| `tencent` | 必填 | 可选 | TokenHub 地址由控制台给出，平台无预设 |
| `deepseek` | 可留空 | 可留空 | 预设 `https://api.deepseek.com` / `.../anthropic` |
| `kimi` | 可留空 | 可留空 | 预设 `https://api.moonshot.cn/v1` / `.../anthropic` |
| `glm` | 可留空 | 可留空 | 预设 Coding Plan `.../paas/v4` / `.../api/anthropic` |

脚本对平台无分支：`token add` / `token-server use` 都只在 URL 非空时才传 `--base-url` / `--claude-base-url`，所以上表任一行都能直接跑 A/B。唯一按平台可能分化的是 B 里的 opencode（见下面已知局限）。

两点平台相关的前提：

- 要让 **claude-code** 与经 server 的 **opencode** 跑通，`E2E_CLAUDE_BASE_URL`（或其回退的 `E2E_BASE_URL`）必须是真正的 Anthropic 兼容端点。aliyun / tencent 不填就会回退到 OpenAI 兼容端点，这两家工具会失败（就是「用了非 Anthropic 端点」这个真实情况）。
- 同一个 Anthropic 兼容地址，两家拿到的路径段不一样：claude-code 的 `ANTHROPIC_BASE_URL` 写**不带** `/v1` 的地址（它自己拼 `/v1/messages`），而 A 路径下 opencode 的 `options.baseURL` 会被写**带** `/v1` 的地址（`@ai-sdk/anthropic` 只拼 `/messages`）。所以填 `E2E_CLAUDE_BASE_URL` 时按「不带 `/v1`」写；A 的断言脚本会校验 opencode 那一侧已补上 `/v1`（写多了不会重复追加）。
- `tencent` 的 `token add` 不传 `--product-type`，会按默认 `personal` 写入；这不影响 A/B（只影响 `token usage`）。

## 隔离与安全

- 容器内使用**全新 `$HOME`**（`/home/tester`），**不挂载**宿主机的 `~/.claude`、`~/.config/opencode`、`~/.dsh`、`~/.pi/agent`、`~/.config/agent-cli-toolkit`。宿主机配置零污染。
- 凭据只经环境变量注入容器（`docker/.env` 或 `--env-file` 指定的文件），不写入镜像、不入库。`docker/.env` 与 `docker/envs/*.env` 在 `.dockerignore` 和 `.gitignore` 两处都被排除。
- 容器以非 root 用户 `tester` 运行，`--rm` 一次性销毁。
- 脚本只在失败信息里打印字段名，**不回显** token / key 明文；A/B 都包含「配置文件、日志、错误响应不含凭据明文」的断言。

## 失败怎么读

脚本按步骤分段（`[e2e] ===== Axx ... =====`），逐条断言打印 `ok` / `FAIL`，最后汇总失败项。常见原因：

| 现象 | 原因 |
|------|------|
| `A1` / `B1` 立即失败：缺少必需环境变量 | 未提供 `E2E_PLATFORM` / `E2E_TOKEN`：既没有 `docker/.env`，也没传 `--env-file` |
| `token add` 失败：`无法获取 ... 模型列表` | token 无效、`E2E_BASE_URL` 不对或网络不通 |
| `有工具被跳过（配置目录或程序缺失）` | 某家 CLI 未装或配置目录未建；A 脚本会 `mkdir -p` 四家目录，正常不该出现 |
| `token use 未写入 <工具>` | 同上，覆盖不完整会被判失败而不是静默通过 |
| 某家真跑超时 | 模型未按 prompt 约束、上游限流，或该家命令参数与版本不匹配（见下） |
| `不泄密检查` 失败 | 配置文件/日志/响应里出现了 `E2E_TOKEN` 或服务器 key —— 这是真问题，不要忽略 |

`assert-config.mjs` 可单独复用，但四个子命令的前提不同，别混着抄：

| 子命令 | 前提 |
|---|---|
| `a` | 四家都已写入（A 路径产物），且 `E2E_MODEL` 非空 |
| `b` | 四家都已写入（B 路径产物，全部指向本地 server） |
| `active-profile <name>` | 存在 `<配置目录>/token-server.json`。它由 `token-server gen-api-key` / `token-server use` 写出，**A 路径下不存在** |
| `no-secret <file>...` | 每个文件必须**已存在**，且 `E2E_TOKEN` 或 `E2E_SERVER_KEY` 非空 |

`no-secret` 语义上属于 B：A 路径本来就把真实 token 写进四家配置，拿它查 A 的配置必然失败。

A/B 脚本内部已经在调用它们（A4b 用 `a`，B7 用 `active-profile`，B8 用 `no-secret`），单独跑主要用在「手打流程」或「某一步失败后只复查这一段」。从宿主机进容器手跑 A 的写入部分再断言 —— 不发真实 prompt，只请求一次 `/models`：

```bash
docker compose -f docker/docker-compose.yml run --rm --entrypoint bash a-config-use -lc '
  mkdir -p ~/.claude ~/.config/opencode ~/.dsh ~/.pi/agent     # 缺目录会被 token use 跳过
  agent-cli token add --name e2e --platform "$E2E_PLATFORM" --token "$E2E_TOKEN" \
    --base-url "$E2E_BASE_URL" --claude-base-url "$E2E_CLAUDE_BASE_URL"
  agent-cli token use e2e --all --model "$E2E_MODEL"
  node /repo/docker/scripts/assert-config.mjs a
'
```

`--entrypoint bash` 覆盖 service 默认的 A/B 脚本；`docker/scripts/` 是只读挂载，改完免重建。B 侧复查同理：service 换成 `b-token-server`，子命令换成 `b` / `active-profile <name>` / `no-secret <已存在的文件>`。

两点注意：`--base-url` / `--claude-base-url` 在留空的平台上别传（`token add` 会拿空地址去请求）；`E2E_MODEL` 留空时先 `agent-cli token list` 取一个模型 id。

## 版本与参数

四个工具全部 pin（见 `docker/Dockerfile` 顶部 `ARG`）：`claude` / `pi` / `dsh` 走 npm，`opencode` 用官方静态包 URL + 硬编码 sha256。升级某个工具时改对应 `ARG` 并重跑 A/B —— 这些 CLI 的 `--flag` 与配置 schema 会随版本漂移。

非交互调用方式：`claude -p "<prompt>" --allowedTools ""`、`opencode run --standalone --model <profile>/<model> "<prompt>"`、`pi --print --no-tools "<prompt>"`、`dsh --profile headless "<prompt>"`。`dsh` 的 `headless` profile 随包提供，无需先初始化。

访问不到 Docker Hub、或访问 Debian 官方源 / npm 官方源很慢时，可换成可达的镜像源（默认值都不变）：

```bash
docker compose -f docker/docker-compose.yml build \
  --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim \
  --build-arg APT_MIRROR=mirrors.ustc.edu.cn \
  --build-arg REGISTRY=https://registry.npmmirror.com
```

这三个都是构建期回路参数，只影响从哪拉包，不改变镜像内容与断言（默认值仍是官方源）。

`claude -p` 特意**不使用** `--bare`：该模式会绕过 `ANTHROPIC_AUTH_TOKEN`，测不到真实写入。

## 已知局限

- **A 路径的 opencode 需要镜像里含 `/v1` 修复**：`token use` 给 opencode 写 `@ai-sdk/anthropic`（只拼 `/messages`），所以 `options.baseURL` 必须是 `E2E_CLAUDE_BASE_URL` + `/v1`；claude-code 的 `ANTHROPIC_BASE_URL` 则相反，不带 `/v1`。该规则现已写入 `token-config` 规格并修复（`packages/token-config/src/apply/opencode.ts`）；若用修复前的构建跑 A，opencode 会报 `Provider request failed with HTTP 404`（判别方式：看写入的 `options.baseURL` 是否缺 `/v1`）。镜像烤入 `pnpm build` 产物，改代码后需 `docker compose build` 再跑。
- **B 路径下 opencode 走 OpenAI Responses API**：`token-server use` 给 opencode 写的是 `@ai-sdk/openai`，实际请求 `/v1/responses`（不是 `/chat/completions`）；A 路径写的是 `@ai-sdk/anthropic`，走 `/v1/messages`。因此 B 要求上游支持 `/responses`。百炼 `compatible-mode` 探活时两个路由都返回 401（非 404）且错误体形状不同，提示 `/responses` 由独立后端处理；deepseek / kimi / glm 只探到 401，**不能据此判定路由存在**。若你所选平台不支持 `/responses`，表现为 B 里只有 opencode 这一条失败，其它三家不受影响。（本轮实跑用的是百炼 Token Plan 端点 `token-plan.cn-beijing.maas.aliyuncs.com`，B 路径的 opencode 经 `/responses` 真实返回成功，该端点可用。）
- **B 的 `switch` 只证明「换 profile 后仍然可用」**：第二个 profile 复用同一份真实凭据与上游，`switch` 前后配置看起来一致，无法证明「上游真的换了」。想验证换上游需要第二套真实凭据，本环境不做。
- **单架构**：只支持 `linux/amd64`；不构建多架构、不发布镜像。
- **不进 CI**：需要真实凭据与外部网络，只在本地手动跑。
- **有真实调用成本**：A/B 各自会对四个工具各发一次最小 prompt，B 另有若干次鉴权/转发请求。
- 真跑用的是各工具自身默认的 agent 行为；prompt 里明确要求「不要调用任何工具」，但个别工具的额外行为（如自动读取项目文件）不在断言范围内。

## 目录内容

- `Dockerfile`：四家工具 + 从源码构建的 `agent-cli`。
- `docker-compose.yml`：两个一次性 service；构建上下文是仓库根。
- `.env.example`：变量模板（复制为 `docker/.env`）。
- `envs/<platform>.env.example`：五家平台各自的自包含模板（配合 `--env-file`）。
- `scripts/lib.sh`：日志、`fail()`、超时执行、profile 读取、清理。
- `scripts/assert-config.mjs`：四家配置内容与环境预期的一致性断言。
- `scripts/run-a-config-use.sh` / `scripts/run-b-token-server.sh`：A/B 两条流程。
