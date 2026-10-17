import type {
  Application,
  NextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import express from "express";
import { createAccessLogger } from "./access-log.js";
import { createAccessBodyLogger } from "./access-body-log.js";
import {
  createAccessLogMiddleware,
  createAuthMiddleware,
  createProxyMiddleware,
  createResolveMiddleware,
} from "./middleware.js";
import type { TokenServerFetch, TokenServerOptions } from "./types.js";

export type { TokenServerFetch, TokenServerOptions, TokenServerRequestInit } from "./types.js";

const defaultFetch: TokenServerFetch = (input, init) =>
  fetch(input, init as RequestInit);

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

  // 中间件链：访问记录 → 鉴权 → 解析 profile/上游 → 转发。
  // 用 `app.use` 而非路由表，因为 `app.use` 匹配全部路径且不改写 `req.url`。
  app.use(createAccessLogMiddleware(accessLogger, accessBodyLogger));
  app.use(createAuthMiddleware(options, log));
  app.use(createResolveMiddleware(options, log));
  app.use(createProxyMiddleware(fetchImpl, log, accessBodyLogger));

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
