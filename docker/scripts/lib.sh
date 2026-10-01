#!/usr/bin/env bash
# e2e 脚本公共函数：日志、断言、超时、配置路径与 profile 读取。
# 被 run-a-config-use.sh / run-b-token-server.sh source。

set -euo pipefail

log()  { printf '[e2e] %s\n' "$*"; }
step() { printf '\n[e2e] ===== %s =====\n' "$*"; }

fail() {
  printf '[e2e][FAIL] %s\n' "$*" >&2
  exit 1
}

# 逐个检查必需环境变量非空，缺失时给出可读报错。
# 不用 ${!name} 间接展开：macOS bash 3.2 不支持带默认值的间接展开。
require_env() {
  local name
  for name in "$@"; do
    if [ -z "$(printenv "$name" 2>/dev/null || true)" ]; then
      fail "缺少必需环境变量 ${name}；请复制 docker/.env.example 为 docker/.env（或传 --env-file docker/envs/<platform>.env）并填写"
    fi
  done
}

# 带超时执行命令；超时或非零退出都视为失败。
run_timeout() {
  local secs="$1"; shift
  timeout --foreground "${secs}s" "$@" || fail "命令失败或超时（${secs}s）: $*"
}

# agent-cli-toolkit 的全局配置目录（与 core getConfigDir 的规则一致）。
config_dir() {
  printf '%s\n' "${XDG_CONFIG_HOME:-$HOME/.config}/agent-cli-toolkit"
}

# 从 token-profile.json 取指定 profile 的第一个模型 id；E2E_MODEL 优先。
default_model() {
  if [ -n "${E2E_MODEL:-}" ]; then
    printf '%s' "$E2E_MODEL"
    return 0
  fi
  node -e '
    const fs = require("fs");
    const [file, name] = process.argv.slice(1);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const id = data.profiles?.[name]?.models?.[0]?.id;
    if (typeof id !== "string" || id.trim() === "") process.exit(2);
    process.stdout.write(id);
  ' "$(config_dir)/token-profile.json" "${E2E_PROFILE_NAME:-e2e}" \
    || fail "无法从 profile 取到模型 id；请在 docker/.env 设置 E2E_MODEL"
}

# 读取 token-server 生成的服务器 key。
server_key() {
  cat "$(config_dir)/token-server.key"
}

# 带超时真跑一条命令，校验退出码 0 且输出非空。
run_tool() {
  local label="$1"; shift
  printf '\n[e2e] ===== 真跑 %s =====\n' "$label"
  local out code
  set +e
  out="$(timeout --foreground "${E2E_TIMEOUT:-120}s" "$@" 2>&1)"
  code=$?
  set -e
  printf '%s\n' "$out"
  if [ "$code" -ne 0 ]; then
    fail "$label 退出码 $code"
  fi
  if [ -z "$(printf '%s' "$out" | tr -d '[:space:]')" ]; then
    fail "$label 输出为空"
  fi
  log "$label 通过"
}

# 尽力停掉后台 token-server；用于 EXIT trap，不影响退出码。
cleanup_token_server() {
  if command -v agent-cli >/dev/null 2>&1; then
    agent-cli token-server stop >/dev/null 2>&1 || true
  fi
}
