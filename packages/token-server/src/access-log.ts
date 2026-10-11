import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { accessLogPath } from "./paths.js";

/** 访问记录中的失败类别；成功为 null。 */
export type AccessLogError =
  | "invalid_api_key"
  | "no_active_profile"
  | "profile_read_failed"
  | "invalid_base_url"
  | "upstream_failed";

/** 一条代理访问记录（JSON Lines 文件中的一行）。 */
export type AccessLogRecord = {
  time: string;
  method: string;
  path: string;
  status: number;
  profile: string | null;
  durationMs: number;
  error: AccessLogError | null;
};

/** 写入一条访问记录。 */
export type AccessLogger = (record: AccessLogRecord) => void;

export type AccessLoggerOptions = {
  /** 访问记录文件路径；默认写到配置目录下的 token-server-access.jsonl。 */
  path?: string;
  /** 写入失败时的提示通道；默认写到 stderr。 */
  warn?: (line: string) => void;
};

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 创建一个 JSONL 追加写入器：同步追加一行 JSON。
 * 写入失败只在首次提示并不抛出，避免影响转发。
 */
export function createJsonlAppender<T>(
  path: string,
  warn: (line: string) => void,
  failureLabel: string,
): (record: T) => void {
  let warned = false;
  let ensured = false;
  return (record) => {
    try {
      if (!ensured) {
        mkdirSync(dirname(path), { recursive: true });
        ensured = true;
      }
      appendFileSync(path, `${JSON.stringify(record)}\n`, {
        flag: "a",
        encoding: "utf8",
      });
    } catch (error) {
      if (warned) {
        return;
      }
      warned = true;
      warn(`${failureLabel}（${path}）: ${reasonOf(error)}`);
    }
  };
}

/**
 * 创建访问记录写入器：同步追加一行 JSON。
 * 写入失败只在首次提示并不抛出，避免影响转发。
 */
export function createAccessLogger(options: AccessLoggerOptions = {}): AccessLogger {
  const path = options.path ?? accessLogPath();
  const warn =
    options.warn ??
    ((line: string): void => {
      process.stderr.write(`${line}\n`);
    });
  return createJsonlAppender<AccessLogRecord>(path, warn, "访问记录写入失败");
}