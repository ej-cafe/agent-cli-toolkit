#!/usr/bin/env node
// 断言 agent-cli `token use` / `token-server use` 写出的四家配置是否真实生效。
//
// 用法：
//   node assert-config.mjs a            # A：真实凭据直写
//   node assert-config.mjs b            # B：指向 token-server
//   node assert-config.mjs active-profile <name>
//   node assert-config.mjs no-secret <file> [<file>...]
//
// A/B 所需环境变量见 docker/.env.example；断言失败时以非 0 退出。
// 注意：任何断言消息都不打印 token / key 明文。

import { createRequire } from "node:module";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
// yaml 是 packages/token-config 的依赖，从该包解析，避免依赖仓库根的依赖提升。
const requireFromTokenConfig = createRequire(
  join(repoRoot, "packages", "token-config", "package.json"),
);
const YAML = requireFromTokenConfig("yaml");

const failures = [];
let checks = 0;

function ok(label) {
  checks += 1;
  console.log(`  ok   ${label}`);
}
function bad(label, detail) {
  checks += 1;
  failures.push(detail === undefined ? label : `${label}（${detail}）`);
  console.error(`  FAIL ${label}${detail === undefined ? "" : `（${detail}）`}`);
}
function check(label, condition, detail) {
  if (condition) {
    ok(label);
  } else {
    bad(label, detail);
  }
}
/** 比较凭据类字段：只报是否匹配，不打印任何一方的值。 */
function checkSecret(label, actual, expected) {
  check(label, actual === expected, actual === expected ? undefined : "值不匹配（不回显）");
}

