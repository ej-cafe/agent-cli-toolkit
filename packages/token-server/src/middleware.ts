import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import type {
  NextFunction,
  Request as ExpressRequest,
  RequestHandler,
  Response as ExpressResponse,
} from "express";
import type { AccessLogger } from "./access-log.js";
import {
  BodyCapture,
  bodySideFields,
  isTraceableContentType,
  type AccessBodyLogger,
} from "./access-body-log.js";
import { getProxyContext, setProxyContext, type ProxyContext } from "./proxy-context.js";
import type { TokenServerFetch, TokenServerOptions } from "./types.js";
import {
  buildRequestHeaders,
  buildResponseHeaders,
  resolveUpstream,
  sendText,
} from "./upstream.js";

export type LogFn = (line: string) => void;

/**
 * 访问记录 + 可选 body 追踪：无条件为每个入站请求挂 `finish` 钩子，
 * 并创建后续中间件共享的 `ProxyContext`。
 */
export function createAccessLogMiddleware(
  accessLogger: AccessLogger,
  accessBodyLogger: AccessBodyLogger | undefined,
): RequestHandler {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    const ctx: ProxyContext = {
      requestUrl: new URL(req.url ?? "/", "http://127.0.0.1"),
      method: req.method ?? "GET",
      startedAt: Date.now(),
      errorKind: null,
      profileName: null,
    };
    setProxyContext(res, ctx);

    res.once("finish", () => {
      const time = new Date().toISOString();
      accessLogger({
        time,
        method: ctx.method,
        path: ctx.requestUrl.pathname,
        status: res.statusCode,
        profile: ctx.profileName,
        durationMs: Date.now() - ctx.startedAt,
        error: ctx.errorKind,
      });
      if (accessBodyLogger !== undefined && ctx.requestTrace !== undefined) {
        const request = bodySideFields(ctx.requestTrace);
        const response = bodySideFields(ctx.responseTrace);
        accessBodyLogger({
          time,
          method: ctx.method,
          path: ctx.requestUrl.pathname,
          profile: ctx.profileName,
          requestContentType: ctx.requestTrace.contentType,
          requestBody: request.body,
          requestBodyTruncated: request.truncated,
          requestBodySkipped: request.skipped,
          responseStatus: res.statusCode,
          responseContentType: ctx.responseTrace?.contentType ?? null,
          responseBody: response.body,
          responseBodyTruncated: response.truncated,
          responseBodySkipped: response.skipped,
        });
      }
    });

    next();
  };
}

/**
 * 鉴权门：入站请求必须携带与已配置 key 匹配的凭据。
 * OpenAI 风格客户端发 `Authorization: Bearer <key>`，Anthropic 风格客户端发 `x-api-key`。
 */
export function createAuthMiddleware(
  options: TokenServerOptions,
  log: LogFn,
): RequestHandler {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    const ctx = getProxyContext(res);
    const configuredKey = options.resolveApiKey();
    const gotAuth = req.headers.authorization?.trim();
    const rawApiKey = req.headers["x-api-key"];
    const gotApiKey = (Array.isArray(rawApiKey) ? rawApiKey[0] : rawApiKey)?.trim();
    const validAuth =
      configuredKey !== undefined &&
      (gotAuth === `Bearer ${configuredKey}` || gotApiKey === configuredKey);
    if (!validAuth) {
      ctx.errorKind = "invalid_api_key";
      log(`${ctx.method} ${ctx.requestUrl.pathname} -> 401`);
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "invalid token-server api key" } }) + "\n");
      return;
    }
    next();
  };
}

/** 解析激活 profile 与上游 URL；失败时写对应 status 并终止链。 */
export function createResolveMiddleware(
  options: TokenServerOptions,
  log: LogFn,
): RequestHandler {
  return (_req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    const ctx = getProxyContext(res);

    let profile;
    try {
      profile = options.resolveProfile();
    } catch {
      ctx.errorKind = "profile_read_failed";
      log(`${ctx.method} ${ctx.requestUrl.pathname} -> 503 (读取 profile 失败)`);
      sendText(res, 503, "读取 token profile 失败");
      return;
    }

    if (profile === undefined) {
      ctx.errorKind = "no_active_profile";
      log(`${ctx.method} ${ctx.requestUrl.pathname} -> 503 (无激活 profile)`);
      sendText(
        res,
        503,
        "无可用的激活 profile；请先执行: agent-cli token-server switch <profile>",
      );
      return;
    }

    if (options.resolveProfileName !== undefined) {
      try {
        ctx.profileName = options.resolveProfileName() ?? null;
      } catch {
        ctx.profileName = null;
      }
    }

    try {
      const resolved = resolveUpstream(
        profile,
        ctx.requestUrl.pathname,
        ctx.requestUrl.search,
      );
      ctx.profile = profile;
      ctx.upstreamUrl = resolved.url;
      ctx.anthropic = resolved.anthropic;
    } catch {
      ctx.errorKind = "invalid_base_url";
      log(`${ctx.method} ${ctx.requestUrl.pathname} -> 500 (baseUrl 无效)`);
      sendText(res, 500, "profile 的 baseUrl 无效");
      return;
    }

    next();
  };
}

/** 构造转发头与流式 body，请求上游并 pipe 响应（含可选 BodyCapture）。 */
export function createProxyMiddleware(
  fetchImpl: TokenServerFetch,
  log: LogFn,
  accessBodyLogger: AccessBodyLogger | undefined,
): RequestHandler {
  return (req: ExpressRequest, res: ExpressResponse, next: NextFunction): void => {
    void forwardUpstream(req, res, fetchImpl, log, accessBodyLogger).catch(next);
  };
}

async function forwardUpstream(
  req: ExpressRequest,
  res: ExpressResponse,
  fetchImpl: TokenServerFetch,
  log: LogFn,
  accessBodyLogger: AccessBodyLogger | undefined,
): Promise<void> {
  const ctx = getProxyContext(res);
  const profile = ctx.profile;
  const upstreamUrl = ctx.upstreamUrl;
  const anthropic = ctx.anthropic;
  if (profile === undefined || upstreamUrl === undefined || anthropic === undefined) {
    throw new Error("resolve middleware must run before proxy");
  }

  const { method, requestUrl } = ctx;
  const hasBody = method !== "GET" && method !== "HEAD";
  const rawContentType = req.headers["content-type"];
  const contentType =
    (Array.isArray(rawContentType) ? rawContentType[0] : rawContentType)?.trim() ?? null;
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
    ctx.requestTrace = { hasBody, contentType, traceable, capture };
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
    ctx.errorKind = "upstream_failed";
    log(`${method} ${requestUrl.pathname} -> 502 (上游请求失败)`);
    sendText(res, 502, "上游请求失败");
    return;
  }

  res.writeHead(upstream.status, buildResponseHeaders(upstream.headers));
  const responseContentType = upstream.headers.get("content-type")?.trim() ?? null;
  if (upstream.body === null) {
    if (accessBodyLogger !== undefined) {
      ctx.responseTrace = {
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
    ctx.responseTrace = {
      hasBody: true,
      contentType: responseContentType,
      traceable,
      capture,
    };
  } else {
    source.pipe(res);
  }
}
