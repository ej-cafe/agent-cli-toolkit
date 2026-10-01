#!/usr/bin/env bash
# A：配置写入真实性 —— 用真实凭据 token add → token use --all → 断言四家配置 → 四家各真跑一轮。
# 用法：docker compose -f docker/docker-compose.yml run --rm a-config-use

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

E2E_TIMEOUT="${E2E_TIMEOUT:-120}"
NAME="${E2E_PROFILE_NAME:-e2e}"
PROMPT="${E2E_PROMPT:-只回复 pong，不要调用任何工具。}"
XDG="${XDG_CONFIG_HOME:-$HOME/.config}"
DSH="${DSH_HOME:-$HOME/.dsh}"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"

step "A1 前置检查"
require_env E2E_PLATFORM E2E_TOKEN
for bin in agent-cli node claude opencode pi dsh; do
  command -v "$bin" >/dev/null 2>&1 || fail "PATH 中找不到 $bin"
done
log "agent-cli 与四个工具均可用"
log "平台=$E2E_PLATFORM profile=$NAME"

step "A2 agent-cli token add（真实拉取 /models，失败即失败）"
add_args=(token add --name "$NAME" --platform "$E2E_PLATFORM" --token "$E2E_TOKEN")
if [ -n "${E2E_BASE_URL:-}" ]; then add_args+=(--base-url "$E2E_BASE_URL"); fi
if [ -n "${E2E_CLAUDE_BASE_URL:-}" ]; then add_args+=(--claude-base-url "$E2E_CLAUDE_BASE_URL"); fi
run_timeout "$E2E_TIMEOUT" agent-cli "${add_args[@]}"
agent-cli token list

node -e '
  const fs = require("fs");
  const file = process.argv[1];
  const name = process.argv[2];
  const p = JSON.parse(fs.readFileSync(file, "utf8")).profiles?.[name];
  if (!p) { console.error("profile 不存在: " + name); process.exit(1); }
  if (!Array.isArray(p.models) || p.models.length === 0) {
    console.error("profile 没有模型：/models 未成功拉取"); process.exit(1);
  }
  console.log("[e2e] profile 已就绪，模型数=" + p.models.length);
' "$(config_dir)/token-profile.json" "$NAME"

step "A3 建立四家配置目录（缺目录会被 token use 跳过）"
mkdir -p "$HOME/.claude" "$XDG/opencode" "$DSH" "$PI_DIR"

step "A4 agent-cli token use --all --model"
E2E_MODEL="$(default_model)"
export E2E_MODEL
log "使用模型: $E2E_MODEL"

set +e
use_out="$(timeout --foreground "${E2E_TIMEOUT}s" agent-cli token use "$NAME" --all --model "$E2E_MODEL" 2>&1)"
use_code=$?
set -e
printf '%s\n' "$use_out"
if [ "$use_code" -ne 0 ]; then fail "token use 退出码 $use_code"; fi
if printf '%s' "$use_out" | grep -q "跳过"; then
  fail "有工具被跳过（配置目录或程序缺失），A 流程覆盖不完整"
fi
for label in claude-code opencode "DeepSeek Harness（dsh）" pi; do
  if ! printf '%s' "$use_out" | grep -qF "$label"; then
    fail "token use 未写入 ${label}，可能被跳过"
  fi
done
log "四个工具均已写入"

step "A4b 断言四家配置内容"
node "$SCRIPT_DIR/assert-config.mjs" a

step "A5 四家各真跑一轮最小 prompt"
run_tool "claude" claude -p "$PROMPT" --allowedTools ""
run_tool "opencode" opencode run --standalone --model "$NAME/$E2E_MODEL" "$PROMPT"
run_tool "pi" pi --print --no-tools "$PROMPT"
run_tool "dsh" dsh --profile headless "$PROMPT"

step "A 结果"
log "A 流程全部通过：四家「写入 + 真跑」均成功"
