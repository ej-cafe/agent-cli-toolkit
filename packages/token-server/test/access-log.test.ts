import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough, Readable } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, describe, it } from "node:test";
import type { TokenProfile } from "@agent-cli-toolkit/token-config";
import { createAccessLogger, type AccessLogRecord } from "../src/access-log.js";
import { createAccessBodyLogger, type AccessBodyLogRecord } from "../src/access-body-log.js";
import { readApiKey } from "../src/key.js";
import { accessBodyLogPath, accessLogPath } from "../src/paths.js";
import { createTokenServer, type TokenServerFetch } from "../src/server.js";
import { writeActiveProfile } from "../src/state.js";
import {
  installApiKey,
  profile,
  useTempXdgConfig,
  writeProfiles,
} from "./helpers.js";

const testApiKey = "test-server-key";

type ClientResponse = {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
};

type StartOptions = {
  resolveProfile: () => TokenProfile | undefined;
  resolveApiKey?: () => string | undefined;
  resolveProfileName?: () => string | undefined;
  fetchImpl: TokenServerFetch;
  log?: (line: string) => void;
  accessLogPath?: string;
  traceBody?: boolean;
  accessBodyLogPath?: string;
};

function listen(
  app: ReturnType<typeof createTokenServer>,
): Promise<{ server: Server; port: number }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1");
    server.once("error", reject);
    server.once("listening", () => {
      resolve({ server, port: (server.address() as AddressInfo).port });
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

function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { authorization: `Bearer ${testApiKey}`, ...extra };
}

function readRecords(path = accessLogPath()): AccessLogRecord[] {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as AccessLogRecord);
}

async function waitForRecords(
  count: number,
  path = accessLogPath(),
  timeoutMs = 2_000,
): Promise<AccessLogRecord[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const records = readRecords(path);
    if (records.length >= count || Date.now() > deadline) {
      return records;
    }
    await delay(10);
  }
}

function readBodyRecords(path = accessBodyLogPath()): AccessBodyLogRecord[] {
  if (!existsSync(path)) {
    return [];
  }
  return readFileSync(path, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line) as AccessBodyLogRecord);
}

async function waitForBodyRecords(
  count: number,
  path = accessBodyLogPath(),
  timeoutMs = 2_000,
): Promise<AccessBodyLogRecord[]> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const records = readBodyRecords(path);
    if (records.length >= count || Date.now() > deadline) {
      return records;
    }
    await delay(10);
  }
}

