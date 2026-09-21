import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setHttpFetch } from "../src/http.js";
import type { HttpFetch, HttpFetchResponse } from "../src/http.js";

/** 指向临时目录的 XDG_CONFIG_HOME（每个测试文件独立进程，互不影响）。 */
export function useTempXdgConfig(): {
  configHome: string;
  cleanup: () => void;
} {
  const configHome = mkdtempSync(join(tmpdir(), "agent-cli-test-"));
  process.env.XDG_CONFIG_HOME = configHome;
  return {
    configHome,
    cleanup: () => {
      rmSync(configHome, { recursive: true, force: true });
      delete process.env.XDG_CONFIG_HOME;
    },
  };
}

export function jsonResponse(data: unknown): HttpFetchResponse {
  return { ok: true, status: 200, json: async () => data };
}

export function statusResponse(status: number): HttpFetchResponse {
  return {
    ok: false,
    status,
    json: async () => {
      throw new Error(`HTTP ${status}`);
    },
  };
}

class TimeoutFetchError extends Error {
  readonly name = "TimeoutError";
}

export function timeoutError(): Error {
  return new TimeoutFetchError();
}

/** 注入按 URL 路由的 mock 传输；返回恢复函数。 */
export function mockHttpFetch(
  route: (url: string) => HttpFetchResponse | Promise<HttpFetchResponse>,
): () => void {
  const fn: HttpFetch = async (url) => route(url);
  setHttpFetch(fn);
  return () => setHttpFetch(undefined);
}

/** 临时捕获 stdout / stderr 文本（测试运行器静音用）。 */
export async function captureStd(
  fn: () => Promise<number>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const writes = { stdout: "", stderr: "" };
  const origStdout = process.stdout.write;
  const origStderr = process.stderr.write;
  process.stdout.write = ((chunk: Uint8Array | string) => {
    writes.stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: Uint8Array | string) => {
    writes.stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    const code = await fn();
    return { ...writes, code };
  } finally {
    process.stdout.write = origStdout;
    process.stderr.write = origStderr;
  }
}