function required(name) {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    console.error(`[assert] 缺少必需环境变量 ${name}`);
    process.exit(2);
  }
  return value.trim();
}
function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value.trim() === "" ? fallback : value.trim();
}
function homeDir() {
  return required("HOME");
}
function configDir() {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return join(xdg && xdg !== "" ? xdg : join(homeDir(), ".config"), "agent-cli-toolkit");
}
function xdgConfigDir() {
  const xdg = process.env.XDG_CONFIG_HOME?.trim();
  return xdg && xdg !== "" ? xdg : join(homeDir(), ".config");
}
function pathIfExists(path) {
  return existsSync(path);
}
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function readYaml(path) {
  return YAML.parse(readFileSync(path, "utf8"));
}
function readText(path) {
  return readFileSync(path, "utf8");
}
function fileMode(path) {
  return statSync(path).mode & 0o777;
}
function deriveApiKeyEnv(name) {
  return `${name.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}
function hasModel(list, id) {
  return Array.isArray(list) && list.some((m) => m !== null && typeof m === "object" && m.id === id);
}

// ---------------------------------------------------------------- 四家配置路径

function toolPaths() {
  const home = homeDir();
  const dshHome = process.env.DSH_HOME?.trim() || join(home, ".dsh");
  const piDir = process.env.PI_CODING_AGENT_DIR?.trim() || join(home, ".pi", "agent");
  return {
    claude: join(home, ".claude", "settings.json"),
    opencode: join(xdgConfigDir(), "opencode", "opencode.json"),
    dshHome,
    dshSettings: join(dshHome, "settings.yaml"),
    dshCredentials: join(dshHome, ".credentials.yaml"),
    piDir,
    piModels: join(piDir, "models.json"),
    piAuth: join(piDir, "auth.json"),
    piSettings: join(piDir, "settings.json"),
  };
}

// ---------------------------------------------------------------- 四家断言

function assertClaude(paths, cfg) {
  const label = "claude settings.json";
  if (!pathIfExists(paths.claude)) {
    bad(`${label} 存在`, "文件不存在");
    return;
  }
  const data = readJson(paths.claude);
  const env = data.env;
  if (env === null || typeof env !== "object") {
    bad(`${label} env 是对象`);
    return;
  }
  checkSecret(`${label} ANTHROPIC_AUTH_TOKEN`, env.ANTHROPIC_AUTH_TOKEN, cfg.credential);
  check(`${label} ANTHROPIC_BASE_URL`, env.ANTHROPIC_BASE_URL === cfg.claudeBase, "与期望地址不一致");
  check(`${label} ANTHROPIC_MODEL`, env.ANTHROPIC_MODEL === cfg.model, `期望 ${cfg.model}`);
}

function assertOpencode(paths, cfg) {
  const label = "opencode opencode.json";
  if (!pathIfExists(paths.opencode)) {
    bad(`${label} 存在`, "文件不存在");
    return;
  }
  const provider = readJson(paths.opencode).provider?.[cfg.profile];
  if (provider === null || typeof provider !== "object") {
    bad(`${label} provider.${cfg.profile} 存在`);
    return;
  }
  check(`${label} provider.<name>.name`, provider.name === cfg.profile);
  checkSecret(`${label} options.apiKey`, provider.options?.apiKey, cfg.credential);
  check(`${label} options.baseURL`, provider.options?.baseURL === cfg.opencodeBase, "与期望地址不一致");
  check(`${label} provider.npm`, provider.npm === cfg.opencodeNpm, `期望 ${cfg.opencodeNpm}`);
  check(`${label} models 含目标模型`, hasModel(Object.entries(provider.models ?? {}).map(([id, value]) => ({ id, ...(typeof value === "object" ? value : {}) })), cfg.model));
}

function assertDsh(paths, cfg) {
  const label = "dsh settings.yaml";
  const envName = deriveApiKeyEnv(cfg.profile);
  if (!pathIfExists(paths.dshSettings)) {
    bad(`${label} 存在`, "文件不存在");
    return;
  }
  const settings = readYaml(paths.dshSettings);
  const provider = settings?.["llm-pi-ai"]?.providers?.[cfg.profile];
  if (provider === null || typeof provider !== "object") {
    bad(`${label} llm-pi-ai.providers.<name> 存在`);
  } else {
    check(`${label} displayName`, provider.displayName === cfg.profile);
    check(`${label} api`, provider.api === "openai-completions", `期望 openai-completions`);
    check(`${label} baseURL`, provider.baseURL === cfg.dshBase, "与期望地址不一致");
    check(`${label} apiKeyEnv`, provider.apiKeyEnv === envName, `期望 ${envName}`);
    check(`${label} models 含目标模型`, hasModel(provider.models, cfg.model));
  }
  const def = settings?.["agent-default-model"];
  check(`${label} agent-default-model.provider`, def?.provider === cfg.profile);
  check(`${label} agent-default-model.model`, def?.model === cfg.model, `期望 ${cfg.model}`);
  check(`${label} 正文不含凭据明文`, !readText(paths.dshSettings).includes(cfg.credential));

  const credLabel = "dsh .credentials.yaml";
  if (!pathIfExists(paths.dshCredentials)) {
    bad(`${credLabel} 存在`, "文件不存在");
    return;
  }
  const creds = readYaml(paths.dshCredentials);
  check(`${credLabel} version`, creds?.version === 1);
  checkSecret(`${credLabel} refs.${envName}`, creds?.refs?.[envName], cfg.credential);
  check(`${credLabel} 权限 0600`, fileMode(paths.dshCredentials) === 0o600, `实际 ${fileMode(paths.dshCredentials).toString(8)}`);
  check("dsh home 权限 0700", fileMode(paths.dshHome) === 0o700, `实际 ${fileMode(paths.dshHome).toString(8)}`);
}

function assertPi(paths, cfg) {
  const label = "pi models.json";
  if (!pathIfExists(paths.piModels)) {
    bad(`${label} 存在`, "文件不存在");
    return;
  }
  const provider = readJson(paths.piModels).providers?.[cfg.profile];
  if (provider === null || typeof provider !== "object") {
    bad(`${label} providers.<name> 存在`);
  } else {
    check(`${label} baseUrl`, provider.baseUrl === cfg.piBase, "与期望地址不一致");
    check(`${label} api`, provider.api === "openai-completions", "期望 openai-completions");
    check(`${label} authHeader`, provider.authHeader === true);
    check(`${label} models 含目标模型`, hasModel(provider.models, cfg.model));
    check(`${label} 不含 apiKey 明文字段`, provider.apiKey === undefined);
    check(`${label} 正文不含凭据明文`, !readText(paths.piModels).includes(cfg.credential));
  }

  const authLabel = "pi auth.json";
  if (!pathIfExists(paths.piAuth)) {
    bad(`${authLabel} 存在`, "文件不存在");
  } else {
    const entry = readJson(paths.piAuth)[cfg.profile];
    check(`${authLabel} type`, entry?.type === "api_key");
    checkSecret(`${authLabel} key`, entry?.key, cfg.credential);
    check(`${authLabel} 权限 0600`, fileMode(paths.piAuth) === 0o600, `实际 ${fileMode(paths.piAuth).toString(8)}`);
  }

  const settingsLabel = "pi settings.json";
  if (!pathIfExists(paths.piSettings)) {
    bad(`${settingsLabel} 存在`, "文件不存在");
  } else {
    const settings = readJson(paths.piSettings);
    check(`${settingsLabel} defaultProvider`, settings.defaultProvider === cfg.profile);
    check(`${settingsLabel} defaultModel`, settings.defaultModel === cfg.model, `期望 ${cfg.model}`);
  }
}

function assertNoSecretInToolConfigs(paths, secret) {
  for (const [name, path] of Object.entries({
    "claude settings.json": paths.claude,
    "opencode opencode.json": paths.opencode,
    "dsh settings.yaml": paths.dshSettings,
    "dsh .credentials.yaml": paths.dshCredentials,
    "pi models.json": paths.piModels,
    "pi auth.json": paths.piAuth,
    "pi settings.json": paths.piSettings,
  })) {
    if (pathIfExists(path)) {
      check(`${name} 不含真实 token`, !readText(path).includes(secret));
    }
  }
}

// ---------------------------------------------------------------- 子命令

/**
 * `@ai-sdk/anthropic` 只在 baseURL 后面拼 `/messages`（默认 baseURL 自带 `/v1`），
 * 所以 opencode 的 baseURL 必须自带 `/v1`；而 claude-code 自己拼 `/v1/messages`，
 * 用的是不带 `/v1` 的 Claude 兼容地址。已以 `/v1` 结尾时不重复追加。
 */
function anthropicSdkBaseUrl(url) {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function runAssertAB(mode) {
  const profile = optional("E2E_PROFILE_NAME", "e2e");
  const model = required("E2E_MODEL");
  const realToken = required("E2E_TOKEN");
  const paths = toolPaths();

  let cfg;
  if (mode === "a") {
    const openaiBase = required("E2E_BASE_URL");
    const claudeBase = optional("E2E_CLAUDE_BASE_URL", openaiBase);
    cfg = {
      profile,
      model,
      credential: realToken,
      claudeBase,
      opencodeBase: anthropicSdkBaseUrl(claudeBase),
      opencodeNpm: "@ai-sdk/anthropic",
      dshBase: openaiBase,
      piBase: openaiBase,
    };
    console.log(`[assert] A：真实凭据直写（profile=${profile}, model=${model}）`);
  } else {
    const port = optional("E2E_SERVER_PORT", "8787");
    cfg = {
      profile,
      model,
      credential: required("E2E_SERVER_KEY"),
      claudeBase: `http://127.0.0.1:${port}/anthropic`,
      opencodeBase: `http://127.0.0.1:${port}/v1`,
      opencodeNpm: "@ai-sdk/openai",
      dshBase: `http://127.0.0.1:${port}/v1`,
      piBase: `http://127.0.0.1:${port}/v1`,
    };
    console.log(`[assert] B：指向 token-server（profile=${profile}, model=${model}, port=${port}）`);
  }

  assertClaude(paths, cfg);
  assertOpencode(paths, cfg);
  assertDsh(paths, cfg);
  assertPi(paths, cfg);
  if (mode === "b") {
    assertNoSecretInToolConfigs(paths, realToken);
  }
}

