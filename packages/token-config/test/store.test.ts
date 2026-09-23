import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { TokenConfigError } from "../src/errors.js";
import {
  addProfile,
  deleteProfile,
  getProfile,
  loadProfiles,
  profileFilePath,
  saveProfiles,
  syncProfileModels,
} from "../src/store.js";
import type { TokenProfile } from "../src/types.js";
import { jsonResponse, mockHttpFetch, statusResponse } from "./helpers.js";
import { useTempXdgConfig } from "./helpers.js";

let configHome: string;
let cleanupXdg: () => void;

beforeEach(() => {
  ({ configHome, cleanup: cleanupXdg } = useTempXdgConfig());
});

afterEach(() => {
  cleanupXdg();
});

function profile(overrides: Partial<TokenProfile> = {}): TokenProfile {
  return {
    platform: "deepseek",
    token: "sk-test",
    baseUrl: "https://example.test/v1",
    models: [{ id: "m1", name: "M1" }],
    ...overrides,
  };
}

function writeProfileFile(value: unknown): void {
  mkdirSync(dirname(profileFilePath()), { recursive: true });
  writeFileSync(
    profileFilePath(),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

describe("loadProfiles", () => {
  it("returns empty store when file is missing", () => {
    assert.deepEqual(loadProfiles(), { profiles: {} });
  });

  it("parses a saved profile file", () => {
    writeProfileFile({
      profiles: {
        p: {
          platform: "kimi",
          token: "t",
          baseUrl: "https://example.test/v1",
          claudeBaseUrl: "https://example.test/anthropic",
          models: [{ id: "a", name: "A" }],
        },
      },
    });
    const { profiles } = loadProfiles();
    assert.deepEqual(profiles.p, {
      platform: "kimi",
      token: "t",
      baseUrl: "https://example.test/v1",
      claudeBaseUrl: "https://example.test/anthropic",
      models: [{ id: "a", name: "A" }],
    });
  });

  it("rejects a non-object profiles root", () => {
    writeProfileFile({ profiles: "bad" });
    assert.throws(
      () => loadProfiles(),
      (error: unknown) =>
        error instanceof TokenConfigError &&
        error.message === "token-profile.json 必须包含 profiles 对象",
    );
  });

  it("rejects an invalid platform", () => {
    writeProfileFile({
      profiles: { p: { platform: "bad", token: "t", baseUrl: "u", models: [] } },
    });
    assert.throws(
      () => loadProfiles(),
      /profile "p" 平台无效/,
    );
  });

  it("rejects a profile without token", () => {
    writeProfileFile({
      profiles: { p: { platform: "kimi", baseUrl: "u", models: [] } },
    });
    assert.throws(
      () => loadProfiles(),
      /缺少 token/,
    );
  });
});

describe("addProfile", () => {
  it("saves a profile after fetching models", async () => {
    const restore = mockHttpFetch((url) => {
      assert.equal(url, "https://example.test/v1/models");
      return jsonResponse({
        data: [{ id: "m1", name: "Model One" }],
      });
    });
    try {
      const saved = await addProfile({
        name: "p",
        platform: "deepseek",
        token: "t",
        baseUrl: "https://example.test/v1",
      });
      assert.deepEqual(saved.models, [{ id: "m1", name: "Model One" }]);
      assert.equal(loadProfiles().profiles.p!.models.length, 1);
    } finally {
      restore();
    }
  });

  it("fails on fetch error without writing the profile", async () => {
    const restore = mockHttpFetch(() => statusResponse(500));
    try {
      await assert.rejects(
        addProfile({
          name: "q",
          platform: "kimi",
          token: "t",
          baseUrl: "https://example.test/v1",
        }),
        /无法获取 q 模型列表/,
      );
      assert.equal(loadProfiles().profiles.q, undefined);
    } finally {
      restore();
    }
  });

  it("fails on duplicate name", async () => {
    saveProfiles({ profiles: { p: profile() } });
    await assert.rejects(
      addProfile({
        name: "p",
        platform: "deepseek",
        token: "t",
        baseUrl: "https://example.test/v1",
      }),
      /profile 已存在: p/,
    );
  });
});

describe("getProfile / deleteProfile", () => {
  it("fails for missing profile", () => {
    assert.throws(
      () => getProfile("missing"),
      (error: unknown) =>
        error instanceof TokenConfigError && error.message === "profile 不存在: missing",
    );
  });

  it("deletes an existing profile", () => {
    saveProfiles({ profiles: { p: profile(), q: profile() } });
    deleteProfile("p");
    const { profiles } = loadProfiles();
    assert.equal(profiles.p, undefined);
    assert.ok(profiles.q);
    assert.throws(() => deleteProfile("p"), /profile 不存在: p/);
  });
});

describe("syncProfileModels", () => {
  it("refreshes the model list in place", async () => {
    saveProfiles({ profiles: { p: profile() } });
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m2", name: "M2" }] }),
    );
    try {
      const models = await syncProfileModels("p");
      assert.deepEqual(models, [{ id: "m2", name: "M2" }]);
      assert.deepEqual(loadProfiles().profiles.p!.models, [
        { id: "m2", name: "M2" },
      ]);
    } finally {
      restore();
    }
  });

  it("fails for missing profile", async () => {
    await assert.rejects(syncProfileModels("missing"), /profile 不存在: missing/);
  });
});

describe("saveProfiles", () => {
  it("creates the config directory on demand", () => {
    saveProfiles({ profiles: { fresh: profile() } });
    assert.ok(loadProfiles().profiles.fresh);
    assert.ok(join(configHome, "agent-cli-toolkit").length > 0);
  });
});
