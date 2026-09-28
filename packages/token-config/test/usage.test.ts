import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { runTokenUsage } from "../src/commands/usage.js";
import { setTokenPlanQuery } from "../src/platforms/tencent.js";
import type { TokenPlanQuery } from "../src/platforms/tencent.js";
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
  delete process.env.TENCENTCLOUD_SECRET_ID;
  delete process.env.TENCENTCLOUD_SECRET_KEY;
  delete process.env.TENCENTCLOUD_REGION;
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
