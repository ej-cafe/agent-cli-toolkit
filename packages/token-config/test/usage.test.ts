import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { runTokenUsage } from "../src/commands/usage.js";
import { saveProfiles } from "../src/store.js";
import type { TokenProfile } from "../src/types.js";
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

function profile(overrides: Partial<TokenProfile> = {}): TokenProfile {
  return {
    platform: "deepseek",
    token: "sk-test",
    baseUrl: "https://example.test/v1",
    models: [{ id: "m1", name: "M1" }],
    ...overrides,
  };
}

const deepseekBalance = {
  is_available: true,
  balance_infos: [
    {
      currency: "CNY",
      total_balance: "29.9",
      granted_balance: "0.0",
      topped_up_balance: "29.9",
    },
  ],
};

const kimiBalance = {
  code: 0,
  data: {
    available_balance: 93.672,
    voucher_balance: 0,
    cash_balance: 93.672,
  },
};

function mockBalances(): () => void {
  return mockHttpFetch((url) => {
    if (url.endsWith("/user/balance")) {
      return jsonResponse(deepseekBalance);
    }
    if (url.endsWith("/users/me/balance")) {
      return jsonResponse(kimiBalance);
    }
    return statusResponse(500);
  });
}

describe("runTokenUsage", () => {
  it("renders each profile segment with blank separators", async () => {
    saveProfiles({
      profiles: {
        ds: profile(),
        kim: profile({ platform: "kimi" }),
      },
    });
    const restore = mockBalances();
    try {
      const { stdout, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 0);
      assert.ok(stdout.includes("ds (deepseek)\n"));
      assert.ok(stdout.includes("可用: 是"));
      assert.ok(stdout.includes("CNY"));
      assert.ok(stdout.includes("kim (kimi)\n"));
      // 每段以换行结尾，join 后段间恰好一个空行
      assert.ok(stdout.includes("\n\nkim (kimi)"));
      // 默认输出为 table
      assert.ok(stdout.includes("币种"));
    } finally {
      restore();
    }
  });

  it("supports text and raw output", async () => {
    saveProfiles({ profiles: { kim: profile({ platform: "kimi" }) } });
    const restore = mockBalances();
    try {
      const text = await captureStd(() =>
        runTokenUsage(["--output", "text"]),
      );
      assert.ok(text.stdout.includes("Kimi 账户余额"));
      assert.ok(!text.stdout.includes("项目"));

      const raw = await captureStd(() => runTokenUsage(["--output", "raw"]));
      // raw 打印根对象（含 code 包装层），不是 data
      assert.ok(raw.stdout.includes('"code"'));
      assert.ok(raw.stdout.includes('"available_balance"'));
    } finally {
      restore();
    }
  });

  it("queries a single profile with --name", async () => {
    saveProfiles({
      profiles: { ds: profile(), kim: profile({ platform: "kimi" }) },
    });
    const restore = mockBalances();
    try {
      const { stdout } = await captureStd(() =>
        runTokenUsage(["--name", "ds"]),
      );
      assert.ok(stdout.includes("ds (deepseek)"));
      assert.ok(!stdout.includes("kimi"));
    } finally {
      restore();
    }
  });

  it("isolates per-profile failures and keeps partial output", async () => {
    saveProfiles({
      profiles: {
        ds: profile(),
        kim: profile({ platform: "kimi" }),
        tct: profile({ platform: "tencent" }),
      },
    });
    const restore = mockBalances();
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage([]),
      );
      // 部分失败但有成功段 → 退出码 0，失败段记入 stderr
      assert.equal(code, 0);
      assert.ok(stdout.includes("ds (deepseek)"));
      assert.match(stderr, /tct: 暂不支持腾讯云套餐余量查询/);
    } finally {
      restore();
    }
  });

  it("returns 1 only when every segment fails", async () => {
    saveProfiles({
      profiles: { ds: profile(), tct: profile({ platform: "tencent" }) },
    });
    const restore = mockHttpFetch(() => statusResponse(500));
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage([]),
      );
      assert.equal(code, 1);
      assert.equal(stdout, "");
      assert.match(stderr, /ds: GET .* 失败: HTTP 500/);
      assert.match(stderr, /tct: 暂不支持/);
    } finally {
      restore();
    }
  });

  it("prints 暂无 profile when the store is empty", async () => {
    const { stdout, code } = await captureStd(() => runTokenUsage([]));
    assert.equal(code, 0);
    assert.equal(stdout, "暂无 profile\n");
  });

  it("rejects unknown --output", async () => {
    await assert.rejects(
      runTokenUsage(["--output", "xml"]),
      /未知 --output: xml/,
    );
  });

  it("rejects the removed --platform flag", async () => {
    await assert.rejects(
      runTokenUsage(["--platform", "kimi"]),
      /已取消 --platform/,
    );
  });

  it("rejects positional arguments", async () => {
    await assert.rejects(runTokenUsage(["extra"]), /用法: agent-cli token usage/);
  });

  it("rejects a missing --name profile", async () => {
    saveProfiles({ profiles: { ds: profile() } });
    await assert.rejects(
      runTokenUsage(["--name", "missing"]),
      /profile 不存在: missing/,
    );
  });
});
