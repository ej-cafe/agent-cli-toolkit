import type { TokenProfile } from "@agent-cli-toolkit/token-config";
import type { Response as ExpressResponse } from "express";
import type { AccessLogError } from "./access-log.js";
import type { BodySideTrace } from "./access-body-log.js";

/** 单次代理请求的可变上下文；由 access-log 中间件创建，后续阶段读写。 */
export type ProxyContext = {
  requestUrl: URL;
  method: string;
  startedAt: number;
  errorKind: AccessLogError | null;
  profileName: string | null;
  requestTrace?: BodySideTrace;
  responseTrace?: BodySideTrace;
  profile?: TokenProfile;
  upstreamUrl?: string;
  anthropic?: boolean;
};

type LocalsWithProxy = {
  proxy?: ProxyContext;
};

/** 读取本请求的代理上下文；缺失时抛错（中间件顺序错误）。 */
export function getProxyContext(res: ExpressResponse): ProxyContext {
  const ctx = (res.locals as LocalsWithProxy).proxy;
  if (ctx === undefined) {
    throw new Error("proxy context missing; access-log middleware must run first");
  }
  return ctx;
}

/** 把代理上下文挂到 `res.locals`。 */
export function setProxyContext(res: ExpressResponse, ctx: ProxyContext): void {
  (res.locals as LocalsWithProxy).proxy = ctx;
}
