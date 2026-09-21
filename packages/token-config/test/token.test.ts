import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { runTokenCommand } from "../src/commands/token.js";
import { runTokenAdd } from "../src/commands/add.js";
import { TokenConfigError } from "../src/errors.js";
import { loadProfiles } from "../src/store.js";
import {
  captureStd,
  jsonResponse,
  mockHttpFetch,
  statusResponse,
  useTempXdgConfig,
} from "./helpers.js";

let cleanupXdg: () => void;

beforeEach(() => {
  ({ cleanup: cleanupXdg } = useTempXdgConfig());
});

afterEach(() => {
  cleanupXdg();
});

describe("runTokenCommand dispatch", () => {
  it("prints usage and exits 1 without a verb", async () => {
    const { stderr, code } = await captureStd(() => runTokenCommand([]));
    assert.equal(code, 1);
    assert.match(stderr, /^用法:/);
    assert.match(stderr, /agent-cli token add /);
    assert.match(stderr, /agent-cli token usage /);
  });

  it("exits 0 for --help and -h", async () => {
    assert.equal(await runTokenCommand(["--help"]), 0);
    assert.equal(await runTokenCommand(["-h"]), 0);
  });

  it("reports unknown verbs with exit 1", async () => {
    const { stderr, code } = await captureStd(() =>
      runTokenCommand(["nope"]),
    );
    assert.equal(code, 1);
    assert.match(stderr, /未知 token 命令: nope/);
  });

  it("translates unknown flags to a friendly error", async () => {
    await assert.rejects(
      runTokenCommand(["add", "--bogus"]),
      (error: unknown) =>
        error instanceof TokenConfigError &&
        error.message === "未知标志，请查看 agent-cli --help",
    );
  });

  it("dispatches list and prints 暂无 profile", async () => {
    const { stdout, code } = await captureStd(() =>
      runTokenCommand(["list"]),
    );
    assert.equal(code, 0);
    assert.equal(stdout, "暂无 profile\n");
  });
});

describe("runTokenAdd", () => {
  it("fails on missing required flags in non-TTY mode", async () => {
    await assert.rejects(
      runTokenAdd([]),
      (error: unknown) =>
        error instanceof TokenConfigError &&
        error.message === "缺少必填标志: --name",
    );
    await assert.rejects(
      runTokenAdd(["--name", "p", "--platform", "deepseek"]),
      /缺少必填标志: --token/,
    );
    // 无预设的平台仍要求 --base-url
    await assert.rejects(
      runTokenAdd(["--name", "p", "--platform", "aliyun", "--token", "t"]),
      /缺少必填标志: --base-url/,
    );
  });

  it("fails on unknown platform values", async () => {
    await assert.rejects(
      runTokenAdd(["--platform", "bad"]),
      /未知平台: bad/,
    );
  });

  it("resolves numeric alias and URL presets via the registry", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      const { stdout, code } = await captureStd(() =>
        runTokenAdd(["--name", "p", "--platform", "3", "--token", "t"]),
      );
      assert.equal(code, 0);
      assert.match(stdout, /已添加 profile: p/);

      const saved = loadProfiles().profiles.p;
      assert.equal(saved!.platform, "deepseek");
      assert.equal(saved!.baseUrl, "https://api.deepseek.com");
      assert.equal(saved!.claudeBaseUrl, "https://api.deepseek.com/anthropic");
      assert.deepEqual(saved!.models, [{ id: "m1", name: "M1" }]);
    } finally {
      restore();
    }
  });

  it("explicit URLs override presets", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      await runTokenAdd([
        "--name",
        "k1",
        "--platform",
        "kimi",
        "--token",
        "t",
        "--base-url",
        "https://api.moonshot.ai/v1",
        "--claude-base-url",
        "https://api.moonshot.ai/anthropic",
      ]);
      const saved = loadProfiles().profiles.k1;
      assert.equal(saved!.baseUrl, "https://api.moonshot.ai/v1");
      assert.equal(saved!.claudeBaseUrl, "https://api.moonshot.ai/anthropic");
    } finally {
      restore();
    }
  });

  it("rejects duplicate profile names", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      await runTokenAdd(["--name", "p", "--platform", "3", "--token", "t"]);
      await assert.rejects(
        runTokenAdd(["--name", "p", "--platform", "3", "--token", "t"]),
        /profile 已存在: p/,
      );
    } finally {
      restore();
    }
  });

  it("fails without saving when the models fetch fails", async () => {
    const restore = mockHttpFetch(() => statusResponse(401));
    try {
      await assert.rejects(
        runTokenAdd(["--name", "bad", "--platform", "3", "--token", "t"]),
        /无法获取 bad 模型列表/,
      );
      assert.equal(loadProfiles().profiles.bad, undefined);
    } finally {
      restore();
    }
  });
});
