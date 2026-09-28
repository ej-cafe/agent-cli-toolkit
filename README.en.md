# agent-cli-toolkit

A TypeScript CLI toolkit that runs on Node.js and is organized as a pnpm monorepo. Its main capability today is managing cloud-platform API token profiles and syncing them into local configs for agent tools such as Claude Code, OpenCode, DeepSeek Harness (dsh), and pi.

Public command: `agent-cli`.

## Requirements

- Node.js >= 20
- pnpm 12 (see `packageManager` in the repo root)

## Install and run

Install the public npm package `agent-cli-toolkit`:

```bash
npm install -g agent-cli-toolkit
agent-cli --help
```

Build from source:

```bash
pnpm install
pnpm build
pnpm exec agent-cli --help
pnpm --filter @agent-cli-toolkit/cli dev   # run source with tsx
```

Global flags:

| Flag | Description |
|------|-------------|
| `--help` | Print help |
| `--version` | Print version |

## Config directory

On first run, a global config directory is created:

- Default: `~/.config/agent-cli-toolkit`
- If `XDG_CONFIG_HOME` is set: `$XDG_CONFIG_HOME/agent-cli-toolkit`

Token profiles (including each profile’s model list) are stored in `token-profile.json` under that directory.

`token-server` uses four more files: `token-server.json` (active profile name), `token-server.pid` (running server, `{ pid, host, port }`), `token-server.log` (daemon log), and `token-server.key` (server API key, mode 0600, created by `gen-api-key`).

## Command overview

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
agent-cli token-server use [--all | --tool <claude-code|opencode|dsh|pi>] [--model <id>]
agent-cli token-server gen-api-key
```

---

## `token add`

Add a cloud-platform token profile. On add, the CLI requests `{baseUrl}/models` with those credentials to fetch the model list. If that request fails, the profile is **not** written.

### Usage

```bash
# Interactive: omit flags and answer prompts in the terminal
agent-cli token add

# Pass all arguments at once
agent-cli token add \
  --name <name> \
  --platform <aliyun|tencent|deepseek|kimi|glm> \
  --token <token> \
  [--base-url <url>] \
  [--claude-base-url <url>] \
  [--product-type <personal|enterprise|enterprise-auto>]
```

### Flags

| Flag | Required | Description |
|------|----------|-------------|
| `--name` | Yes | Profile name (local unique key) |
| `--platform` | Yes | `aliyun`, `tencent`, `deepseek`, `kimi`, or `glm` |
| `--token` | Yes | API token (may appear in shell history; use with care) |
| `--base-url` | Platform-dependent | OpenAI-compatible API root URL |
| `--claude-base-url` | No | Anthropic-compatible API root URL |
| `--product-type` | No (tencent only; default `personal`) | Tencent Cloud TokenHub plan type: `personal` (personal plan, no usage query support), `enterprise` (enterprise pro plan), `enterprise-auto` (enterprise light plan) |

In non-interactive environments (stdin is not a TTY), missing required fields cause an immediate error; no prompts are shown.

### Platforms and default URLs

| Platform | `--base-url` | `--claude-base-url` |
|----------|--------------|---------------------|
| `aliyun` / `tencent` | **Required** | Optional |
| `deepseek` | Optional; default `https://api.deepseek.com` | Optional; default `https://api.deepseek.com/anthropic` |
| `kimi` | Optional; default `https://api.moonshot.cn/v1` (China endpoint) | Optional; default `https://api.moonshot.cn/anthropic` |
| `glm` | Optional; default `https://open.bigmodel.cn/api/coding/paas/v4` (China Coding Plan) | Optional; default `https://open.bigmodel.cn/api/anthropic` |

Explicit URLs override the presets. For Kimi’s international endpoint, override with the corresponding `api.moonshot.ai` URLs. For GLM pay-as-you-go use `https://open.bigmodel.cn/api/paas/v4`; for the international endpoint use the corresponding `api.z.ai` URLs.

In interactive mode, you can press Enter to accept presets for `deepseek` / `kimi` / `glm` base-url and claude-base-url; `aliyun` / `tencent` always require a base-url. For `tencent`, you are also asked for the plan type (default `personal`).

### Examples

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

Delete a saved profile by name.

### Usage

```bash
agent-cli token delete <name>
```

`<name>` is a required positional argument. On success the CLI prints `已删除 profile: <name>`.

