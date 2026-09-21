import assert from "node:assert/strict";
import { after, afterEach, beforeEach, describe, it } from "node:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isMap, isSeq } from "yaml";
import { apiKeyEnvForProfile, applyDsh } from "../src/apply/dsh.js";
import { applyPi } from "../src/apply/pi.js";
import { applyOpenCode } from "../src/apply/opencode.js";
import { claudeCompatibleUrl } from "../src/apply/claude-url.js";
import { readJsonObject } from "../src/json-file.js";
import { loadYamlMap } from "../src/yaml-file.js";
import type { TokenProfile } from "../src/types.js";
import { useTempXdgConfig } from "./helpers.js";

const cleanupDirs: Array<() => void> = [];

after(() => {
  for (const cleanup of cleanupDirs.splice(0)) {
    cleanup();
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-cli-apply-"));
  cleanupDirs.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function profile(overrides: Partial<TokenProfile> = {}): TokenProfile {
  return {
    platform: "deepseek",
    token: "sk-test",
    baseUrl: "https://example.test/v1",
    models: [
      { id: "m1", name: "Model One" },
      { id: "m2", name: "Model Two" },
    ],
    ...overrides,
  };
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("claudeCompatibleUrl", () => {
  it("prefers claudeBaseUrl when set", () => {
    assert.equal(
      claudeCompatibleUrl(
        profile({ claudeBaseUrl: "https://example.test/anthropic" }),
      ),
      "https://example.test/anthropic",
    );
  });

  it("falls back to baseUrl for missing or blank claudeBaseUrl", () => {
    assert.equal(claudeCompatibleUrl(profile()), "https://example.test/v1");
    assert.equal(
      claudeCompatibleUrl(profile({ claudeBaseUrl: "   " })),
      "https://example.test/v1",
    );
  });
});

describe("apiKeyEnvForProfile", () => {
  it("derives an env var from the profile name", () => {
    assert.equal(apiKeyEnvForProfile("my-pro"), "MY_PRO_API_KEY");
  });

  it("fails for names that cannot form a posix env var", () => {
    assert.throws(() => apiKeyEnvForProfile("1bad"), /无法从 profile 名称派生/);
  });
});

describe("applyDsh", () => {
  beforeEach(() => {
    process.env.DSH_HOME = tempDir();
  });

  function settings() {
    return loadYamlMap(join(process.env.DSH_HOME!, "settings.yaml"));
  }

  function credentials() {
    return loadYamlMap(join(process.env.DSH_HOME!, ".credentials.yaml"));
  }

  it("writes provider, models, and credentials in refs form", () => {
    applyDsh("my-pro", profile(), "m1");

    const doc = settings();
    const provider = doc.getIn(["llm-pi-ai", "providers", "my-pro"]);
    assert.ok(isMap(provider));
    assert.equal(provider.get("displayName"), "my-pro");
    assert.equal(provider.get("api"), "openai-completions");
    assert.equal(provider.get("baseURL"), "https://example.test/v1");
    assert.equal(provider.get("apiKeyEnv"), "MY_PRO_API_KEY");
    const models = provider.get("models");
    assert.ok(isSeq(models));
    assert.equal(models.items.length, 2);
    assert.deepEqual(
      doc.getIn(["agent-default-model", "provider"]),
      "my-pro",
    );
    assert.equal(doc.getIn(["agent-default-model", "model"]), "m1");

    const creds = credentials();
    assert.equal(creds.get("version"), 1);
    assert.equal(creds.getIn(["refs", "MY_PRO_API_KEY"]), "sk-test");
  });

  it("migrates old flat credentials into refs", () => {
    writeFileSync(
      join(process.env.DSH_HOME!, ".credentials.yaml"),
      "OLD_KEY: previous\n",
      "utf8",
    );
    applyDsh("my-pro", profile());
    const creds = credentials();
    assert.equal(creds.get("version"), 1);
    assert.equal(creds.get("OLD_KEY"), undefined);
    assert.equal(creds.getIn(["refs", "OLD_KEY"]), "previous");
    assert.equal(creds.getIn(["refs", "MY_PRO_API_KEY"]), "sk-test");
  });

  it("upserts models without duplicating ids", () => {
    applyDsh("my-pro", profile());
    applyDsh(
      "my-pro",
      profile({
        models: [
          { id: "m1", name: "Renamed" },
          { id: "m3", name: "Model Three" },
        ],
      }),
    );
    const models = settings().getIn([
      "llm-pi-ai",
      "providers",
      "my-pro",
      "models",
    ]);
    assert.ok(isSeq(models));
    assert.deepEqual(
      models.items.map((item) => {
        assert.ok(isMap(item));
        return { id: item.get("id"), name: item.get("name") };
      }),
      [
        { id: "m1", name: "Renamed" },
        { id: "m2", name: "Model Two" },
        { id: "m3", name: "Model Three" },
      ],
    );
  });

  it("protects credentials file mode", () => {
    applyDsh("my-pro", profile());
    const mode = statSync(
      join(process.env.DSH_HOME!, ".credentials.yaml"),
    ).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it("omits agent-default-model without --model", () => {
    applyDsh("my-pro", profile());
    assert.equal(settings().get("agent-default-model"), undefined);
  });
});

describe("applyPi", () => {
  beforeEach(() => {
    process.env.PI_CODING_AGENT_DIR = tempDir();
  });

  it("writes provider, auth, and default settings", () => {
    applyPi("my-pro", profile(), "m2");

    const dir = process.env.PI_CODING_AGENT_DIR!;
    const modelsRoot = readJson(join(dir, "models.json"));
    const providers = modelsRoot.providers as Record<string, unknown>;
    const provider = providers["my-pro"] as Record<string, unknown>;
    assert.equal(provider.baseUrl, "https://example.test/v1");
    assert.equal(provider.api, "openai-completions");
    assert.equal(provider.authHeader, true);
    assert.deepEqual(provider.models, [
      { id: "m1", name: "Model One" },
      { id: "m2", name: "Model Two" },
    ]);

    const authRoot = readJson(join(dir, "auth.json"));
    assert.deepEqual(authRoot["my-pro"], { type: "api_key", key: "sk-test" });
    assert.equal(
      statSync(join(dir, "auth.json")).mode & 0o777,
      0o600,
    );

    const settingsRoot = readJson(join(dir, "settings.json"));
    assert.equal(settingsRoot.defaultProvider, "my-pro");
    assert.equal(settingsRoot.defaultModel, "m2");
  });

  it("upserts models and keeps unrelated providers", () => {
    const dir = process.env.PI_CODING_AGENT_DIR!;
    applyPi("other", profile(), "m1");
    applyPi("my-pro", profile(), "m1");
    applyPi(
      "my-pro",
      profile({
        models: [
          { id: "m1", name: "Renamed" },
          { id: "m3", name: "Model Three" },
        ],
      }),
      "m3",
    );

    const providers = readJson(join(dir, "models.json"))
      .providers as Record<string, unknown>;
    assert.ok(providers.other);
    assert.deepEqual((providers["my-pro"] as Record<string, unknown>).models, [
      { id: "m1", name: "Renamed" },
      { id: "m2", name: "Model Two" },
      { id: "m3", name: "Model Three" },
    ]);
    assert.equal(
      readJson(join(dir, "settings.json")).defaultModel,
      "m3",
    );
  });
});

describe("applyOpenCode", () => {
  let cleanupXdg: () => void;

  beforeEach(() => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
  });

  afterEach(() => {
    cleanupXdg();
  });

  function configPath(): string {
    return join(
      process.env.XDG_CONFIG_HOME!,
      "opencode",
      "opencode.json",
    );
  }

  it("creates a provider with npm fallback and options", () => {
    applyOpenCode("my-pro", profile({ claudeBaseUrl: "https://c.test" }));
    const root = readJson(configPath());
    const provider = (root.provider as Record<string, unknown>)[
      "my-pro"
    ] as Record<string, unknown>;
    assert.equal(provider.name, "my-pro");
    assert.equal(provider.npm, "@ai-sdk/anthropic");
    const options = provider.options as Record<string, unknown>;
    assert.equal(options.apiKey, "sk-test");
    assert.equal(options.baseURL, "https://c.test");
    assert.deepEqual(provider.models, {
      m1: { name: "Model One" },
      m2: { name: "Model Two" },
    });
  });

  it("keeps existing npm and unknown provider fields", () => {
    const path = configPath();
    applyOpenCode("my-pro", profile());
    // 第二次应用前手工添加一个未知字段与自定义 npm
    const edited = readJsonObject(path) ?? {};
    (edited.provider as Record<string, unknown>)["my-pro"] = {
      ...((edited.provider as Record<string, unknown>)["my-pro"] as object),
      custom: "keep",
      npm: "custom-npm",
    };
    writeFileSync(path, JSON.stringify(edited), "utf8");

    applyOpenCode(
      "my-pro",
      profile({ token: "sk-second", models: [{ id: "m2", name: "Renamed" }] }),
    );
    const provider = (readJson(configPath()).provider as Record<string, unknown>)[
      "my-pro"
    ] as Record<string, unknown>;
    assert.equal(provider.custom, "keep");
    assert.equal(provider.npm, "custom-npm");
    assert.equal(
      (provider.options as Record<string, unknown>).apiKey,
      "sk-second",
    );
    assert.deepEqual(provider.models, {
      m1: { name: "Model One" },
      m2: { name: "Renamed" },
    });
  });
});
