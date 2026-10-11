import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type { TokenProfile } from "@agent-cli-toolkit/token-config";
import express, {
  type Application,
  type NextFunction,
  type Request as ExpressRequest,
  type Response as ExpressResponse,
} from "express";
import {
  createAccessLogger,
  type AccessLogError,
  type AccessLogger,
} from "./access-log.js";
import {
  BodyCapture,
  bodySideFields,
  createAccessBodyLogger,
  isTraceableContentType,
  type AccessBodyLogger,
  type BodySideTrace,
} from "./access-body-log.js";

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
  /** 解析当前激活 profile 名（仅用于访问记录）；未提供时记录 profile 为 null。 */
  resolveProfileName?: () => string | undefined;
  /** 访问记录文件路径；默认写到配置目录下的 token-server-access.jsonl。 */
  accessLogPath?: string;
  /** 是否追踪入站请求体与上游响应体；默认 true，`--no-trace-body` 时为 false。 */
  traceBody?: boolean;
  /** 请求体追踪文件路径；默认写到配置目录下的 token-server-access-body.jsonl。 */
  accessBodyLogPath?: string;
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
  req: ExpressRequest,
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

function sendText(res: ExpressResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(`${message}\n`);
}

async function handleRequest(
  req: ExpressRequest,
  res: ExpressResponse,
  options: TokenServerOptions,
  fetchImpl: TokenServerFetch,
  log: (line: string) => void,
  accessLogger: AccessLogger,
  accessBodyLogger: AccessBodyLogger | undefined,
): Promise<void> {
  const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
  const method = req.method ?? "GET";

  // 访问记录：无条件为每个入站请求记一条，响应结束后写入（不阻塞流式转发）。
  const startedAt = Date.now();
  let errorKind: AccessLogError | null = null;
  let profileName: string | null = null;
  // 请求/响应体追踪：仅在已通过鉴权、开始转发时填充（拒绝路径不记）。
  let requestTrace: BodySideTrace | undefined;
  let responseTrace: BodySideTrace | undefined;
  res.once("finish", () => {
    const time = new Date().toISOString();
    accessLogger({
      time,
      method,
      path: requestUrl.pathname,
      status: res.statusCode,
      profile: profileName,
      durationMs: Date.now() - startedAt,
      error: errorKind,
    });
    if (accessBodyLogger !== undefined && requestTrace !== undefined) {
      const request = bodySideFields(requestTrace);
      const response = bodySideFields(responseTrace);
      accessBodyLogger({
        time,
        method,
        path: requestUrl.pathname,
        profile: profileName,
        requestContentType: requestTrace.contentType,
        requestBody: request.body,
        requestBodyTruncated: request.truncated,
        requestBodySkipped: request.skipped,
        responseStatus: res.statusCode,
        responseContentType: responseTrace?.contentType ?? null,
        responseBody: response.body,
        responseBodyTruncated: response.truncated,
        responseBodySkipped: response.skipped,
      });
    }
  });

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
    errorKind = "invalid_api_key";
    log(`${method} ${requestUrl.pathname} -> 401`);
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "invalid token-server api key" } }) + "\n");
    return;
  }

  let profile: TokenProfile | undefined;
  try {
    profile = options.resolveProfile();
  } catch {
    errorKind = "profile_read_failed";
    log(`${method} ${requestUrl.pathname} -> 503 (读取 profile 失败)`);
    sendText(res, 503, "读取 token profile 失败");
    return;
  }

  if (profile === undefined) {
    errorKind = "no_active_profile";
    log(`${method} ${requestUrl.pathname} -> 503 (无激活 profile)`);
    sendText(
      res,
      503,
      "无可用的激活 profile；请先执行: agent-cli token-server switch <profile>",
    );
    return;
  }

  if (options.resolveProfileName !== undefined) {
    try {
      profileName = options.resolveProfileName() ?? null;
    } catch {
      profileName = null;
    }
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
    errorKind = "invalid_base_url";
    log(`${method} ${requestUrl.pathname} -> 500 (baseUrl 无效)`);
    sendText(res, 500, "profile 的 baseUrl 无效");
    return;
  }

  const hasBody = method !== "GET" && method !== "HEAD";
  const rawContentType = req.headers["content-type"];
  const contentType =
    (Array.isArray(rawContentType) ? rawContentType[0] : rawContentType)?.trim() ??
    null;
  let body: WebReadableStream | undefined;
  if (accessBodyLogger !== undefined) {
    // 旁路捕获：只在文本类型时累计前 64 KiB，其余仍原样转发。
    const traceable = hasBody && isTraceableContentType(contentType);
    const capture = traceable ? new BodyCapture() : undefined;
    if (capture !== undefined) {
      req.pipe(capture);
    }
    if (hasBody) {
      body = Readable.toWeb(capture ?? req) as WebReadableStream;
    }
    requestTrace = { hasBody, contentType, traceable, capture };
  } else if (hasBody) {
    body = Readable.toWeb(req) as WebReadableStream;
  }

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
    errorKind = "upstream_failed";
    log(`${method} ${requestUrl.pathname} -> 502 (上游请求失败)`);
    sendText(res, 502, "上游请求失败");
    return;
  }

  res.writeHead(upstream.status, buildResponseHeaders(upstream.headers));
  const responseContentType = upstream.headers.get("content-type")?.trim() ?? null;
  if (upstream.body === null) {
    if (accessBodyLogger !== undefined) {
      responseTrace = {
        hasBody: false,
        contentType: responseContentType,
        traceable: false,
      };
    }
    res.end();
    return;
  }
  const source = Readable.fromWeb(upstream.body as WebReadableStream);
  if (accessBodyLogger !== undefined) {
    // 响应侧同样旁路捕获：边转发边累计前 64 KiB，不缓冲完整响应、不阻塞 SSE。
    const traceable = isTraceableContentType(responseContentType);
    const capture = traceable ? new BodyCapture() : undefined;
    if (capture !== undefined) {
      source.pipe(capture).pipe(res);
    } else {
      source.pipe(res);
    }
    responseTrace = {
      hasBody: true,
      contentType: responseContentType,
      traceable,
      capture,
    };
  } else {
    source.pipe(res);
  }
}

