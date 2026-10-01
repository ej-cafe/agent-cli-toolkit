import assert from "node:assert/strict";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PassThrough, Readable } from "node:stream";
import { afterEach, describe, it } from "node:test";
import type { TokenProfile } from "@agent-cli-toolkit/token-config";
import { resolveActiveProfile } from "../src/active-profile.js";
import {
  createTokenServer,
  type TokenServerFetch,
} from "../src/server.js";
import { writeActiveProfile } from "../src/state.js";
import { profile, useTempXdgConfig, writeProfiles } from "./helpers.js";
import { installApiKey } from "./helpers.js";
import { readApiKey } from "../src/key.js";

const testApiKey = "test-server-key";

type SeenRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
};

/** 默认带正确鉴权头的请求选项；headers 里显式传 authorization 时覆盖。 */
function authHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  return { authorization: `Bearer ${testApiKey}`, ...extra };
}

type ClientResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function clientRequest(
  port: number,
  options: {
    path: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  },
): Promise<ClientResponse> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      {
        host: "127.0.0.1",
        port,
        method: options.method ?? "GET",
        path: options.path,
        headers: options.headers,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data });
        });
      },
    );
    req.on("error", reject);
    if (options.body !== undefined) {
      req.write(options.body);
    }
    req.end();
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

