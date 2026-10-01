#!/usr/bin/env bash
# B：token-server 端到端 —— 起本地 server，把四家指向它，验证鉴权门/注入/转发/switch/不泄密。
# 用法：docker compose -f docker/docker-compose.yml run --rm b-token-server

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

E2E_TIMEOUT="${E2E_TIMEOUT:-120}"
NAME="${E2E_PROFILE_NAME:-e2e}"
NAME2="${E2E_SWITCH_PROFILE_NAME:-e2e-switch}"
PROMPT="${E2E_PROMPT:-只回复 pong，不要调用任何工具。}"
PORT="${E2E_SERVER_PORT:-8787}"
BASE="http://127.0.0.1:${PORT}"
XDG="${XDG_CONFIG_HOME:-$HOME/.config}"
DSH="${DSH_HOME:-$HOME/.dsh}"
PI_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
CONFIG="$(config_dir)"
WORK="$(mktemp -d)"
trap 'cleanup_token_server; rm -rf "$WORK"' EXIT

# 用 .env 凭据创建 profile（真实拉取 /models）。
add_profile() {
  local name="$1"
  local args=(token add --name "$name" --platform "$E2E_PLATFORM" --token "$E2E_TOKEN")
  if [ -n "${E2E_BASE_URL:-}" ]; then args+=(--base-url "$E2E_BASE_URL"); fi
  if [ -n "${E2E_CLAUDE_BASE_URL:-}" ]; then args+=(--claude-base-url "$E2E_CLAUDE_BASE_URL"); fi
  run_timeout "$E2E_TIMEOUT" agent-cli "${args[@]}"
}

step "B1 前置检查"
require_env E2E_PLATFORM E2E_TOKEN
for bin in agent-cli node curl claude opencode pi dsh; do
  command -v "$bin" >/dev/null 2>&1 || fail "PATH 中找不到 $bin"
done
log "agent-cli、四个工具与 curl 均可用"

step "B2 agent-cli token add（profile 1）"
add_profile "$NAME"

step "B3 gen-api-key → switch → start"
agent-cli token-server gen-api-key
agent-cli token-server switch "$NAME"
mkdir -p "$HOME/.claude" "$XDG/opencode" "$DSH" "$PI_DIR"
agent-cli token-server start --port "$PORT"

pid_file="$CONFIG/token-server.pid"
[ -f "$pid_file" ] || fail "pid 文件不存在: $pid_file"
pid="$(node -e 'const fs=require("fs");process.stdout.write(String(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).pid))' "$pid_file")"
kill -0 "$pid" 2>/dev/null || fail "token-server（pid ${pid}）不在运行"
log "token-server 运行中（pid ${pid}，${BASE}）"

E2E_SERVER_KEY="$(server_key)"
export E2E_SERVER_KEY E2E_SERVER_PORT="$PORT"
[ -n "$E2E_SERVER_KEY" ] || fail "token-server.key 为空"

step "B4 token-server use --all --model（四家指向本地）"
E2E_MODEL="$(default_model)"
export E2E_MODEL
log "使用模型: $E2E_MODEL"
agent-cli token-server use --all --model "$E2E_MODEL"
node "$SCRIPT_DIR/assert-config.mjs" b

step "B5 鉴权门：无 key 期望 401，带 key 期望成功"
code_no_key="$(curl -sS -o "$WORK/body-401.json" -D "$WORK/headers-401.txt" -w '%{http_code}' "$BASE/v1/models")"
[ "$code_no_key" = "401" ] || fail "无 key 期望 401，实际 $code_no_key"
log "无 key → 401"
code_ok="$(curl -sS -o "$WORK/body-ok.json" -D "$WORK/headers-ok.txt" -w '%{http_code}' -H "Authorization: Bearer $E2E_SERVER_KEY" "$BASE/v1/models")"
[ "$code_ok" = "200" ] || fail "带 key 期望 200，实际 ${code_ok}（转发未生效？）"
log "带 key → 200（转发到真实上游成功）"

node "$SCRIPT_DIR/assert-config.mjs" no-secret \
  "$WORK/body-401.json" "$WORK/headers-401.txt" "$WORK/body-ok.json" "$WORK/headers-ok.txt"

step "B6 四家经 token-server 各真跑一轮"
run_tool "claude" claude -p "$PROMPT" --allowedTools ""
run_tool "opencode" opencode run --standalone --model "$NAME/$E2E_MODEL" "$PROMPT"
run_tool "pi" pi --print --no-tools "$PROMPT"
run_tool "dsh" dsh --profile headless "$PROMPT"

step "B7 第二个 profile + switch"
add_profile "$NAME2"
agent-cli token-server switch "$NAME2"
node "$SCRIPT_DIR/assert-config.mjs" active-profile "$NAME2"
code_switched="$(curl -sS -o "$WORK/body-switched.json" -w '%{http_code}' -H "Authorization: Bearer $E2E_SERVER_KEY" "$BASE/v1/models")"
[ "$code_switched" = "200" ] || fail "switch 后期望 200，实际 $code_switched"
log "switch 后请求仍成功，激活 profile: $NAME2"

step "B8 不泄密检查（日志与响应）"
node "$SCRIPT_DIR/assert-config.mjs" no-secret \
  "$CONFIG/token-server.log" "$CONFIG/token-server.json" "$WORK/body-switched.json"

step "B 结果"
log "B 流程全部通过：401/鉴权/注入/四家真跑/switch/不泄密 六项全过"
