import { Transform, type TransformCallback } from "node:stream";
import { createJsonlAppender } from "./access-log.js";
import { accessBodyLogPath } from "./paths.js";

/** 请求体追踪上限：超过则只保留前 64 KiB，转发字节不受影响。 */
export const bodyCaptureLimitBytes = 64 * 1024;

/** 一条请求/响应体追踪记录（JSON Lines 文件中的一行）。 */
export type AccessBodyLogRecord = {
  time: string;
  method: string;
  path: string;
  profile: string | null;
  requestContentType: string | null;
  requestBody: string | null;
  requestBodyTruncated: boolean;
  requestBodySkipped: string | null;
  responseStatus: number;
  responseContentType: string | null;
  responseBody: string | null;
  responseBodyTruncated: boolean;
  responseBodySkipped: string | null;
};

/** 写入一条请求体追踪记录。 */
export type AccessBodyLogger = (record: AccessBodyLogRecord) => void;

export type AccessBodyLoggerOptions = {
  /** 追踪文件路径；默认写到配置目录下的 token-server-access-body.jsonl。 */
  path?: string;
  /** 写入失败时的提示通道；默认写到 stderr。 */
  warn?: (line: string) => void;
};

/** 只有文本类内容类型才追踪请求体；其余类型只记跳过原因。 */
export function isTraceableContentType(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  const type = (contentType.split(";")[0] ?? "").trim().toLowerCase();
  return (
    type === "application/json" ||
    type === "application/x-ndjson" ||
    type === "application/x-www-form-urlencoded" ||
    type.startsWith("text/")
  );
}

/**
 * 转发时旁路捕获请求体：原样透传每个分块，仅累计前 `limit` 字节用于记录。
 * 不缓冲整个请求体，因此不阻塞流式转发。
 */
export class BodyCapture extends Transform {
  private readonly chunks: Buffer[] = [];
  private size = 0;
  private truncated = false;

  constructor(private readonly limit: number = bodyCaptureLimitBytes) {
    super();
  }

  override _transform(
    chunk: Buffer | string,
    encoding: BufferEncoding,
    callback: TransformCallback,
  ): void {
    const buffer = typeof chunk === "string" ? Buffer.from(chunk, encoding) : chunk;
    if (this.size < this.limit) {
      const remaining = this.limit - this.size;
      const slice = buffer.length > remaining ? buffer.subarray(0, remaining) : buffer;
      this.chunks.push(Buffer.from(slice));
      this.size += slice.length;
      if (buffer.length > remaining) {
        this.truncated = true;
      }
    } else {
      this.truncated = true;
    }
    callback(null, chunk);
  }

  /** 已捕获的请求体文本（可能被截断）。 */
  capturedText(): string {
    return Buffer.concat(this.chunks).toString("utf8");
  }

  /** 是否因超出上限被截断。 */
  wasTruncated(): boolean {
    return this.truncated;
  }
}

/** 一侧（请求或响应）的捕获状态。 */
export type BodySideTrace = {
  /** 该侧是否存在请求/响应体。 */
  hasBody: boolean;
  contentType: string | null;
  /** 内容类型可追踪且确有请求体时用 BodyCapture 旁路捕获。 */
  traceable: boolean;
  capture?: BodyCapture;
};

/** 把一侧的捕获状态折算成记录字段（无 body、不可追踪、已捕获三种）。 */
export function bodySideFields(side: BodySideTrace | undefined): {
  body: string | null;
  truncated: boolean;
  skipped: string | null;
} {
  if (side === undefined || !side.hasBody) {
    return { body: null, truncated: false, skipped: null };
  }
  if (!side.traceable) {
    return { body: null, truncated: false, skipped: side.contentType ?? "unknown" };
  }
  return {
    body: side.capture?.capturedText() ?? "",
    truncated: side.capture?.wasTruncated() ?? false,
    skipped: null,
  };
}

/**
 * 创建请求体追踪写入器：同步追加一行 JSON。
 * 写入失败只在首次提示并不抛出，避免影响转发。
 */
export function createAccessBodyLogger(
  options: AccessBodyLoggerOptions = {},
): AccessBodyLogger {
  const path = options.path ?? accessBodyLogPath();
  const warn =
    options.warn ??
    ((line: string): void => {
      process.stderr.write(`${line}\n`);
    });
  return createJsonlAppender<AccessBodyLogRecord>(
    path,
    warn,
    "请求体与响应体追踪写入失败",
  );
}