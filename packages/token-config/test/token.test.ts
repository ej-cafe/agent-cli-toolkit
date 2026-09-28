import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, it } from "node:test";
import { runTokenCommand } from "../src/commands/token.js";
import { runTokenAdd } from "../src/commands/add.js";
import { runTokenSyncModelList } from "../src/commands/sync-model-list.js";
import { TokenConfigError } from "../src/errors.js";
import { loadProfiles, saveProfiles } from "../src/store.js";
import {
  captureStd,
  captureStdTee,
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

/** 以伪 TTY stdin 驱动交互式问答；返回后恢复 process.stdin。 */
async function withTty<T>(lines: string[], fn: () => Promise<T>): Promise<T> {
  const input = new PassThrough();
  Object.defineProperty(input, "isTTY", { value: true });
  void (async () => {
    for (const line of lines) {
      await new Promise((resolve) => setImmediate(resolve));
      if (input.destroyed) return;
      input.write(`${line}\n`);
    }
  })();
  const descriptor = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", {
    configurable: true,
    get: () => input,
  });
  try {
    return await fn();
  } finally {
    input.end();
    input.destroy();
    if (descriptor) {
      Object.defineProperty(process, "stdin", descriptor);
    }
  }
}

describe("runTokenCommand dispatch", () => {
  it("prints usage and exits 1 without a verb", async () => {
    const { stderr, code } = await captureStd(() => runTokenCommand([]));
    assert.equal(code, 1);
    assert.match(stderr, /^用法:/);
    assert.match(stderr, /agent-cli token add /);
    assert.match(stderr, /agent-cli token usage /);
  });

  it("exits 0 for --help and -h", async () => {
    const help = await captureStd(() => runTokenCommand(["--help"]));
    const short = await captureStd(() => runTokenCommand(["-h"]));
    assert.equal(help.code, 0);
    assert.equal(short.code, 0);
    assert.match(help.stderr, /DeepSeek Harness（dsh）/);
    assert.match(help.stderr, /配置目录或对应程序不存在时跳过该工具，且不创建该配置目录/);
    assert.match(help.stderr, /--tool 的取值仍是 dsh/);
    assert.match(help.stderr, /aliyun\|tencent\|deepseek\|kimi\|glm/);
    assert.match(help.stderr, /glm 预设为中国站 Coding Plan/);
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

  it("resolves glm Coding Plan presets when URLs are omitted", async () => {
    const restore = mockHttpFetch((url) => {
      assert.equal(
        String(url),
        "https://open.bigmodel.cn/api/coding/paas/v4/models",
      );
      return jsonResponse({ data: [{ id: "glm-5", name: "GLM-5" }] });
    });
    try {
      const { code } = await captureStd(() =>
        runTokenAdd(["--name", "zg", "--platform", "glm", "--token", "t"]),
      );
      assert.equal(code, 0);
      const saved = loadProfiles().profiles.zg;
      assert.equal(saved!.platform, "glm");
      assert.equal(
        saved!.baseUrl,
        "https://open.bigmodel.cn/api/coding/paas/v4",
      );
      assert.equal(
        saved!.claudeBaseUrl,
        "https://open.bigmodel.cn/api/anthropic",
      );
      assert.deepEqual(saved!.models, [{ id: "glm-5", name: "GLM-5" }]);
    } finally {
      restore();
    }
  });

  it("explicit URLs override glm Coding Plan presets", async () => {
    const restore = mockHttpFetch((url) => {
      assert.equal(String(url), "https://open.bigmodel.cn/api/paas/v4/models");
      return jsonResponse({ data: [{ id: "m1", name: "M1" }] });
    });
    try {
      await runTokenAdd([
        "--name",
        "zg",
        "--platform",
        "glm",
        "--token",
        "t",
        "--base-url",
        "https://open.bigmodel.cn/api/paas/v4",
        "--claude-base-url",
        "https://open.bigmodel.cn/api/anthropic",
      ]);
      const saved = loadProfiles().profiles.zg;
      assert.equal(saved!.baseUrl, "https://open.bigmodel.cn/api/paas/v4");
      assert.equal(
        saved!.claudeBaseUrl,
        "https://open.bigmodel.cn/api/anthropic",
      );
    } finally {
      restore();
    }
  });

  it("fails without saving when glm models fetch fails", async () => {
    const restore = mockHttpFetch(() => statusResponse(401));
    try {
      await assert.rejects(
        runTokenAdd(["--name", "zg", "--platform", "glm", "--token", "t"]),
        /无法获取 zg 模型列表/,
      );
      assert.equal(loadProfiles().profiles.zg, undefined);
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

  it("writes tencent productType default personal", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      await runTokenAdd([
        "--name",
        "tx",
        "--platform",
        "tencent",
        "--token",
        "t",
        "--base-url",
        "https://example.test/v1",
      ]);
      const saved = loadProfiles().profiles.tx;
      assert.equal(saved!.platform, "tencent");
      assert.equal(saved!.productType, "personal");
    } finally {
      restore();
    }
  });

  it("writes tencent productType from --product-type", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      await runTokenAdd([
        "--name",
        "tx",
        "--platform",
        "tencent",
        "--token",
        "t",
        "--base-url",
        "https://example.test/v1",
        "--product-type",
        "enterprise-auto",
      ]);
      assert.equal(loadProfiles().profiles.tx!.productType, "enterprise-auto");
    } finally {
      restore();
    }
  });

  it("writes tencent enterprise productType from --product-type", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      await runTokenAdd([
        "--name",
        "txe",
        "--platform",
        "tencent",
        "--token",
        "t",
        "--base-url",
        "https://example.test/v1",
        "--product-type",
        "enterprise",
      ]);
      assert.equal(loadProfiles().profiles.txe!.productType, "enterprise");
    } finally {
      restore();
    }
  });

  it("rejects invalid tencent productType without saving", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      await assert.rejects(
        runTokenAdd([
          "--name",
          "tx",
          "--platform",
          "tencent",
          "--token",
          "t",
          "--base-url",
          "https://example.test/v1",
          "--product-type",
          "basic",
        ]),
        /无效的套餐类型: basic/,
      );
      assert.equal(loadProfiles().profiles.tx, undefined);
    } finally {
      restore();
    }
  });

  it("rejects --product-type for non-tencent platforms", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      await assert.rejects(
        runTokenAdd([
          "--name",
          "p",
          "--platform",
          "deepseek",
          "--token",
          "t",
          "--product-type",
          "enterprise",
        ]),
        /仅 tencent 平台支持 --product-type/,
      );
      assert.equal(loadProfiles().profiles.p, undefined);
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

  it("fills missing flags interactively and defaults tencent productType", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      const { stdout, code } = await withTty(
        ["tx", "tencent", "", "t", "https://example.test/v1", ""],
        () => captureStdTee(() => runTokenAdd([])),
      );
      assert.equal(code, 0);
      assert.match(stdout, /套餐类型（默认 personal/);
      assert.match(stdout, /已添加 profile: tx/);
      const saved = loadProfiles().profiles.tx;
      assert.equal(saved!.platform, "tencent");
      assert.equal(saved!.productType, "personal");
    } finally {
      restore();
    }
  });

  it("accepts an interactive tencent productType", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      const { code } = await withTty(
        ["tx2", "tencent", "enterprise", "t", "https://example.test/v1", ""],
        () => captureStdTee(() => runTokenAdd([])),
      );
      assert.equal(code, 0);
      assert.equal(loadProfiles().profiles.tx2!.productType, "enterprise");
    } finally {
      restore();
    }
  });

  it("only asks for missing fields in interactive mode", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({ data: [{ id: "m1", name: "M1" }] }),
    );
    try {
      const { stdout, code } = await withTty(
        ["deepseek", "t", "", ""],
        () => captureStdTee(() => runTokenAdd(["--name", "p"])),
      );
      assert.equal(code, 0);
      assert.ok(!stdout.includes("名称: "));
      assert.ok(!stdout.includes("套餐类型"));
      const saved = loadProfiles().profiles.p;
      assert.equal(saved!.platform, "deepseek");
      assert.equal(saved!.baseUrl, "https://api.deepseek.com");
    } finally {
      restore();
    }
  });
});

