import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, it } from "node:test";
import { runTokenUsage } from "../src/commands/usage.js";
import { setBlUsageExec } from "../src/platforms/aliyun.js";
import type { BlUsageExec } from "../src/platforms/aliyun.js";
import {
  setTokenHubClientFactory,
  setTokenPlanQuery,
} from "../src/platforms/tencent.js";
import type { TokenPlanQuery } from "../src/platforms/tencent.js";
import { profileFilePath, saveProfiles } from "../src/store.js";
import type { TokenProfile } from "../src/types.js";
import {
  captureStd,
  invalidJsonResponse,
  jsonResponse,
  mockHttpFetch,
  statusResponse,
  useTempXdgConfig,
} from "./helpers.js";

let cleanupXdg: () => void;

beforeEach(() => {
  ({ cleanup: cleanupXdg } = useTempXdgConfig());
  delete process.env.TENCENTCLOUD_SECRET_ID;
  delete process.env.TENCENTCLOUD_SECRET_KEY;
  delete process.env.TENCENTCLOUD_REGION;
});

afterEach(() => {
  setTokenPlanQuery(undefined);
  setTokenHubClientFactory(undefined);
  setBlUsageExec(undefined);
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

/** tencent profile：默认声明企业版专业套餐，可覆盖为其它 productType。 */
function tencentProfile(): TokenProfile {
  return profile({ platform: "tencent", productType: "enterprise" });
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

const tencentTokenPlans = {
  TokenPlanSet: [
    {
      TeamId: "team-1001",
      ProductType: "enterprise",
      Name: "默认专业套餐",
      Status: "enable",
      PackageInfo: {
        TotalQuota: "1000000",
        TotalUsed: "230000",
        CycleQuota: "100000",
        ExpireTime: "2027-03-22 00:00:00",
      },
    },
    {
      TeamId: "team-1002",
      ProductType: "enterprise-auto",
      Name: "",
      Status: "disable",
      PackageInfo: {
        TotalQuota: "500000",
      },
    },
    {
      TeamId: "team-1003",
      ProductType: "future-plan",
      Name: "未来套餐",
      Status: "enable",
      PackageInfo: {},
    },
  ],
  TotalCount: 3,
  RequestId: "req-abc",
};

const tencentSecretId = "test-secret-id-123";
const tencentSecretKey = "test-secret-key-456";

function setTencentEnv(): void {
  process.env.TENCENTCLOUD_SECRET_ID = tencentSecretId;
  process.env.TENCENTCLOUD_SECRET_KEY = tencentSecretKey;
}

function mockTokenPlanQuery(fn: TokenPlanQuery): () => void {
  setTokenPlanQuery(fn);
  return () => setTokenPlanQuery(undefined);
}

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
        tct: tencentProfile(),
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
      assert.match(
        stderr,
        /tct: 腾讯云 TokenHub 查询需要设置环境变量 TENCENTCLOUD_SECRET_ID、TENCENTCLOUD_SECRET_KEY/,
      );
    } finally {
      restore();
    }
  });

  it("fails glm usage without HTTP", async () => {
    saveProfiles({
      profiles: {
        zg: profile({
          platform: "glm",
          baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        }),
      },
    });
    let called = false;
    const restore = mockHttpFetch(() => {
      called = true;
      return statusResponse(500);
    });
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "zg"]),
      );
      assert.equal(code, 1);
      assert.equal(stdout, "");
      assert.match(
        stderr,
        /zg: 智谱 GLM 暂不支持 API 形式余额查询，请前往控制台查询。网址：https:\/\/bigmodel\.cn\/coding-plan\/personal\/usage/,
      );
      assert.equal(called, false);
    } finally {
      restore();
    }
  });

  it("returns 1 only when every segment fails", async () => {
    saveProfiles({
      profiles: { ds: profile(), tct: tencentProfile() },
    });
    const restore = mockHttpFetch(() => statusResponse(500));
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage([]),
      );
      assert.equal(code, 1);
      assert.equal(stdout, "");
      assert.match(stderr, /ds: GET .* 失败: HTTP 500/);
      assert.match(
        stderr,
        /ds: GET .* 失败: HTTP 500\n\ntct: 腾讯云 TokenHub 查询需要设置环境变量/,
      );
      assert.match(
        stderr,
        /tct: 腾讯云 TokenHub 查询需要设置环境变量 TENCENTCLOUD_SECRET_ID、TENCENTCLOUD_SECRET_KEY/,
      );
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

  it("queries tencent TokenHub with injected plan query", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const restore = mockTokenPlanQuery(async () => tencentTokenPlans);
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 0);
      assert.equal(stderr, "");
      assert.ok(stdout.includes("tcc (tencent)"));
      for (const header of ["套餐", "类型", "状态", "总额度", "已用", "当期额度", "到期时间"]) {
        assert.ok(stdout.includes(header), `missing header ${header}`);
      }
      assert.ok(stdout.includes("专业套餐（积分）"));
      assert.ok(stdout.includes("轻享套餐（token）"));
      // 缺名用 TeamId，缺字段填 -，未知 ProductType 类型列为 -
      assert.ok(stdout.includes("team-1002"));
      assert.match(
        stdout,
        /默认专业套餐\s+专业套餐（积分）\s+enable\s+1000000\s+230000\s+100000\s+2027-03-22 00:00:00/,
      );
      assert.match(
        stdout,
        /team-1002\s+轻享套餐（token）\s+disable\s+500000\s+-\s+-\s+-/,
      );
      assert.match(stdout, /未来套餐\s+-\s+enable\s+-\s+-\s+-\s+-/);
      assert.ok(!stdout.includes(tencentSecretKey));
    } finally {
      restore();
    }
  });

  it("shares one TokenHub query across tencent profiles", async () => {
    setTencentEnv();
    saveProfiles({
      profiles: {
        tx: tencentProfile(),
        tx2: tencentProfile(),
      },
    });
    let calls = 0;
    const restore = mockTokenPlanQuery(async () => {
      calls += 1;
      return tencentTokenPlans;
    });
    try {
      const { stdout, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 0);
      assert.equal(calls, 1);
      assert.ok(stdout.includes("tx (tencent)"));
      assert.ok(stdout.includes("tx2 (tencent)"));
      assert.ok(stdout.includes("\n\ntx2 (tencent)"));
    } finally {
      restore();
    }
  });

  it("rejects tencent query when credentials are missing", async () => {
    process.env.TENCENTCLOUD_SECRET_ID = "   ";
    delete process.env.TENCENTCLOUD_SECRET_KEY;
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    let called = false;
    const restore = mockTokenPlanQuery(() => {
      called = true;
      return Promise.resolve(tencentTokenPlans);
    });
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 1);
      assert.equal(stdout, "");
      assert.equal(called, false);
      assert.match(
        stderr,
        /tcc: 腾讯云 TokenHub 查询需要设置环境变量 TENCENTCLOUD_SECRET_ID、TENCENTCLOUD_SECRET_KEY/,
      );
      assert.match(stderr, /console\.cloud\.tencent\.com\/tokenhub/);
    } finally {
      restore();
    }
  });

  it("rejects tencent when productType is missing (personal)", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: profile({ platform: "tencent" }) } });
    let called = false;
    const restore = mockTokenPlanQuery(() => {
      called = true;
      return Promise.resolve(tencentTokenPlans);
    });
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 1);
      assert.equal(stdout, "");
      assert.equal(called, false);
      assert.match(stderr, /tcc: 腾讯云个人版暂不支持查询\n$/);
    } finally {
      restore();
    }
  });

  it("rejects tencent when productType is personal", async () => {
    setTencentEnv();
    saveProfiles({
      profiles: { tcc: profile({ platform: "tencent", productType: "personal" }) },
    });
    let called = false;
    const restore = mockTokenPlanQuery(() => {
      called = true;
      return Promise.resolve(tencentTokenPlans);
    });
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 1);
      assert.equal(stdout, "");
      assert.equal(called, false);
      assert.match(stderr, /tcc: 腾讯云个人版暂不支持查询\n$/);
    } finally {
      restore();
    }
  });

  it("fails tencent segment when the SDK request fails", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const restore = mockTokenPlanQuery(() =>
      Promise.reject(
        new Error("AuthFailure.SignatureFailure: 请求签名错误（伪造）"),
      ),
    );
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 1);
      assert.equal(stdout, "");
      assert.match(stderr, /tcc: 腾讯云 TokenHub 查询失败: AuthFailure\.SignatureFailure: /);
      assert.ok(!stderr.includes(tencentSecretKey));
      assert.ok(!stderr.includes(tencentSecretId));
    } finally {
      restore();
    }
  });

  it("renders 未找到 TokenPlan 套餐 for an empty TokenPlanSet", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const restore = mockTokenPlanQuery(async () => ({
      TokenPlanSet: [],
      TotalCount: 0,
      RequestId: "req-empty",
    }));
    try {
      const { stdout, stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 0);
      assert.equal(stderr, "");
      assert.ok(stdout.includes("tcc (tencent)"));
      assert.ok(stdout.includes("未找到 TokenPlan 套餐"));
    } finally {
      restore();
    }
  });

  it("supports raw output for tencent", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const restore = mockTokenPlanQuery(async () => tencentTokenPlans);
    try {
      const { stdout, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc", "--output", "raw"]),
      );
      assert.equal(code, 0);
      // raw 打印响应根对象，包含 TokenPlanSet 层，不拆层
      assert.ok(stdout.includes("tcc (tencent)"));
      assert.ok(stdout.includes('"TokenPlanSet"'));
      assert.ok(stdout.includes('"TotalCount"'));
      assert.ok(stdout.includes('"RequestId"'));
      assert.ok(stdout.includes('"team-1001"'));
    } finally {
      restore();
    }
  });
});

