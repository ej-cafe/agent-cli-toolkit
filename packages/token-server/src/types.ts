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
  /** 解析当前激活 profile 名（仅用于访问记录）；未提供时记录 profile 为 null。 */
  resolveProfileName?: () => string | undefined;
  /** 访问记录文件路径；默认写到配置目录下的 token-server-access.jsonl。 */
  accessLogPath?: string;
  /** 是否追踪入站请求体与上游响应体；默认 true，`--no-trace-body` 时为 false。 */
  traceBody?: boolean;
  /** 请求体追踪文件路径；默认写到配置目录下的 token-server-access-body.jsonl。 */
  accessBodyLogPath?: string;
};