describe("token-server forwarding", () => {
  const servers: Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          }),
      ),
    );
  });

  async function start(
    options: {
      resolveProfile: () => TokenProfile | undefined;
      resolveApiKey?: () => string | undefined;
      fetchImpl: TokenServerFetch;
      log?: (line: string) => void;
    },
  ): Promise<number> {
    const server = createTokenServer({
      resolveProfile: options.resolveProfile,
      resolveApiKey: options.resolveApiKey ?? (() => testApiKey),
      fetchImpl: options.fetchImpl,
      log: options.log ?? (() => {}),
    });
    servers.push(server);
    return listen(server);
  }

  function recordingFetch(store: SeenRequest[], response = new Response("ok")) {
    const fetchImpl: TokenServerFetch = async (url, init) => {
      const body = init.body === undefined ? "" : await new Response(init.body).text();
      store.push({ url, method: init.method, headers: init.headers, body });
      return response.clone();
    };
    return fetchImpl;
  }

  it("forwards OpenAI paths to baseUrl and preserves the query string", async () => {
    const seen: SeenRequest[] = [];
    const port = await start({
      resolveProfile: () =>
        profile({ baseUrl: "https://api.example.com/v1", token: "secret-token" }),
      fetchImpl: recordingFetch(seen),
    });

    const res = await clientRequest(port, {
      path: "/chat/completions?x=1",
      headers: authHeaders({ "x-api-key": "client-owned" }),
    });

    assert.equal(res.status, 200);
    assert.equal(res.body, "ok");
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.url, "https://api.example.com/v1/chat/completions?x=1");
    assert.equal(seen[0]?.headers["authorization"], "Bearer secret-token");
    assert.equal(seen[0]?.headers["x-api-key"], undefined);
  });

  it("strips the local /v1 mount prefix so upstream URLs are not doubled", async () => {
    const seen: SeenRequest[] = [];
    const port = await start({
      resolveProfile: () =>
        profile({ baseUrl: "https://api.example.com/v1", token: "secret-token" }),
      fetchImpl: recordingFetch(seen),
    });

    // opencode（OpenAI 风格）baseURL 为 http://127.0.0.1:<port>/v1，
    // OpenAI SDK 会请求 /v1/chat/completions；上游 baseUrl 已含 /v1，不得拼成双 /v1。
    await clientRequest(port, {
      path: "/v1/chat/completions",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: "{}",
    });

    assert.equal(seen[0]?.url, "https://api.example.com/v1/chat/completions");
    assert.equal(seen[0]?.headers["authorization"], "Bearer secret-token");
  });

  it("routes /anthropic to claudeBaseUrl and strips the prefix", async () => {
    const seen: SeenRequest[] = [];
    const port = await start({
      resolveProfile: () =>
        profile({
          baseUrl: "https://api.example.com/v1",
          claudeBaseUrl: "https://api.example.com/anthropic",
          token: "secret-token",
        }),
      fetchImpl: recordingFetch(seen),
    });

    await clientRequest(port, {
      path: "/anthropic/v1/messages",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: '{"hello":1}',
    });

    assert.equal(seen[0]?.url, "https://api.example.com/anthropic/v1/messages");
    assert.equal(seen[0]?.headers["authorization"], "Bearer secret-token");
    assert.equal(seen[0]?.headers["x-api-key"], "secret-token");
    assert.equal(seen[0]?.body, '{"hello":1}');
  });

  it("falls back to baseUrl for /anthropic when claudeBaseUrl is missing", async () => {
    const seen: SeenRequest[] = [];
    const port = await start({
      resolveProfile: () =>
        profile({ baseUrl: "https://api.example.com/v1", token: "secret-token" }),
      fetchImpl: recordingFetch(seen),
    });

    await clientRequest(port, { path: "/anthropic/v1/messages", headers: authHeaders() });
    assert.equal(seen[0]?.url, "https://api.example.com/v1/v1/messages");
  });

  it("treats a bare /anthropic path as the upstream root", async () => {
    const seen: SeenRequest[] = [];
    const port = await start({
      resolveProfile: () =>
        profile({ baseUrl: "https://api.example.com", token: "secret-token" }),
      fetchImpl: recordingFetch(seen),
    });

    await clientRequest(port, { path: "/anthropic", headers: authHeaders() });
    assert.equal(seen[0]?.url, "https://api.example.com/");
  });

  it("joins base paths and forwarding paths with a single slash", async () => {
    const seen: SeenRequest[] = [];
    const port = await start({
      resolveProfile: () =>
        profile({ baseUrl: "https://api.example.com/v1/", token: "secret-token" }),
      fetchImpl: recordingFetch(seen),
    });

    await clientRequest(port, { path: "/models", headers: authHeaders() });
    assert.equal(seen[0]?.url, "https://api.example.com/v1/models");
  });

  it("omits the request body for GET", async () => {
    const seen: SeenRequest[] = [];
    const port = await start({
      resolveProfile: () => profile(),
      fetchImpl: recordingFetch(seen),
    });

    await clientRequest(port, { path: "/models", headers: authHeaders() });
    assert.equal(seen[0]?.body, "");
  });

  it("preserves the upstream status code", async () => {
    const port = await start({
      resolveProfile: () => profile(),
      fetchImpl: async () => new Response("slow down", { status: 429 }),
    });

    const res = await clientRequest(port, { path: "/models", headers: authHeaders() });
    assert.equal(res.status, 429);
    assert.equal(res.body, "slow down");
  });

  it("returns 503 without calling upstream when there is no active profile", async () => {
    let called = false;
    const port = await start({
      resolveProfile: () => undefined,
      fetchImpl: async () => {
        called = true;
        return new Response("nope");
      },
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 503);
    assert.match(res.body, /switch/);
    assert.equal(called, false);
  });

  it("returns 502 when the upstream request fails", async () => {
    const logs: string[] = [];
    const port = await start({
      resolveProfile: () => profile({ token: "secret-token" }),
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
      log: (line) => logs.push(line),
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 502);
    assert.equal(res.body.includes("secret-token"), false);
    assert.equal(logs.join("\n").includes("secret-token"), false);
    assert.equal(logs.join("\n").toLowerCase().includes("authorization"), false);
  });

  it("returns 503 when reading the profile throws, without calling upstream", async () => {
    let called = false;
    const port = await start({
      resolveProfile: () => {
        throw new Error("bad profile file");
      },
      fetchImpl: async () => {
        called = true;
        return new Response("nope");
      },
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 503);
    assert.equal(called, false);
  });

  it("returns 401 without calling upstream when the api key is missing or wrong", async () => {
    let called = 0;
    const fetchImpl: TokenServerFetch = async () => {
      called += 1;
      return new Response("nope");
    };

    // 服务器未配置 key：任何请求都拒绝。
    const noKeyPort = await start({
      resolveProfile: () => profile(),
      resolveApiKey: () => undefined,
      fetchImpl,
    });
    let res = await clientRequest(noKeyPort, { path: "/v1/models" });
    assert.equal(res.status, 401);
    assert.match(res.body, /invalid token-server api key/);
    assert.equal(called, 0);

    // 请求缺少 key。
    const keyedPort = await start({
      resolveProfile: () => profile(),
      fetchImpl,
    });
    res = await clientRequest(keyedPort, { path: "/v1/models" });
    assert.equal(res.status, 401);
    assert.equal(called, 0);

    // 请求携带错误的 key。
    res = await clientRequest(keyedPort, {
      path: "/v1/models",
      headers: { authorization: "Bearer wrong-key" },
    });
    assert.equal(res.status, 401);
    assert.equal(called, 0);
    assert.equal(res.body.includes(testApiKey), false);

    // 请求携带错误的 x-api-key（Anthropic 风格头）。
    res = await clientRequest(keyedPort, {
      path: "/v1/models",
      headers: { "x-api-key": "wrong-key" },
    });
    assert.equal(res.status, 401);
    assert.equal(called, 0);
  });

  it("accepts x-api-key auth as the Anthropic-style equivalent of Authorization: Bearer", async () => {
    const seen: SeenRequest[] = [];
    const port = await start({
      resolveProfile: () => profile(),
      fetchImpl: recordingFetch(seen),
    });

    // x-api-key 与 key 匹配：通过鉴权并转发，且不入注入真实凭据时带 client-owned 头。
    let res = await clientRequest(port, {
      path: "/anthropic/v1/messages",
      headers: { "x-api-key": testApiKey },
    });
    assert.equal(res.status, 200);
    assert.equal(seen.length, 1);
    assert.equal(seen[0]?.headers["authorization"], "Bearer secret-token");
    assert.equal(seen[0]?.headers["x-api-key"], "secret-token");

    // x-api-key 已鉴权通过时，authorization 缺失也放行；反之亦然。
    res = await clientRequest(port, {
      path: "/v1/models",
      headers: { "x-api-key": testApiKey },
    });
    assert.equal(res.status, 200);
    assert.equal(seen.length, 2);
    assert.equal(seen[1]?.headers["authorization"], "Bearer secret-token");

    // 两个头都不带或都错误：401。
    res = await clientRequest(port, { path: "/v1/models" });
    assert.equal(res.status, 401);
    assert.equal(seen.length, 2);
    res = await clientRequest(port, {
      path: "/v1/models",
      headers: { "x-api-key": testApiKey, authorization: "Bearer wrong-key" },
    });
    assert.equal(res.status, 200);
    assert.equal(seen.length, 3);
  });

  it("re-reads the api key on every request so rotation takes effect", async () => {
    const { cleanup } = useTempXdgConfig();
    const logs: string[] = [];
    try {
      installApiKey("key-a");
      const seen: SeenRequest[] = [];
      const port = await start({
        resolveProfile: () => profile(),
        resolveApiKey: readApiKey,
        fetchImpl: recordingFetch(seen),
        log: (line) => logs.push(line),
      });

      let res = await clientRequest(port, {
        path: "/v1/models",
        headers: { authorization: "Bearer key-a" },
      });
      assert.equal(res.status, 200);
      assert.equal(seen.length, 1);

      installApiKey("key-c");
      res = await clientRequest(port, {
        path: "/v1/models",
        headers: { authorization: "Bearer key-b" },
      });
      assert.equal(res.status, 401);
      assert.equal(seen.length, 1);

      res = await clientRequest(port, {
        path: "/v1/models",
        headers: { authorization: "Bearer key-c" },
      });
      assert.equal(res.status, 200);
      assert.equal(seen.length, 2);
      assert.equal(logs.join("\n").includes("key-b"), false);
      assert.equal(logs.join("\n").includes("key-c"), false);
    } finally {
      cleanup();
    }
  });

  it("streams upstream chunks as they arrive without buffering", async () => {
    const upstream = new PassThrough();
    const port = await start({
      resolveProfile: () => profile(),
      fetchImpl: async () =>
        new Response(Readable.toWeb(upstream) as ReadableStream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
    });

    const received: string[] = [];
    const firstChunk = new Promise<void>((resolve, reject) => {
      const req = httpRequest(
        { host: "127.0.0.1", port, path: "/events" },
        (res) => {
          res.setEncoding("utf8");
          res.on("data", (chunk: string) => {
            received.push(chunk);
            resolve();
          });
          res.on("error", reject);
        },
      );
      req.setHeader("authorization", `Bearer ${testApiKey}`);
      req.on("error", reject);
      req.end();
    });

    upstream.write("data: one\n\n");
    await firstChunk;
    assert.deepEqual(received, ["data: one\n\n"]);

    upstream.write("data: two\n\n");
    upstream.end();
    await sleep(50);
    assert.equal(received.join(""), "data: one\n\ndata: two\n\n");
  });

  it("re-reads the active profile on every request so switch takes effect", async () => {
    const { cleanup } = useTempXdgConfig();
    try {
      writeProfiles({
        a: profile({ baseUrl: "https://a.example.com", token: "token-a" }),
        b: profile({ baseUrl: "https://b.example.com", token: "token-b" }),
      });
      writeActiveProfile("a");

      const seen: SeenRequest[] = [];
      const port = await start({
        resolveProfile: resolveActiveProfile,
        fetchImpl: recordingFetch(seen),
      });

      await clientRequest(port, { path: "/v1/ping", headers: authHeaders() });
      assert.equal(seen[0]?.url, "https://a.example.com/ping");
      assert.equal(seen[0]?.headers["authorization"], "Bearer token-a");

      writeActiveProfile("b");

      await clientRequest(port, { path: "/v1/ping", headers: authHeaders() });
      assert.equal(seen[1]?.url, "https://b.example.com/ping");
      assert.equal(seen[1]?.headers["authorization"], "Bearer token-b");
    } finally {
      cleanup();
    }
  });

  it("passes through upstream response headers but not hop-by-hop ones", async () => {
    const port = await start({
      resolveProfile: () => profile(),
      fetchImpl: async () =>
        new Response("body", {
          status: 200,
          headers: {
            "content-type": "text/plain",
            "x-custom": "kept",
            "proxy-authenticate": "Basic drop-me",
          },
        }),
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.headers["content-type"], "text/plain");
    assert.equal(res.headers["x-custom"], "kept");
    assert.equal(res.headers["proxy-authenticate"], undefined);
  });
});