### Example

```bash
agent-cli token delete ds
```

---

## `token list`

List all saved profiles. Tokens are masked (short tokens become `****`; otherwise the first and last 4 characters are kept).

### Usage

```bash
agent-cli token list
```

With no profiles, prints `暂无 profile`. Otherwise each profile includes:

- `platform`
- `baseUrl`
- `claudeBaseUrl` (if set)
- `token` (masked)
- `models` (count)

---

## `token use`

Write a profile into one or more local agent tool config files.

### Usage

```bash
agent-cli token use <name> [--all | --tool <id>] [--model <id>]
```

| Flag | Description |
|------|-------------|
| `--all` | Sync to all integrated tools |
| `--tool` | Target tool; repeatable: `claude-code`, `opencode`, `dsh`, `pi`. The display name for `dsh` is DeepSeek Harness (dsh) |
| `--model` | Default model id (must exist in that profile’s model list) |

If neither `--all` nor `--tool` is given, the CLI prompts for target tools (numbers or ids, comma/space separated). `--model` applies only to `claude-code`, `dsh`, and `pi`; passing `--model` when the only target is `opencode` is an error.

Tools whose config directory or matching program is missing are **skipped** (the config directory is not created), with a stderr note about what is missing. stdout lists only tools that were actually written. If every candidate is skipped, the command exits 0.

### Tool destinations and behavior

| `--tool` | Config path | Behavior |
|----------|-------------|----------|
| `claude-code` | `env` in `~/.claude/settings.json` | Sets `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_BASE_URL`; with `--model`, also sets `ANTHROPIC_MODEL` |
| `opencode` | `~/.config/opencode/opencode.json` (or `$XDG_CONFIG_HOME/opencode/opencode.json`) | Upserts a `provider` entry keyed by profile name, including the model list; `--model` has no effect |
| `dsh` | `$DSH_HOME/settings.yaml` (default `$DSH_HOME` is `~/.dsh`) and `.credentials.yaml` in the same directory | Writes `llm-pi-ai.providers.<name>`; with `--model`, also sets top-level `agent-default-model` |
| `pi` | `models.json` / `auth.json` / `settings.json` under `$PI_CODING_AGENT_DIR` (default `~/.pi/agent`) | Always sets `defaultProvider` (profile name) and `defaultModel`: uses `--model` when given, otherwise the first model in the list |

### Examples

```bash
# Sync to all tools
agent-cli token use ds --all

# Claude Code only, with a default model
agent-cli token use ds --tool claude-code --model deepseek-chat

# Multiple tools at once
agent-cli token use ds --tool claude-code --tool opencode --tool dsh --tool pi

# Apply to pi (without --model, uses the first list entry as defaultModel)
agent-cli token use ds --tool pi
agent-cli token use ds --tool pi --model deepseek-chat
```

---

## `token sync-model-list`

Re-request `{baseUrl}/models` for each target profile and update the local model list. Each profile uses its own baseUrl; there is no platform-wide shared catalog.

### Usage

```bash
agent-cli token sync-model-list [--name <profile>] [--platform <aliyun|tencent|deepseek|kimi|glm>]
```

| Flag | Description |
|------|-------------|
| `--name` | Sync only this profile |
| `--platform` | Filter by platform; when used with `--name`, mismatches are an error |

Omit `--name` to sync all matching targets (optionally filtered by `--platform`). On partial failure, successes are printed, failures go to stderr, and the exit code is 1.

### Examples

```bash
agent-cli token sync-model-list
agent-cli token sync-model-list --name ds
agent-cli token sync-model-list --platform aliyun
agent-cli token sync-model-list --platform kimi
agent-cli token sync-model-list --platform glm
```

---

## `token usage`

Query plan quota or account balance for saved profiles, printed per profile; each profile's output is separated by a blank line (success and failure alike).

### Usage

```bash
agent-cli token usage [--name <profile>] [--output table|text|raw]
```

| Flag | Description |
|------|-------------|
| `--name` | Query only this profile; omit to query all, sorted by name |
| `--output` | `table` (default CLI table), `text` (text summary), or `raw` (raw JSON) |

`--platform` is no longer supported; query by profile instead.

### Per-platform data sources