describe("runTokenSyncModelList glm filter", () => {
  it("syncs only glm profiles when --platform glm", async () => {
    saveProfiles({
      profiles: {
        zg: {
          platform: "glm",
          token: "t",
          baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
          claudeBaseUrl: "https://open.bigmodel.cn/api/anthropic",
          models: [{ id: "old", name: "old" }],
        },
        work: {
          platform: "aliyun",
          token: "t",
          baseUrl: "https://example.openai/v1",
          models: [{ id: "a", name: "a" }],
        },
      },
    });
    const restore = mockHttpFetch((url) => {
      assert.equal(
        String(url),
        "https://open.bigmodel.cn/api/coding/paas/v4/models",
      );
      return jsonResponse({ data: [{ id: "glm-5", name: "GLM-5" }] });
    });
    try {
      const { stdout, code } = await captureStd(() =>
        runTokenSyncModelList(["--platform", "glm"]),
      );
      assert.equal(code, 0);
      assert.match(stdout, /已同步模型列表: zg/);
      assert.deepEqual(loadProfiles().profiles.zg!.models, [
        { id: "glm-5", name: "GLM-5" },
      ]);
      assert.deepEqual(loadProfiles().profiles.work!.models, [
        { id: "a", name: "a" },
      ]);
    } finally {
      restore();
    }
  });
});
