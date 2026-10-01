import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { TokenProfile } from "@agent-cli-toolkit/token-config";

export type TokenServerRequestInit = {
  method: string;
  headers: Record<string, string>;
  body?: WebReadableStream;
  redirect: "manual";
  duplex: "half";
};

/** 可注入的上游传输；默认用全局 `fetch`。 */
export type TokenServerFetch = (
  input: string,
  init: TokenServerRequestInit,
) => Promise<Response>;

export type TokenServerOptions = {
  /** 解析当前激活 profile；返回 undefined 表示无可用 profile。 */
  resolveProfile: () => TokenProfile | undefined;
  /** 解析已配置的服务器 API key；返回 undefined 表示未配置（此时所有请求拒绝）。 */
  resolveApiKey: () => string | undefined;
  fetchImpl?: TokenServerFetch;
  log?: (line: string) => void;
};

const anthropicPrefix = "/anthropic";

/** 本地 OpenAI 兼容端点挂载前缀：`use` 写入工具 baseURL 为 `http://<host>:<port>/v1`。 */
const openaiPrefix = "/v1";

const hopByHopHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

const requestHeadersToDrop = new Set(["authorization", "x-api-key", "host"]);

const defaultFetch: TokenServerFetch = (input, init) =>
  fetch(input, init as RequestInit);

function isAnthropicPath(pathname: string): boolean {
  return pathname === anthropicPrefix || pathname.startsWith(`${anthropicPrefix}/`);
}

function isOpenAiPath(pathname: string): boolean {
  return pathname === openaiPrefix || pathname.startsWith(`${openaiPrefix}/`);
}

function joinUpstreamUrl(base: string, pathname: string, search: string): string {
  const baseUrl = new URL(base);
  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  baseUrl.pathname = `${basePath}${pathname}`;
  baseUrl.search = search;
  return baseUrl.toString();
}

function resolveUpstream(
  profile: TokenProfile,
  pathname: string,
  search: string,
): { url: string; anthropic: boolean } {
  const anthropic = isAnthropicPath(pathname);
  // 剥掉本地挂载前缀后，把剩余路径拼到上游 base：
  // - /anthropic/.. 剥掉 /anthropic，保留 /v1/messages（claudeBaseUrl 末尾通常不含 /v1）
  // - /v1/.. 剥掉 /v1（baseUrl 通常已含 /v1，避免拼成双 /v1）
  const rest = anthropic
    ? pathname.slice(anthropicPrefix.length)
    : isOpenAiPath(pathname)
      ? pathname.slice(openaiPrefix.length)
      : pathname;
  const restPath = rest === "" ? "/" : rest;
  const base = anthropic
    ? (profile.claudeBaseUrl?.trim() || profile.baseUrl)
    : profile.baseUrl;
  return { url: joinUpstreamUrl(base, restPath, search), anthropic };
}

function buildRequestHeaders(
  req: IncomingMessage,
  token: string,
  anthropic: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) {
      continue;
    }
    const lower = name.toLowerCase();
    if (requestHeadersToDrop.has(lower) || hopByHopHeaders.has(lower)) {
      continue;
    }
    headers[lower] = Array.isArray(value) ? value.join(", ") : value;
  }
  headers["authorization"] = `Bearer ${token}`;
  if (anthropic) {
    headers["x-api-key"] = token;
  }
  return headers;
}

function buildResponseHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, name) => {
    const lower = name.toLowerCase();
    // 逐跳头由 Node 管理；fetch 已解压响应体，长度/编码头不再准确。
    if (hopByHopHeaders.has(lower) || lower === "content-length" || lower === "content-encoding") {
      return;
    }
    out[lower] = value;
  });
  return out;
}

function sendText(res: ServerResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(`${message}\n`);
}

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: TokenServerOptions,
  fetchImpl: TokenServerFetch,
  log: (line: string) => void,
): Promise<void> {
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const method = req.method ?? "GET";

  // 鉴权门：入站请求必须携带与已配置 key 匹配的凭据。
  // OpenAI 风格客户端发 `Authorization: Bearer <key>`，Anthropic 风格客户端（Claude Code）发 `x-api-key: <key>`。
  const configuredKey = options.resolveApiKey();
  const gotAuth = req.headers.authorization?.trim();
  const rawApiKey = req.headers["x-api-key"];
  const gotApiKey = (Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey)?.trim();
  const validAuth =
    configuredKey !== undefined &&
    (gotAuth === `Bearer ${configuredKey}` || gotApiKey === configuredKey);
  if (!validAuth) {
    log(`${method} ${requestUrl.pathname} -> 401`);
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "invalid token-server api key" } }) + "\n");
    return;
  }

  let profile: TokenProfile | undefined;
  try {
    profile = options.resolveProfile();
  } catch {
    log(`${method} ${requestUrl.pathname} -> 503 (读取 profile 失败)`);
    sendText(res, 503, "读取 token profile 失败");
    return;
  }

  if (profile === undefined) {
    log(`${method} ${requestUrl.pathname} -> 503 (无激活 profile)`);
    sendText(
      res,
      503,
      "无可用的激活 profile；请先执行: agent-cli token-server switch <profile>",
    );
    return;
  }

  let upstreamUrl: string;
  let anthropic: boolean;
  try {
    ({ url: upstreamUrl, anthropic } = resolveUpstream(
      profile,
      requestUrl.pathname,
      requestUrl.search,
    ));
  } catch {
    log(`${method} ${requestUrl.pathname} -> 500 (baseUrl 无效)`);
    sendText(res, 500, "profile 的 baseUrl 无效");
    return;
  }

  const hasBody = method !== "GET" && method !== "HEAD";
  const body = hasBody ? (Readable.toWeb(req) as WebReadableStream) : undefined;

  let upstream: Response;
  try {
    upstream = await fetchImpl(upstreamUrl, {
      method,
      headers: buildRequestHeaders(req, profile.token, anthropic),
      body,
      redirect: "manual",
      duplex: "half",
    });
  } catch {
    log(`${method} ${requestUrl.pathname} -> 502 (上游请求失败)`);
    sendText(res, 502, "上游请求失败");
    return;
  }

  res.writeHead(upstream.status, buildResponseHeaders(upstream.headers));
  if (upstream.body === null) {
    res.end();
    return;
  }
  Readable.fromWeb(upstream.body as WebReadableStream).pipe(res);
}

export function createTokenServer(options: TokenServerOptions): Server {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const log =
    options.log ??
    ((line: string): void => {
      process.stderr.write(`${line}\n`);
    });

  return createServer((req, res) => {
    void handleRequest(req, res, options, fetchImpl, log);
  });
}
