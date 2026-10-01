# 四个真实 agent CLI + 本仓构建出的 agent-cli 的验收镜像。
# 详见 docker/README.md。设计见 openspec/changes/archive/2026-10-01-add-docker-e2e-env/design.md。
#
# 用 Node 22 而不是仓库 engines 的 20：pin 住的 pi 要求 node >= 22.19、
# claude-code 要求 node >= 22（见 design.md D4）。

# 基础镜像。默认官方名；在访问不到 Docker Hub 的环境里可覆盖为镜像源地址：
#   docker compose -f docker/docker-compose.yml build \
#     --build-arg NODE_IMAGE=docker.m.daocloud.io/library/node:22-bookworm-slim
ARG NODE_IMAGE=node:22-bookworm-slim
FROM ${NODE_IMAGE}

# apt 源主机名。默认官方 Debian CDN；访问它很慢的环境（见 docker/README.md）可覆盖：
#   --build-arg APT_MIRROR=mirrors.ustc.edu.cn
ARG APT_MIRROR=deb.debian.org

# npm / pnpm 使用的 registry。默认官方源；访问它很慢的环境可覆盖：
#   --build-arg REGISTRY=https://registry.npmmirror.com
ARG REGISTRY=https://registry.npmjs.org

# npm i -g 与 pnpm install 共用；写用户级 npmrc 即可两者生效。
RUN npm config set registry "${REGISTRY}"

# 四个 agent CLI 的版本：全部 pin，升级时同步改这里（见 design.md D4）。
ARG CLAUDE_CODE_VERSION=2.1.278
ARG PI_VERSION=0.87.1
ARG DSH_VERSION=0.1.5-rc.3
ARG OPENCODE_VERSION=2.0.19
# 取自上游 Homebrew formula anomalyco/tap/opencode-v2 对
# opencode-linux-x64-baseline.tar.gz 的 sha256。
ARG OPENCODE_SHA256=bf8f27ff6ffdae3f1a822213c15d5c51344fb50b70953f02b187cffe19543d56

RUN if [ "${APT_MIRROR}" != "deb.debian.org" ]; then \
      sed -i "s|deb.debian.org|${APT_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
  && apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl git ripgrep \
  && rm -rf /var/lib/apt/lists/*

# --- 三个 npm CLI（pin 版本）---
RUN npm i -g \
      "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
      "@earendil-works/pi-coding-agent@${PI_VERSION}" \
      "@deepseek-ai/dsh@${DSH_VERSION}" \
  && npm cache clean --force

# --- opencode v2 静态二进制（pin URL + 校验 sha256）---
# 注意：npm 上的 opencode-ai 是另一个产品（v1.x），不要用它。
RUN curl -fsSL -o /tmp/opencode.tar.gz \
      "https://opencode.ai/files/bin/${OPENCODE_VERSION}/opencode-linux-x64-baseline.tar.gz" \
  && echo "${OPENCODE_SHA256}  /tmp/opencode.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/opencode.tar.gz -C /usr/local/bin opencode \
  && chmod 0755 /usr/local/bin/opencode \
  && rm -f /tmp/opencode.tar.gz

# --- 从源码构建 agent-cli ---
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json tsconfig.json ./
COPY packages ./packages
COPY apps ./apps
RUN corepack enable \
  && COREPACK_NPM_REGISTRY="${REGISTRY}" pnpm install --frozen-lockfile \
  && pnpm build \
  && chmod +x /repo/apps/cli/dist/main.js \
  && ln -sf /repo/apps/cli/dist/main.js /usr/local/bin/agent-cli

# e2e 脚本随镜像提供；compose 会把宿主脚本只读挂载覆盖到同一路径，
# 便于改脚本不重建镜像。assert-config.mjs 从这里向上解析仓库的 yaml 依赖。
COPY docker/scripts /repo/docker/scripts
RUN chmod +x /repo/docker/scripts/*.sh

# 非 root 运行；容器内全新 $HOME，不挂载宿主机任何工具配置目录（design.md D1）。
# 1000 已被基础镜像的 node 用户占用，用 1001。
RUN useradd --create-home --shell /bin/bash --uid 1001 tester \
  && chown -R tester:tester /repo

USER tester
ENV HOME=/home/tester
WORKDIR /home/tester
CMD ["bash"]