| Platform | Source | Notes |
|----------|--------|-------|
| `deepseek` | `GET {baseUrl}/user/balance` | Uses the profile API token |
| `kimi` | `GET {baseUrl}/users/me/balance` | Uses the profile API token |
| `aliyun` | Local `bl usage token-plan --output json` | Requires bailian-cli (`bl` on PATH) and `bl auth login --console` first; does **not** read the profile API key |
| `tencent` | Tencent Cloud TokenHub OpenAPI (`DescribeTokenPlanList`) | Uses environment variables `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY` to query the account's TokenPlan quota; region can be overridden with `TENCENTCLOUD_REGION`, default `ap-guangzhou`. No request is made when credentials are missing; a hint points to the console: https://console.cloud.tencent.com/tokenhub. Does **not** read the profile token. The profile's `productType` must be `enterprise` (enterprise pro plan) or `enterprise-auto` (enterprise light plan); `add` writes `personal` by default (personal plan does not support usage queries) |
| `glm` | — | API balance query not supported; open the console: https://bigmodel.cn/coding-plan/personal/usage |

Multiple aliyun profiles trigger only one `bl` call; multiple tencent profiles trigger only one TokenHub query (the result is reused). If one profile fails, the error goes to stderr and others continue; if all fail, the exit code is 1.

### Examples

```bash
agent-cli token usage
agent-cli token usage --name ds
agent-cli token usage --output text
agent-cli token usage --name kimi-cn --output raw
```

---

## `token-server`

A local credential-injecting forward proxy. Point a client’s baseUrl at the local port and the server injects the credentials of the active profile selected with `switch` / `use`, then forwards upstream. Switching while running takes effect on the next request — no client reconfiguration or restart needed. Before first use you must run `gen-api-key` to create the server API key (stored in `token-server.key`); the server validates every request against `Authorization: Bearer <key>` and returns 401 when the key is missing or mismatched, never forwarding the client’s key upstream.

### Usage

```bash
agent-cli token-server gen-api-key             # generate the server API key first (printed once; re-running rotates it)
agent-cli token-server switch <profile>        # only set the active profile
agent-cli token-server use [--all | --tool <id>] [--model <id>]
#  based on the active profile set by `switch`, points the selected tools at the local server,
#  writing the generated server key as the apiKey (does not change the active profile)
#  claude-code / opencode → /anthropic, dsh / pi → /v1
agent-cli token-server start                   # run in the background (default 127.0.0.1:8787; on success it prints both baseUrls and the apiKey)
agent-cli token-server start --port <port> [--foreground]
agent-cli token-server stop                    # terminate and clean up the pidfile
```

### Client baseUrl conventions

| Client type | baseUrl |
|-------------|---------|
| OpenAI-compatible | `http://127.0.0.1:8787/v1` |
| Anthropic-compatible (Claude Code, etc.) | `http://127.0.0.1:8787/anthropic` |

Routing is path-based: requests starting with `/anthropic` go to the active profile’s `claudeBaseUrl` (falling back to `baseUrl` when absent); all others go to `baseUrl`. The query string, method, and body are forwarded unchanged, and inbound `authorization` / `x-api-key` (after validation against the server key) are replaced with the active profile’s token — the server key is never forwarded upstream.

### Security boundary

- Binds only to the loopback address `127.0.0.1`, never accepts remote connections; every request must carry `Authorization: Bearer <key>` with a key generated by `token-server gen-api-key` (re-running it rotates the key — the old one stops working immediately).
- Until `gen-api-key` has been run, `start` / `use` fail and the server rejects every request.
- Do not run it on an untrusted machine; logs, error responses, and help text never contain the token or the key.

---

## Typical workflow

```bash
# 1. Add a DeepSeek profile (URLs can use presets)
agent-cli token add --name ds --platform deepseek --token sk-xxx

# 2. Inspect saved profiles
agent-cli token list

# 3. Sync into local agent tools
agent-cli token use ds --all --model deepseek-chat

# 4. Later: refresh models / check balance
agent-cli token sync-model-list --name ds
agent-cli token usage --name ds
```

## Contributing

1. Fork this repository
2. Create a feature branch
3. Commit your changes
4. Open a Pull Request

Remotes: primary GitHub `git@github.com:ej-cafe/agent-cli-toolkit.git` (`origin`), backup Gitee `git@gitee.com:galaxy-explorer/agent-cli-toolkit.git` (`gitee`). Default branch `master`.
