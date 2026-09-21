import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { tryFetchOpenAiModels } from "../src/openai-models.js";
import {
  jsonResponse,
  mockHttpFetch,
  statusResponse,
  timeoutError,
} from "./helpers.js";

afterEach(() => {
  mockHttpFetch(() => jsonResponse({}));
});

describe("tryFetchOpenAiModels", () => {
  it("parses models with name fallback to id", async () => {
    const restore = mockHttpFetch(() =>
      jsonResponse({
        data: [
          { id: "deepseek-chat", name: "DeepSeek Chat" },
          { id: "deepseek-reasoner" },
          "junk",
          { id: "  " },
          { name: "no id" },
        ],
      }),
    );
    try {
      const result = await tryFetchOpenAiModels(
        "https://example.test/v1",
        "t",
      );
      assert.deepEqual(result, {
        models: [
          { id: "deepseek-chat", name: "DeepSeek Chat" },
          { id: "deepseek-reasoner", name: "deepseek-reasoner" },
        ],
      });
    } finally {
      restore();
    }
  });

  it("rejects empty model lists", async () => {
    const restore = mockHttpFetch(() => jsonResponse({ data: [] }));
    try {
      const result = await tryFetchOpenAiModels(
        "https://example.test/v1",
        "t",
      );
      assert.equal(result.models, undefined);
      assert.match(result.reason ?? "", /响应无法解析或列表为空/);
    } finally {
      restore();
    }
  });

  it("reports http failures with status", async () => {
    const restore = mockHttpFetch(() => statusResponse(401));
    try {
      const result = await tryFetchOpenAiModels(
        "https://example.test/v1",
        "t",
      );
      assert.deepEqual(result, {
        models: undefined,
        reason: "GET https://example.test/v1/models 失败: HTTP 401",
      });
    } finally {
      restore();
    }
  });

  it("reports timeouts", async () => {
    const restore = mockHttpFetch(async () => {
      throw timeoutError();
    });
    try {
      const result = await tryFetchOpenAiModels(
        "https://example.test/v1",
        "t",
      );
      assert.deepEqual(result, {
        models: undefined,
        reason: "GET https://example.test/v1/models 超时",
      });
    } finally {
      restore();
    }
  });

  it("reports invalid baseUrl without fetching", async () => {
    let fetched = false;
    const restore = mockHttpFetch(() => {
      fetched = true;
      return jsonResponse({ data: [] });
    });
    try {
      const result = await tryFetchOpenAiModels("not a url", "t");
      assert.deepEqual(result, {
        models: undefined,
        reason: "baseUrl 无效",
      });
      assert.ok(!fetched);
    } finally {
      restore();
    }
  });
});