describe("token-server access log", () => {
  const servers: Server[] = [];
  const cleanups: Array<() => void> = [];
  let cleanupXdg: () => void;

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "agent-cli-access-log-"));
    cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
    return dir;
  }

  beforeEach(() => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
  });

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
    cleanupXdg();
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  async function start(options: StartOptions): Promise<number> {
    const app = createTokenServer({
      resolveProfile: options.resolveProfile,
      resolveApiKey: options.resolveApiKey ?? (() => testApiKey),
      resolveProfileName: options.resolveProfileName,
      fetchImpl: options.fetchImpl,
      log: options.log ?? (() => {}),
      accessLogPath: options.accessLogPath,
      traceBody: options.traceBody ?? true,
      accessBodyLogPath: options.accessBodyLogPath,
    });
    const { server, port } = await listen(app);
    servers.push(server);
    return port;
  }

  it("resolves the access log next to the other server files", () => {
    assert.equal(
      accessLogPath(),
      join(
        process.env.XDG_CONFIG_HOME!,
        "agent-cli-toolkit",
        "token-server-access.jsonl",
      ),
    );
  });

  it("appends one parseable JSON line per record and creates the directory", () => {
    const dir = tempDir();
    const path = join(dir, "nested", "token-server-access.jsonl");
    const record: AccessLogRecord = {
      time: "2026-10-04T00:00:00.000Z",
      method: "GET",
      path: "/v1/models",
      status: 200,
      profile: "work",
      durationMs: 3,
      error: null,
    };
    const logger = createAccessLogger({ path, warn: () => {} });

    logger(record);
    logger({ ...record, status: 401, error: "invalid_api_key" });

    const records = readRecords(path);
    assert.equal(records.length, 2);
    assert.deepEqual(records[0], record);
    assert.equal(records[1]?.status, 401);
    assert.equal(records[1]?.error, "invalid_api_key");
  });

  it("warns once and never throws when the log cannot be written", () => {
    const dir = tempDir();
    const warnings: string[] = [];
    // 指向一个目录：追加写会失败（EISDIR）。
    const logger = createAccessLogger({ path: dir, warn: (line) => warnings.push(line) });

    assert.doesNotThrow(() => {
      logger({
        time: "2026-10-04T00:00:00.000Z",
        method: "GET",
        path: "/v1/models",
        status: 200,
        profile: null,
        durationMs: 1,
        error: null,
      });
      logger({
        time: "2026-10-04T00:00:01.000Z",
        method: "GET",
        path: "/v1/models",
        status: 200,
        profile: null,
        durationMs: 1,
        error: null,
      });
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /访问记录写入失败/);
  });

  it("records a successful forward with method, path, status, profile and no query", async () => {
    writeProfiles({
      work: profile({ baseUrl: "https://api.example.com/v1", token: "secret-token" }),
    });
    writeActiveProfile("work");
    installApiKey(testApiKey);

    const port = await start({
      resolveProfile: () => profile({ token: "secret-token" }),
      resolveProfileName: () => "work",
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("ok"),
    });

    const res = await clientRequest(port, {
      path: "/v1/chat/completions?token=leak",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: "{}",
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, "ok");

    const records = await waitForRecords(1);
    assert.equal(records.length, 1);
    const record = records[0]!;
    assert.equal(record.method, "POST");
    assert.equal(record.path, "/v1/chat/completions");
    assert.equal(record.status, 200);
    assert.equal(record.profile, "work");
    assert.equal(record.error, null);
    assert.equal(typeof record.durationMs, "number");
    assert.ok(!Number.isNaN(Date.parse(record.time)));
  });

  it("records 401 as invalid_api_key without calling upstream", async () => {
    installApiKey(testApiKey);
    let called = false;
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async () => {
        called = true;
        return new Response("nope");
      },
    });

    const res = await clientRequest(port, { path: "/v1/models" });
    assert.equal(res.status, 401);
    assert.equal(called, false);

    const records = await waitForRecords(1);
    assert.equal(records[0]?.status, 401);
    assert.equal(records[0]?.error, "invalid_api_key");
  });

  it("records 503 with a null profile when there is no active profile", async () => {
    const port = await start({
      resolveProfile: () => undefined,
      fetchImpl: async () => new Response("nope"),
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 503);

    const records = await waitForRecords(1);
    assert.equal(records[0]?.status, 503);
    assert.equal(records[0]?.profile, null);
    assert.equal(records[0]?.error, "no_active_profile");
  });

  it("records 503 as profile_read_failed when reading the profile throws", async () => {
    const port = await start({
      resolveProfile: () => {
        throw new Error("bad profile file");
      },
      fetchImpl: async () => new Response("nope"),
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 503);

    const records = await waitForRecords(1);
    assert.equal(records[0]?.status, 503);
    assert.equal(records[0]?.error, "profile_read_failed");
  });

  it("records 500 as invalid_base_url when the profile baseUrl is not a URL", async () => {
    const port = await start({
      resolveProfile: () => profile({ baseUrl: "not-a-url" }),
      fetchImpl: async () => new Response("nope"),
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 500);

    const records = await waitForRecords(1);
    assert.equal(records[0]?.status, 500);
    assert.equal(records[0]?.error, "invalid_base_url");
  });

  it("records 502 as upstream_failed when the upstream request fails", async () => {
    const port = await start({
      resolveProfile: () => profile(),
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED");
      },
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 502);

    const records = await waitForRecords(1);
    assert.equal(records[0]?.status, 502);
    assert.equal(records[0]?.error, "upstream_failed");
  });

  it("never writes tokens, keys, headers, bodies or the query string", async () => {
    installApiKey(testApiKey);
    const port = await start({
      resolveProfile: () => profile({ token: "secret-token" }),
      resolveProfileName: () => "work",
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("ok"),
    });

    const res = await clientRequest(port, {
      path: "/v1/models?api_key=leak-me",
      method: "POST",
      headers: authHeaders({
        "x-api-key": "client-owned-key",
        "x-secret-header": "leak-header",
      }),
      body: "leak-body",
    });
    assert.equal(res.status, 200);

    const records = await waitForRecords(1);
    assert.equal(records.length, 1);
    assert.deepEqual(Object.keys(records[0]!).sort(), [
      "durationMs",
      "error",
      "method",
      "path",
      "profile",
      "status",
      "time",
    ]);

    const raw = readFileSync(accessLogPath(), "utf8");
    for (const leak of [
      "secret-token",
      testApiKey,
      "client-owned-key",
      "authorization",
      "x-api-key",
      "x-secret-header",
      "leak-header",
      "leak-body",
      "leak-me",
    ]) {
      assert.equal(raw.includes(leak), false, `访问记录不应包含 ${leak}`);
    }
  });

  it("keeps serving and warns once when the log is unwritable", async () => {
    installApiKey(testApiKey);
    const dir = tempDir();
    const logs: string[] = [];
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("ok"),
      accessLogPath: dir,
      log: (line) => logs.push(line),
    });

    const first = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(first.status, 200);
    assert.equal(first.body, "ok");

    const second = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(second.status, 200);

    const warnings = logs.filter((line) => line.includes("访问记录写入失败"));
    assert.equal(warnings.length, 1);
  });

  it("writes the record only after a streamed response finishes", async () => {
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
    const request = new Promise<void>((resolve, reject) => {
      const req = httpRequest({ host: "127.0.0.1", port, path: "/events" }, (res) => {
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => received.push(chunk));
        res.on("end", resolve);
        res.on("error", reject);
      });
      req.setHeader("authorization", `Bearer ${testApiKey}`);
      req.on("error", reject);
      req.end();
    });

    const firstChunk = (async (): Promise<void> => {
      while (received.length === 0) {
        await delay(5);
      }
    })();

    upstream.write("data: one\n\n");
    await firstChunk;
    assert.deepEqual(received, ["data: one\n\n"]);
    assert.equal(readRecords().length, 0, "流未结束前不应写记录");

    upstream.write("data: two\n\n");
    upstream.end();
    await request;

    const records = await waitForRecords(1);
    assert.equal(records.length, 1);
    assert.equal(records[0]?.path, "/events");
    assert.equal(records[0]?.status, 200);
    assert.equal(records[0]?.error, null);
  });

  it("records a null profile when no profile-name resolver is configured", async () => {
    installApiKey(testApiKey);
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("ok"),
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 200);

    const records = await waitForRecords(1);
    assert.equal(records[0]?.profile, null);
  });

  it("resolves the request-body log next to the other server files", () => {
    assert.equal(
      accessBodyLogPath(),
      join(
        process.env.XDG_CONFIG_HOME!,
        "agent-cli-toolkit",
        "token-server-access-body.jsonl",
      ),
    );
  });

  it("warns once and never throws when the trace log cannot be written", () => {
    const dir = tempDir();
    const warnings: string[] = [];
    const logger = createAccessBodyLogger({ path: dir, warn: (line) => warnings.push(line) });
    const record: AccessBodyLogRecord = {
      time: "2026-10-04T00:00:00.000Z",
      method: "POST",
      path: "/v1/chat/completions",
      profile: null,
      requestContentType: "application/json",
      requestBody: "{}",
      requestBodyTruncated: false,
      requestBodySkipped: null,
      responseStatus: 200,
      responseContentType: "text/plain;charset=UTF-8",
      responseBody: "ok",
      responseBodyTruncated: false,
      responseBodySkipped: null,
    };

    assert.doesNotThrow(() => {
      logger(record);
      logger(record);
    });

    assert.equal(warnings.length, 1);
    assert.match(warnings[0]!, /请求体与响应体追踪写入失败/);
  });

  it("writes a request-body file by default", async () => {
    installApiKey(testApiKey);
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("ok"),
    });

    const res = await clientRequest(port, {
      path: "/v1/chat/completions",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: '{"a":1}',
    });
    assert.equal(res.status, 200);
    const records = await waitForBodyRecords(1);
    assert.equal(records.length, 1);
    assert.equal(records[0]!.requestBody, '{"a":1}');
  });

  it("does not write a request-body file when traceBody is false", async () => {
    installApiKey(testApiKey);
    const port = await start({
      traceBody: false,
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("ok"),
    });

    const res = await clientRequest(port, {
      path: "/v1/chat/completions",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: '{"a":1}',
    });
    assert.equal(res.status, 200);
    await waitForRecords(1);
    assert.equal(existsSync(accessBodyLogPath()), false);
  });

  it("records request and response bodies with the same timestamp as the access record", async () => {
    installApiKey(testApiKey);
    let forwarded = "";
    const port = await start({
      resolveProfile: () => profile(),
      resolveProfileName: () => "work",
      resolveApiKey: readApiKey,
      fetchImpl: async (_url, init) => {
        forwarded = init.body
          ? await new Response(init.body as ReadableStream).text()
          : "";
        return new Response("ok");
      },
    });

    const res = await clientRequest(port, {
      path: "/v1/chat/completions",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: '{"prompt":"hello"}',
    });
    assert.equal(res.status, 200);
    assert.equal(forwarded, '{"prompt":"hello"}');

    const records = await waitForBodyRecords(1);
    assert.equal(records.length, 1);
    const record = records[0]!;
    assert.deepEqual(Object.keys(record).sort(), [
      "method",
      "path",
      "profile",
      "requestBody",
      "requestBodySkipped",
      "requestBodyTruncated",
      "requestContentType",
      "responseBody",
      "responseBodySkipped",
      "responseBodyTruncated",
      "responseContentType",
      "responseStatus",
      "time",
    ]);
    assert.equal(record.method, "POST");
    assert.equal(record.path, "/v1/chat/completions");
    assert.equal(record.profile, "work");
    assert.equal(record.requestContentType, "application/json");
    assert.equal(record.requestBody, '{"prompt":"hello"}');
    assert.equal(record.requestBodyTruncated, false);
    assert.equal(record.requestBodySkipped, null);
    assert.equal(record.responseStatus, 200);
    assert.equal(record.responseContentType, "text/plain;charset=UTF-8");
    assert.equal(record.responseBody, "ok");
    assert.equal(record.responseBodyTruncated, false);
    assert.equal(record.responseBodySkipped, null);

    const access = await waitForRecords(1);
    assert.equal(record.time, access[0]?.time);
  });

  it("truncates each side at 64 KiB but forwards the full content", async () => {
    installApiKey(testApiKey);
    const requestPayload = "a".repeat(70 * 1024);
    const responsePayload = "b".repeat(70 * 1024);
    let forwarded = "";
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async (_url, init) => {
        forwarded = init.body
          ? await new Response(init.body as ReadableStream).text()
          : "";
        return new Response(responsePayload, { headers: { "content-type": "text/plain" } });
      },
    });

    const res = await clientRequest(port, {
      path: "/v1/chat/completions",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: requestPayload,
    });
    assert.equal(res.status, 200);
    assert.equal(forwarded.length, requestPayload.length);
    assert.equal(res.body.length, responsePayload.length);

    const records = await waitForBodyRecords(1);
    assert.equal(records[0]?.requestBody?.length, 64 * 1024);
    assert.equal(records[0]?.requestBodyTruncated, true);
    assert.equal(records[0]?.responseBody?.length, 64 * 1024);
    assert.equal(records[0]?.responseBodyTruncated, true);
  });

  it("records only the skipped reason for non-text content types", async () => {
    installApiKey(testApiKey);
    let forwarded = "";
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async (_url, init) => {
        forwarded = init.body
          ? await new Response(init.body as ReadableStream).text()
          : "";
        return new Response("PNGBYTES", { headers: { "content-type": "image/png" } });
      },
    });

    const res = await clientRequest(port, {
      path: "/v1/images",
      method: "POST",
      headers: authHeaders({ "content-type": "image/png" }),
      body: "REQUESTBIN",
    });
    assert.equal(res.status, 200);
    assert.equal(forwarded, "REQUESTBIN");
    assert.equal(res.body, "PNGBYTES");

    const records = await waitForBodyRecords(1);
    assert.equal(records[0]?.requestBody, null);
    assert.equal(records[0]?.requestBodySkipped, "image/png");
    assert.equal(records[0]?.requestBodyTruncated, false);
    assert.equal(records[0]?.responseBody, null);
    assert.equal(records[0]?.responseBodySkipped, "image/png");
    assert.equal(records[0]?.responseBodyTruncated, false);
  });

  it("still records the response body for GET requests", async () => {
    installApiKey(testApiKey);
    const port = await start({
      resolveProfile: () => profile(),
      resolveProfileName: () => "work",
      resolveApiKey: readApiKey,
      fetchImpl: async () =>
        new Response('{"models":[]}', {
          headers: { "content-type": "application/json" },
        }),
    });

    const res = await clientRequest(port, { path: "/v1/models", headers: authHeaders() });
    assert.equal(res.status, 200);
    assert.equal(res.body, '{"models":[]}');

    const records = await waitForBodyRecords(1);
    assert.equal(records[0]?.requestBody, null);
    assert.equal(records[0]?.requestBodySkipped, null);
    assert.equal(records[0]?.requestBodyTruncated, false);
    assert.equal(records[0]?.responseBody, '{"models":[]}');
  });

  it("records a streamed response body after the stream finishes", async () => {
    installApiKey(testApiKey);
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async () => {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("data: one\n\n"));
            controller.enqueue(new TextEncoder().encode("data: two\n\n"));
            controller.close();
          },
        });
        return new Response(stream, { headers: { "content-type": "text/event-stream" } });
      },
    });

    const res = await clientRequest(port, {
      path: "/v1/chat/completions",
      headers: authHeaders(),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body, "data: one\n\ndata: two\n\n");

    const records = await waitForBodyRecords(1);
    assert.equal(records[0]?.responseContentType, "text/event-stream");
    assert.equal(records[0]?.responseBody, "data: one\n\ndata: two\n\n");
    assert.equal(records[0]?.responseBodyTruncated, false);
  });

  it("does not record a body for rejected requests", async () => {
    installApiKey(testApiKey);
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("ok"),
    });

    const res = await clientRequest(port, {
      path: "/v1/chat/completions",
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"prompt":"secret"}',
    });
    assert.equal(res.status, 401);
    await waitForRecords(1);
    assert.equal(existsSync(accessBodyLogPath()), false);
  });

  it("never writes keys, headers or query strings into the trace file", async () => {
    installApiKey(testApiKey);
    const port = await start({
      resolveProfile: () => profile({ token: "secret-token" }),
      resolveProfileName: () => "work",
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("response-secret"),
    });

    const res = await clientRequest(port, {
      path: "/v1/chat/completions?api_key=leak-me",
      method: "POST",
      headers: authHeaders({
        "content-type": "application/json",
        "x-api-key": "client-owned-key",
        "x-secret-header": "leak-header",
      }),
      body: '{"prompt":"hello"}',
    });
    assert.equal(res.status, 200);

    const records = await waitForBodyRecords(1);
    assert.equal(records[0]?.requestBody, '{"prompt":"hello"}');
    assert.equal(records[0]?.responseBody, "response-secret");
    assert.equal(records[0]?.path, "/v1/chat/completions");

    const raw = readFileSync(accessBodyLogPath(), "utf8");
    for (const leak of [
      "secret-token",
      testApiKey,
      "client-owned-key",
      "authorization",
      "x-api-key",
      "x-secret-header",
      "leak-header",
      "leak-me",
    ]) {
      assert.equal(raw.includes(leak), false, `请求体追踪不应包含 ${leak}`);
    }
  });

  it("keeps serving and warns once when the trace file is unwritable", async () => {
    installApiKey(testApiKey);
    const dir = tempDir();
    const logs: string[] = [];
    const port = await start({
      resolveProfile: () => profile(),
      resolveApiKey: readApiKey,
      fetchImpl: async () => new Response("ok"),
      accessBodyLogPath: dir,
      log: (line) => logs.push(line),
    });

    const first = await clientRequest(port, {
      path: "/v1/chat/completions",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: "{}",
    });
    assert.equal(first.status, 200);
    assert.equal(first.body, "ok");

    const second = await clientRequest(port, {
      path: "/v1/chat/completions",
      method: "POST",
      headers: authHeaders({ "content-type": "application/json" }),
      body: "{}",
    });
    assert.equal(second.status, 200);

    const warnings = logs.filter((line) => line.includes("请求体与响应体追踪写入失败"));
    assert.equal(warnings.length, 1);
  });
});