const aliyunTokenPlan = {
  per5HourPercentage: 0.1234,
  per5HourResetTime: Date.UTC(2027, 2, 22, 6, 30, 0),
  per1WeekPercentage: 0.5,
  per1WeekResetTime: Date.UTC(2027, 2, 25, 0, 0, 0),
  extraField: "keep-me",
};

function mockBlUsage(exec: BlUsageExec): () => void {
  setBlUsageExec(exec);
  return () => setBlUsageExec(undefined);
}

function blJsonResult(data: unknown): BlUsageExec {
  return async () => ({ stdout: JSON.stringify(data), stderr: "" });
}

function execFailure(props: Record<string, unknown>): Error {
  return Object.assign(new Error("exec failed"), props);
}

describe("aliyun usage", () => {
  it("renders the default table from bl JSON", async () => {
    saveProfiles({ profiles: { work: profile({ platform: "aliyun" }) } });
    const restore = mockBlUsage(blJsonResult(aliyunTokenPlan));
    try {
      const { stdout, stderr, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 0);
      assert.equal(stderr, "");
      assert.ok(stdout.includes("work (aliyun)"));
      for (const header of ["窗口", "已用", "重置时间"]) {
        assert.ok(stdout.includes(header), `missing header ${header}`);
      }
      assert.ok(stdout.includes("5 小时窗口"));
      assert.ok(stdout.includes("12.3%"));
      assert.ok(stdout.includes("7 天窗口"));
      assert.ok(stdout.includes("50%"));
    } finally {
      restore();
    }
  });

  it("queries a single aliyun profile with --name", async () => {
    saveProfiles({
      profiles: {
        work: profile({ platform: "aliyun" }),
        ds: profile(),
      },
    });
    const restore = mockBlUsage(blJsonResult(aliyunTokenPlan));
    try {
      const { stdout, code } = await captureStd(() =>
        runTokenUsage(["--name", "work"]),
      );
      assert.equal(code, 0);
      assert.ok(stdout.includes("work (aliyun)"));
      assert.ok(!stdout.includes("deepseek"));
    } finally {
      restore();
    }
  });

  it("renders aliyun text and raw output", async () => {
    saveProfiles({ profiles: { work: profile({ platform: "aliyun" }) } });
    const restore = mockBlUsage(blJsonResult(aliyunTokenPlan));
    try {
      const text = await captureStd(() =>
        runTokenUsage(["--name", "work", "--output", "text"]),
      );
      assert.equal(text.code, 0);
      assert.ok(text.stdout.includes("阿里云百炼 Token Plan 余量"));
      assert.ok(text.stdout.includes("5 小时窗口: 已用 12.3%"));
      assert.ok(!/窗口\s+已用\s+重置时间/.test(text.stdout));

      const raw = await captureStd(() =>
        runTokenUsage(["--name", "work", "--output", "raw"]),
      );
      assert.equal(raw.code, 0);
      assert.ok(raw.stdout.includes('"per5HourPercentage"'));
      assert.ok(raw.stdout.includes('"extraField"'));
    } finally {
      restore();
    }
  });

  it("falls back for empty aliyun payloads", async () => {
    saveProfiles({ profiles: { work: profile({ platform: "aliyun" }) } });
    const restore = mockBlUsage(blJsonResult({}));
    try {
      const table = await captureStd(() => runTokenUsage(["--name", "work"]));
      assert.equal(table.code, 0);
      assert.match(table.stdout, /窗口\s+已用\s+重置时间/);
      assert.match(table.stdout, /-\s+-\s+-/);

      const text = await captureStd(() =>
        runTokenUsage(["--name", "work", "--output", "text"]),
      );
      assert.equal(text.code, 0);
      assert.ok(text.stdout.includes("阿里云百炼 Token Plan 余量"));
    } finally {
      restore();
    }
  });

  it("shares one bl call across aliyun profiles", async () => {
    saveProfiles({
      profiles: {
        w1: profile({ platform: "aliyun" }),
        w2: profile({ platform: "aliyun" }),
      },
    });
    let calls = 0;
    const restore = mockBlUsage(async () => {
      calls += 1;
      return { stdout: JSON.stringify(aliyunTokenPlan), stderr: "" };
    });
    try {
      const { stdout, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 0);
      assert.equal(calls, 1);
      assert.ok(stdout.includes("w1 (aliyun)"));
      assert.ok(stdout.includes("\n\nw2 (aliyun)"));
    } finally {
      restore();
    }
  });

  it("reports a missing bl binary without querying", async () => {
    saveProfiles({ profiles: { work: profile({ platform: "aliyun" }) } });
    const restore = mockBlUsage(async () => {
      throw execFailure({ code: "ENOENT" });
    });
    try {
      const { stdout, stderr, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 1);
      assert.equal(stdout, "");
      assert.match(
        stderr,
        /work: 未找到 bl（bailian-cli）。请先安装并将其加入 PATH/,
      );
    } finally {
      restore();
    }
  });

  it("asks for console login when bl has no console token", async () => {
    saveProfiles({ profiles: { work: profile({ platform: "aliyun" }) } });
    const restore = mockBlUsage(async () => {
      throw execFailure({
        code: 1,
        stdout: JSON.stringify({ error: { message: "no console access token" } }),
      });
    });
    try {
      const { stderr, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 1);
      assert.match(stderr, /work: 请先执行: bl auth login --console/);
    } finally {
      restore();
    }
  });

  it("surfaces a non-JSON bl failure", async () => {
    saveProfiles({ profiles: { work: profile({ platform: "aliyun" }) } });
    const restore = mockBlUsage(async () => {
      throw execFailure({ code: 1, stderr: "boom" });
    });
    try {
      const { stderr, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 1);
      assert.match(stderr, /work: bl usage token-plan 失败: boom/);
    } finally {
      restore();
    }
  });

  it("reports empty and non-object bl output", async () => {
    saveProfiles({ profiles: { work: profile({ platform: "aliyun" }) } });

    const resolvedEmpty = mockBlUsage(async () => ({ stdout: "", stderr: "" }));
    try {
      const { stderr, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 1);
      assert.match(stderr, /work: bl usage token-plan 未返回内容/);
    } finally {
      resolvedEmpty();
    }

    const thrownEmpty = mockBlUsage(async () => {
      throw execFailure({ code: 1 });
    });
    try {
      const { stderr, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 1);
      assert.match(stderr, /work: bl usage token-plan 失败$/m);
    } finally {
      thrownEmpty();
    }

    const array = mockBlUsage(blJsonResult([1, 2, 3]));
    try {
      const { stderr, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 1);
      assert.match(
        stderr,
        /work: bl usage token-plan 返回的根节点必须是对象/,
      );
    } finally {
      array();
    }
  });

  it("keeps deepseek output when aliyun fails", async () => {
    saveProfiles({
      profiles: {
        work: profile({ platform: "aliyun" }),
        ds: profile(),
      },
    });
    const restoreBl = mockBlUsage(async () => {
      throw execFailure({ code: "ENOENT" });
    });
    const restoreHttp = mockBalances();
    try {
      const { stdout, stderr, code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 0);
      assert.ok(stdout.includes("ds (deepseek)"));
      assert.match(stderr, /work: 未找到 bl/);
    } finally {
      restoreBl();
      restoreHttp();
    }
  });
});

