import type { TokenProfile } from "@agent-cli-toolkit/token-config";
import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";

/** 本地 Anthropic 兼容端点挂载前缀。 */
export const anthropicPrefix = "/anthropic";

/** 本地 OpenAI 兼容端点挂载前缀：`use` 写入工具 baseURL 为 `http://<host>:<port>/v1`。 */
export const openaiPrefix = "/v1";

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

export function isAnthropicPath(pathname: string): boolean {
  return pathname === anthropicPrefix || pathname.startsWith(`${anthropicPrefix}/`);
}

export function isOpenAiPath(pathname: string): boolean {
  return pathname === openaiPrefix || pathname.startsWith(`${openaiPrefix}/`);
}

export function joinUpstreamUrl(base: string, pathname: string, search: string): string {
  const baseUrl = new URL(base);
  const basePath = baseUrl.pathname.replace(/\/+$/, "");
  baseUrl.pathname = `${basePath}${pathname}`;
  baseUrl.search = search;
  return baseUrl.toString();
}

export function resolveUpstream(
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

export function buildRequestHeaders(
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

export function buildResponseHeaders(headers: Headers): Record<string, string> {
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

export function sendText(res: ExpressResponse, status: number, message: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(`${message}\n`);
}