export function createTokenServer(options: TokenServerOptions): Application {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const log =
    options.log ??
    ((line: string): void => {
      process.stderr.write(`${line}\n`);
    });

  const accessLogger = createAccessLogger({
    path: options.accessLogPath,
    warn: log,
  });
  const accessBodyLogger =
    options.traceBody === false
      ? undefined
      : createAccessBodyLogger({ path: options.accessBodyLogPath, warn: log });

  const app = express();
  // Express 默认发送 `x-powered-by`；关闭以保持与手写实现一致的响应头。
  app.disable("x-powered-by");

  // 兜底中间件：任何路径都进入转发流程（承载原单处理器逻辑）。
  // 用 `app.use` 而非路由表，因为 `app.use` 匹配全部路径且不改写 `req.url`。
  app.use((req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    void handleRequest(
      req,
      res,
      options,
      fetchImpl,
      log,
      accessLogger,
      accessBodyLogger,
    ).catch(next);
  });

  // 终态错误处理器：仅在规范未定义的内部异常路径触发；记录日志并以 500 结束，不泄露 secret。
  app.use(
    (error: unknown, req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
      if (res.headersSent) {
        next(error);
        return;
      }
      const reason = error instanceof Error ? error.message : String(error);
      log(`${req.method} ${req.path} -> 500 (内部错误: ${reason})`);
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("服务器内部错误\n");
    },
  );

  // 返回 Express app；启动交给调用方（lifecycle / 测试）用 app.listen()，
  // 使 server 实现不直接依赖 node:http。
  return app;
}