function runActiveProfile() {
  const expected = process.argv[3];
  if (expected === undefined) {
    console.error("用法: assert-config.mjs active-profile <name>");
    process.exit(2);
  }
  const path = join(configDir(), "token-server.json");
  if (!pathIfExists(path)) {
    bad("token-server.json 存在", "文件不存在");
  } else {
    check("token-server.json activeProfile", readJson(path).activeProfile === expected, `期望 ${expected}`);
  }
}

function runNoSecret() {
  const files = process.argv.slice(3);
  if (files.length === 0) {
    console.error("用法: assert-config.mjs no-secret <file> [<file>...]");
    process.exit(2);
  }
  const secrets = Object.entries(process.env)
    .filter(([key]) => key === "E2E_TOKEN" || key === "E2E_SERVER_KEY")
    .map(([, value]) => value?.trim() ?? "")
    .filter((value) => value !== "");
  if (secrets.length === 0) {
    console.error("[assert] no-secret 需要 E2E_TOKEN 或 E2E_SERVER_KEY 至少一个非空");
    process.exit(2);
  }
  for (const file of files) {
    if (!pathIfExists(file)) {
      bad(`${file} 存在`, "文件不存在");
      continue;
    }
    const text = readText(file);
    check(`${file} 不含凭据明文`, secrets.every((secret) => !text.includes(secret)));
  }
}

const mode = process.argv[2];
if (mode === "a" || mode === "b") {
  runAssertAB(mode);
} else if (mode === "active-profile") {
  runActiveProfile();
} else if (mode === "no-secret") {
  runNoSecret();
} else {
  console.error("用法: assert-config.mjs <a|b|active-profile <name>|no-secret <file>...>");
  process.exit(2);
}

if (failures.length > 0) {
  console.error(`\n[assert] ${failures.length}/${checks} 项断言失败：`);
  for (const item of failures) {
    console.error(`  - ${item}`);
  }
  process.exit(1);
}
console.log(`[assert] 全部通过（${checks} 项断言）`);
