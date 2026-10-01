## Why

当前对四个 agent 工具（Claude Code、OpenCode、DeepSeek Harness（dsh）、pi）的验证只到「配置文件目录存在且程序在 `PATH`」的桩测试；`token-server` 的 e2e 默认跳过、且只打真实百炼模型、不经过任何真实 agent 工具。因此缺少一条能证明「真实工具确实读得懂我们写入的配置、并能经 `token-server` 正常发出请求」的可复现路径。

真实工具在本机一条条手动装、手动试成本高且不可复现。需要一个一次构建、容器内全新隔离、可反复运行的验收环境。

## What Changes

- 新增顶层 `docker/`（不进 pnpm workspace）：
  - `Dockerfile`：`node:22-bookworm-slim` + 四个真实 CLI + 从本仓源码构建的 `agent-cli`（`linux/amd64`）。
  - `docker-compose.yml` + `.env.example`：用 compose 注入真实凭据，`.env` 被 gitignore。
  - `scripts/run-a-config-use.sh`：**A 配置写入真实性**——容器内 `token add` → 预创建四家配置目录 → `token use --all --model <id>` → 断言四家配置文件内容 → 四家各真跑一轮最小 prompt。
  - `scripts/run-b-token-server.sh`：**B token-server 端到端**——`gen-api-key` → `start` → `token-server use --all` → 401/鉴权断言 → 四家经本地服务器真跑一轮 → `token add` 第二个 profile + `switch` 热切换断言 → 断言日志与错误响应不泄露 token/key。
  - `README.md`：中文使用说明。
- 根 `.gitignore` 增加 `docker/.env`。
- 真实凭据仅经环境变量/compose 注入；容器内全新 `$HOME`，不挂载、不改写宿主机任何工具配置目录。

不改变任何对外 CLI 命令、`token-config` 行为或运行时依赖；不进 CI；不做多架构（先 `linux/amd64`）。

## Capabilities

### New Capabilities

无。本次为测试工具链，不引入可被生产代码依赖的新能力。

### Modified Capabilities

无。`token-config` 的规格级行为不变；本变更只新增验证手段，不新增或修改任何 requirement。据 schema 指引，测试工具链属 `skip_specs`（纯 tooling）情形，已在 `.openspec.yaml` 置 `skip_specs: true`，不虚构 spec。

## Impact

- 新增：`docker/Dockerfile`、`docker/docker-compose.yml`、`docker/.env.example`、`docker/scripts/*.sh`、`docker/scripts/assert-*.mjs`、`docker/README.md`、根 `.dockerignore`。
- 修改：根 `.gitignore`（加 `docker/.env`）。
- 不改动：`apps/`、`token-config` 规格、对外 CLI 行为、既有 `package.json` 脚本、CI（仓库暂无 CI）。实施期例外一处：A 实跑复现出 opencode 直写路径的 `baseURL` 缺 `/v1`（详见 `design.md` D11），已在 `packages/token-config/src/apply/opencode.ts` 修复并补单测；该修复不改变对外 CLI 命令与标志，也不影响 `token-server use` 写入的 `@ai-sdk/openai` 路径。
- 前置条件：本机有 Docker；运行需真实平台凭据，会消耗真实额度。
- 与现有测试关系：独立 shell 验收脚本，不并入 `node:test`，不替代现有单测。
