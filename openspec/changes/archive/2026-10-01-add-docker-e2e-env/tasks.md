## 1. 目录骨架与忽略规则

- [x] 1.1 新建 `docker/`、`docker/scripts/` 目录，新增根 `.dockerignore`（排除 `**/node_modules`、`.git`、`docker/.env`、`dist`），并在根 `.gitignore` 加 `docker/.env`；验证：`git status --porcelain` 不显示 `docker/.env`，`git check-ignore docker/.env` 命中

## 2. Docker 镜像

- [x] 2.1 写 `docker/Dockerfile`（基于 `node:22-bookworm-slim`——pin 的 `pi`/`claude-code` 要求 Node ≥ 22，装 `git`/`ca-certificates`/`curl`/`ripgrep`，创建非 root 用户 `tester`，`HOME=/home/tester`）；验证：`docker build` 到该层成功
- [x] 2.2 在 Dockerfile 内 pin 版本安装 `@anthropic-ai/claude-code`、`@earendil-works/pi-coding-agent`、`@deepseek-ai/dsh`（`npm i -g <pkg>@<ver>`），并用固定 URL + sha256 安装 opencode `2.0.19` 的 `opencode-linux-x64-baseline.tar.gz`；验证：构建时 sha256 校验通过，容器内 `claude --version && opencode --version && pi --version && dsh --version` 全部输出版本
- [x] 2.3 Dockerfile 内 `corepack enable` + `pnpm install --frozen-lockfile` + `pnpm build`，把 `apps/cli` 暴露为全局 `agent-cli`；验证：容器内 `agent-cli --version` 输出本仓版本、`agent-cli --help` 非空
- [x] 2.4 写 `docker/docker-compose.yml`（build context 为仓库根、`dockerfile: docker/Dockerfile`、`platform: linux/amd64`、凭据经 `environment` 插值注入（默认项目 `.env` 即 `docker/.env`，可用 `--env-file` 整体切换）、两个一次性 service `a-config-use` / `b-token-server`）；验证：`docker compose -f docker/docker-compose.yml config` 解析成功且列出两个 service

## 3. 环境变量与公共脚本

- [x] 3.1 写 `docker/.env.example`（`E2E_PLATFORM`=aliyun、`E2E_TOKEN`、`E2E_BASE_URL`、`E2E_CLAUDE_BASE_URL`、`E2E_MODEL`、`E2E_PROMPT`、`E2E_PROFILE_NAME`、`E2E_SWITCH_PROFILE_NAME`，含注释）、`docker/envs/<platform>.env.example`（五家平台各自的自包含模板，配合 `--env-file`）与 `docker/scripts/lib.sh`（日志、`fail()`、带超时执行、读取 `token-profile.json` 取默认模型、清理）；验证：`bash -n docker/scripts/lib.sh` 语法通过；缺 `.env` 必填项时脚本给出可读报错并退出非 0
- [x] 3.2 写 `docker/scripts/assert-config.mjs`（用仓库 `yaml` 依赖解析 `settings.yaml`/`.credentials.yaml`，原生 `JSON.parse` 解析 JSON；断言四家目标字段与 `.credentials.yaml` 0600 权限），暴露 CLI 子命令供 A/B 复用；验证：对一组手工构造的正确/错误样例分别退出 0 / 非 0

## 4. A：配置写入真实性

- [x] 4.1 写 `docker/scripts/run-a-config-use.sh`：`agent-cli token add`（用 `.env` 凭据，必须成功拉到 `/models`）；验证：单独运行到该步时 `token list` 显示新 profile 且含模型
- [x] 4.2 同上脚本：`mkdir -p` 四个配置目录后执行 `agent-cli token use <name> --all --model <id>`；验证：stdout 列出四个工具显示名，且四个配置文件均被创建
- [x] 4.3 同上脚本：调用 `assert-config.mjs` 断言四家内容（claude `settings.json` 的 `env.*`；opencode `provider.<name>.options.*` 与 `models`；dsh `llm-pi-ai.providers.<name>.*`、`.credentials.yaml` 的 `refs.<NAME>_API_KEY`、`agent-default-model`；pi `models.json`/`auth.json`/`settings.json`）；验证：断言全过；被跳过的工具会让脚本 fail 而非静默通过
- [x] 4.4 同上脚本：四家各真跑一轮最小 prompt（`claude -p` 加 `--allowedTools ""`、`opencode run`、`pi --print --no-tools`、`dsh --profile headless`），逐条设超时；验证：四条调用退出码 0 且输出非空
- [x] 4.5 运行 `docker compose run --rm a-config-use` 端到端；验证：退出码 0 且日志显示四家「写入 + 真跑」均通过；再临时改坏一处断言确认脚本以非 0 失败（确认不是假绿）

## 5. B：token-server 端到端

- [x] 5.1 写 `docker/scripts/run-b-token-server.sh`：`agent-cli token-server gen-api-key` → `start`（容器内 `127.0.0.1:8787`）；验证：`token-server.pid` 存在且进程在跑
- [x] 5.2 同上脚本：`agent-cli token-server use --all --model <id>` 把四家指向本地并写服务器 key；验证：`assert-config.mjs` 确认四家 baseUrl 指向 `127.0.0.1:8787` 且 apiKey 为服务器 key
- [x] 5.3 同上脚本：裸请求（无 key）断言 401、带正确 key 请求成功；验证：401 响应体与 HEAD 不含真实 token 或服务器 key
- [x] 5.4 同上脚本：四家经 token-server 各真跑一轮最小 prompt；验证：四条调用退出码 0 且输出非空（证明注入与转发生效）
- [x] 5.5 同上脚本：再 `token add` 第二个 profile → `token-server switch <name2>` → 再跑一轮请求；验证：switch 后请求仍成功，`token-server.json` 激活 profile 已更新
- [x] 5.6 同上脚本：断言 `token-server.log` 与错误响应不含真实 token 或服务器 key；验证：泄密检查通过
- [x] 5.7 运行 `docker compose run --rm b-token-server` 端到端；验证：退出码 0，401/鉴权/注入/四家真跑/switch/不泄密六项全过

## 6. 文档与回归

- [x] 6.1 写 `docker/README.md`（中文：前置条件、如何填 `.env`、如何分别跑 A/B、变量含义、如何解读失败、已知局限含 switch 不能证明换上游、无 CI/单架构说明）；验证：按 README 从零到跑通 A 的命令序列可执行
- [x] 6.2 根 `README.md` 增补一段指向 `docker/README.md` 的验收环境说明（只加指针，不复述目录树）；验证：链接路径存在且文字与实际命令一致
- [x] 6.3 回归：`pnpm build`、`pnpm typecheck`、`pnpm test` 全绿，确认 Docker 相关改动未影响既有构建与单测；验证：三条命令退出码均为 0
