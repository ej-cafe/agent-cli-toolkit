import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TokenConfigError } from "../src/errors.js";
import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_CLAUDE_BASE_URL,
  GLM_DEFAULT_BASE_URL,
  GLM_DEFAULT_CLAUDE_BASE_URL,
  KIMI_DEFAULT_BASE_URL,
  KIMI_DEFAULT_CLAUDE_BASE_URL,
} from "../src/types.js";
import {
  getPlatform,
  getPlatformOrAlias,
  isPlatform,
  listPlatforms,
} from "../src/platforms/registry.js";

describe("listPlatforms", () => {
  it("order defines numeric aliases", () => {
    const ids = listPlatforms().map((platform) => platform.id);
    assert.deepEqual(ids, ["aliyun", "tencent", "deepseek", "kimi", "glm"]);
    for (const [index, platform] of listPlatforms().entries()) {
      assert.equal(platform.aliases[0], String(index + 1));
      assert.ok(platform.aliases.includes(platform.id));
    }
  });
});

describe("isPlatform", () => {
  it("accepts the five ids", () => {
    for (const id of ["aliyun", "tencent", "deepseek", "kimi", "glm"]) {
      assert.ok(isPlatform(id));
    }
  });

  it("rejects aliases and unknown values", () => {
    assert.ok(!isPlatform("1"));
    assert.ok(!isPlatform("bad"));
  });
});

describe("getPlatform", () => {
  it("returns matching implementation", () => {
    assert.equal(getPlatform("aliyun").id, "aliyun");
  });

  it("presets match official constants", () => {
    assert.equal(getPlatform("aliyun").presets, undefined);
    assert.equal(getPlatform("tencent").presets, undefined);
    assert.deepEqual(getPlatform("deepseek").presets, {
      baseUrl: DEEPSEEK_DEFAULT_BASE_URL,
      claudeBaseUrl: DEEPSEEK_DEFAULT_CLAUDE_BASE_URL,
    });
    assert.deepEqual(getPlatform("kimi").presets, {
      baseUrl: KIMI_DEFAULT_BASE_URL,
      claudeBaseUrl: KIMI_DEFAULT_CLAUDE_BASE_URL,
    });
    assert.deepEqual(getPlatform("glm").presets, {
      baseUrl: GLM_DEFAULT_BASE_URL,
      claudeBaseUrl: GLM_DEFAULT_CLAUDE_BASE_URL,
    });
  });
});

describe("getPlatformOrAlias", () => {
  it("resolves numeric aliases and ids to the same implementation", () => {
    assert.equal(getPlatformOrAlias("1"), getPlatformOrAlias("aliyun"));
    assert.equal(getPlatformOrAlias("3"), getPlatformOrAlias("deepseek"));
    assert.equal(getPlatformOrAlias("4").id, "kimi");
    assert.equal(getPlatformOrAlias("5"), getPlatformOrAlias("glm"));
  });

  it("fails with the original message for unknown values", () => {
    assert.throws(
      () => getPlatformOrAlias("bad"),
      (error: unknown) =>
        error instanceof TokenConfigError && error.message === "未知平台: bad",
    );
  });
});