describe("usage does not mutate config", () => {
  it("leaves token-profile.json untouched", async () => {
    saveProfiles({ profiles: { ds: profile() } });
    const before = readFileSync(profileFilePath(), "utf8");
    const restore = mockBalances();
    try {
      const { code } = await captureStd(() => runTokenUsage([]));
      assert.equal(code, 0);
    } finally {
      restore();
    }
    assert.equal(readFileSync(profileFilePath(), "utf8"), before);
  });
});

describe("deepseek / kimi failure branches", () => {
  it("rejects an invalid deepseek baseUrl without fetching", async () => {
    saveProfiles({ profiles: { ds: profile({ baseUrl: "not a url" }) } });
    let called = false;
    const restore = mockHttpFetch(() => {
      called = true;
      return statusResponse(500);
    });
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "ds"]),
      );
      assert.equal(code, 1);
      assert.equal(called, false);
      assert.match(stderr, /ds: DeepSeek profile 的 baseUrl 无效/);
    } finally {
      restore();
    }
  });

  it("reports a deepseek JSON parse failure", async () => {
    saveProfiles({ profiles: { ds: profile() } });
    const restore = mockHttpFetch(() => invalidJsonResponse());
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "ds"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /ds: 无法解析 DeepSeek 余额响应为 JSON/);
    } finally {
      restore();
    }
  });

  it("rejects a non-object deepseek response", async () => {
    saveProfiles({ profiles: { ds: profile() } });
    const restore = mockHttpFetch(() => jsonResponse([1, 2]));
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "ds"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /ds: DeepSeek 余额响应根节点必须是对象/);
    } finally {
      restore();
    }
  });

  it("rejects an unparseable deepseek summary", async () => {
    saveProfiles({ profiles: { ds: profile() } });
    const restore = mockHttpFetch(() => jsonResponse({}));
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "ds"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /ds: DeepSeek 余额响应无法解析为可用摘要/);
    } finally {
      restore();
    }
  });

  it("supports deepseek raw output", async () => {
    saveProfiles({ profiles: { ds: profile() } });
    const restore = mockHttpFetch(() => jsonResponse(deepseekBalance));
    try {
      const { stdout, code } = await captureStd(() =>
        runTokenUsage(["--name", "ds", "--output", "raw"]),
      );
      assert.equal(code, 0);
      assert.ok(stdout.includes('"is_available"'));
      assert.ok(stdout.includes('"balance_infos"'));
    } finally {
      restore();
    }
  });

  it("rejects an invalid kimi baseUrl without fetching", async () => {
    saveProfiles({
      profiles: { km: profile({ platform: "kimi", baseUrl: "not a url" }) },
    });
    let called = false;
    const restore = mockHttpFetch(() => {
      called = true;
      return statusResponse(500);
    });
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "km"]),
      );
      assert.equal(code, 1);
      assert.equal(called, false);
      assert.match(stderr, /km: Kimi profile 的 baseUrl 无效/);
    } finally {
      restore();
    }
  });

  it("reports a kimi JSON parse failure", async () => {
    saveProfiles({ profiles: { km: profile({ platform: "kimi" }) } });
    const restore = mockHttpFetch(() => invalidJsonResponse());
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "km"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /km: 无法解析 Kimi 余额响应为 JSON/);
    } finally {
      restore();
    }
  });

  it("rejects kimi responses with status=false", async () => {
    saveProfiles({ profiles: { km: profile({ platform: "kimi" }) } });
    const restore = mockHttpFetch(() =>
      jsonResponse({ status: false, data: { available_balance: 1 } }),
    );
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "km"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /km: Kimi 余额查询失败（status=false）/);
    } finally {
      restore();
    }
  });

  it("rejects kimi responses with a non-zero code", async () => {
    saveProfiles({ profiles: { km: profile({ platform: "kimi" }) } });
    const restore = mockHttpFetch(() =>
      jsonResponse({ code: 500, data: { available_balance: 1 } }),
    );
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "km"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /km: Kimi 余额查询失败（code=500）/);
    } finally {
      restore();
    }
  });

  it("rejects a kimi response without data", async () => {
    saveProfiles({ profiles: { km: profile({ platform: "kimi" }) } });
    const restore = mockHttpFetch(() => jsonResponse({ code: 0 }));
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "km"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /km: Kimi 余额响应缺少 data 对象/);
    } finally {
      restore();
    }
  });

  it("rejects a non-object kimi response", async () => {
    saveProfiles({ profiles: { km: profile({ platform: "kimi" }) } });
    const restore = mockHttpFetch(() => jsonResponse("nope"));
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "km"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /km: Kimi 余额响应根节点必须是对象/);
    } finally {
      restore();
    }
  });

  it("rejects an unparseable kimi summary", async () => {
    saveProfiles({ profiles: { km: profile({ platform: "kimi" }) } });
    const restore = mockHttpFetch(() => jsonResponse({ code: 0, data: {} }));
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "km"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /km: Kimi 余额响应无法解析为可用摘要/);
    } finally {
      restore();
    }
  });
});

