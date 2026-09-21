import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fetchJson, joinUrlPath, setHttpFetch } from "../src/http.js";
import { jsonResponse, statusResponse, timeoutError } from "./helpers.js";

afterEach(() => {
  setHttpFetch(undefined);
});

describe("fetchJson", () => {
  it("returns parsed data on success", async () => {
    setHttpFetch(async () => jsonResponse({ ok: true, data: [1] }));
    const result = await fetchJson("https://example.test/v1/models", {
      headers: { Accept: "application/json" },
    });
    assert.deepEqual(result, { ok: true, data: { ok: true, data: [1] } });
  });

  it("reports http status failures", async () => {
    setHttpFetch(async () => statusResponse(401));
    const result = await fetchJson("https://example.test/v1/models", {
      headers: {},
    });
    assert.deepEqual(result, { ok: false, error: { kind: "http", status: 401 } });
  });

  it("reports invalid JSON bodies", async () => {
    setHttpFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("bad json");
      },
    }));
    const result = await fetchJson("https://example.test/v1/models", {
      headers: {},
    });
    assert.deepEqual(result, { ok: false, error: { kind: "json" } });
  });

  it("classifies TimeoutError as timeout", async () => {
    setHttpFetch(async () => {
      throw timeoutError();
    });
    const result = await fetchJson("https://example.test/v1/models", {
      headers: {},
    });
    assert.deepEqual(result, { ok: false, error: { kind: "timeout" } });
  });

  it("classifies other transport errors as network", async () => {
    setHttpFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    const result = await fetchJson("https://example.test/v1/models", {
      headers: {},
    });
    assert.deepEqual(result, { ok: false, error: { kind: "network" } });
  });

  it("sends GET with caller headers", async () => {
    let seen: { url: string; init: unknown } | undefined;
    setHttpFetch(async (url, init) => {
      seen = { url, init };
      return jsonResponse({});
    });
    await fetchJson("https://example.test/v1/models", {
      headers: { Authorization: "Bearer t" },
    });
    assert.equal(seen!.url, "https://example.test/v1/models");
    const init = seen!.init as { method: string; headers: Record<string, string> };
    assert.equal(init.method, "GET");
    assert.equal(init.headers.Authorization, "Bearer t");
  });
});

describe("joinUrlPath", () => {
  it("appends suffix and trims trailing slashes", () => {
    assert.equal(
      joinUrlPath("https://example.test/v1///", "/models"),
      "https://example.test/v1/models",
    );
  });

  it("returns undefined for empty baseUrl", () => {
    assert.equal(joinUrlPath("   ", "/models"), undefined);
  });

  it("returns undefined for invalid URL", () => {
    assert.equal(joinUrlPath("not a url", "/models"), undefined);
  });
});