describe("tencent edge cases", () => {
  it("renders text output for plans", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const restore = mockTokenPlanQuery(async () => tencentTokenPlans);
    try {
      const { stdout, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc", "--output", "text"]),
      );
      assert.equal(code, 0);
      assert.ok(stdout.includes("腾讯云 TokenHub 套餐余量"));
      assert.ok(stdout.includes("默认专业套餐（专业套餐（积分））"));
      assert.ok(stdout.includes("状态: enable"));
      assert.ok(stdout.includes("总额度: 1000000"));
      assert.ok(stdout.includes("已用: 230000"));
      assert.ok(stdout.includes("当期额度: 100000"));
      assert.ok(stdout.includes("到期时间: 2027-03-22 00:00:00"));
      assert.ok(!/套餐\s+类型\s+状态/.test(stdout));
    } finally {
      restore();
    }
  });

  it("renders text output for an empty TokenPlanSet", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const restore = mockTokenPlanQuery(async () => ({ TokenPlanSet: [] }));
    try {
      const { stdout, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc", "--output", "text"]),
      );
      assert.equal(code, 0);
      assert.ok(stdout.includes("腾讯云 TokenHub 套餐余量"));
      assert.ok(stdout.includes("未找到 TokenPlan 套餐"));
    } finally {
      restore();
    }
  });

  it("names only the single missing tencent credential", async () => {
    setTencentEnv();
    delete process.env.TENCENTCLOUD_SECRET_KEY;
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    let called = false;
    const restore = mockTokenPlanQuery(() => {
      called = true;
      return Promise.resolve(tencentTokenPlans);
    });
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 1);
      assert.equal(called, false);
      assert.match(stderr, /需要设置环境变量 TENCENTCLOUD_SECRET_KEY/);
      assert.ok(!stderr.includes("TENCENTCLOUD_SECRET_ID"));
    } finally {
      restore();
    }
  });

  it("defaults the TokenHub region and honours TENCENTCLOUD_REGION", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const seen: Array<{ secretId: string; secretKey: string; region: string }> =
      [];
    const factory = (options: {
      secretId: string;
      secretKey: string;
      region: string;
    }) => {
      seen.push(options);
      return { DescribeTokenPlanList: async () => ({ TokenPlanSet: [] }) };
    };
    setTokenHubClientFactory(factory);
    try {
      const first = await captureStd(() => runTokenUsage(["--name", "tcc"]));
      assert.equal(first.code, 0);
      assert.equal(seen[0]!.region, "ap-guangzhou");
      assert.equal(seen[0]!.secretId, tencentSecretId);
      assert.equal(seen[0]!.secretKey, tencentSecretKey);

      process.env.TENCENTCLOUD_REGION = "ap-shanghai";
      setTokenHubClientFactory(factory);
      const second = await captureStd(() => runTokenUsage(["--name", "tcc"]));
      assert.equal(second.code, 0);
      assert.equal(seen[1]!.region, "ap-shanghai");
    } finally {
      setTokenHubClientFactory(undefined);
    }
  });

  it("rejects a non-object TokenHub response", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    setTokenHubClientFactory(() => ({
      DescribeTokenPlanList: async () => "nope",
    }));
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 1);
      assert.match(
        stderr,
        /tcc: 腾讯云 TokenHub DescribeTokenPlanList 响应根节点必须是对象/,
      );
    } finally {
      setTokenHubClientFactory(undefined);
    }
  });

  it("formats SDK errors that carry a code", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const restore = mockTokenPlanQuery(() =>
      Promise.reject({ code: "AuthFailure", message: "签名错误" }),
    );
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 1);
      assert.match(
        stderr,
        /tcc: 腾讯云 TokenHub 查询失败: AuthFailure: 签名错误/,
      );
    } finally {
      restore();
    }
  });

  it("stringifies non-Error SDK failures", async () => {
    setTencentEnv();
    saveProfiles({ profiles: { tcc: tencentProfile() } });
    const restore = mockTokenPlanQuery(() => Promise.reject("boom"));
    try {
      const { stderr, code } = await captureStd(() =>
        runTokenUsage(["--name", "tcc"]),
      );
      assert.equal(code, 1);
      assert.match(stderr, /tcc: 腾讯云 TokenHub 查询失败: boom/);
    } finally {
      restore();
    }
  });
});
