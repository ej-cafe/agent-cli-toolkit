export type HttpFetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

/** 可注入的底层传输，形状与 fetch 一致（仅 GET 场景）。 */
export type HttpFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<HttpFetchResponse>;

export type FetchJsonError =
  | { kind: "network" }
  | { kind: "timeout" }
  | { kind: "http"; status: number }
  | { kind: "json" };

export type FetchJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; error: FetchJsonError };

const defaultTimeoutMs = 15_000;

async function defaultFetch(
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
): Promise<HttpFetchResponse> {
  const response = await fetch(input, init);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
  };
}

let httpFetch: HttpFetch = defaultFetch;

/** 测试注入钩子：替换底层传输；传 undefined 恢复默认 fetch。 */
export function setHttpFetch(fn: HttpFetch | undefined): void {
  httpFetch = fn ?? defaultFetch;
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "TimeoutError"
  );
}

/** GET 一个 JSON 资源；失败以返回值报告，不抛错。 */
export async function fetchJson(
  url: string,
  options: {
    headers: Record<string, string>;
    timeoutMs?: number;
  },
): Promise<FetchJsonResult> {
  let response: HttpFetchResponse;
  try {
    response = await httpFetch(url, {
      method: "GET",
      headers: options.headers,
      signal: AbortSignal.timeout(options.timeoutMs ?? defaultTimeoutMs),
    });
  } catch (error) {
    if (isTimeout(error)) {
      return { ok: false, error: { kind: "timeout" } };
    }
    return { ok: false, error: { kind: "network" } };
  }

  if (!response.ok) {
    return { ok: false, error: { kind: "http", status: response.status } };
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    return { ok: false, error: { kind: "json" } };
  }

  return { ok: true, data };
}

/** 去尾部斜杠并校验合法 URL 后拼接后缀；baseUrl 空/非法返回 undefined。 */
export function joinUrlPath(
  baseUrl: string,
  suffix: string,
): string | undefined {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed === "") {
    return undefined;
  }
  try {
    new URL(trimmed);
  } catch {
    return undefined;
  }
  return `${trimmed}${suffix}`;
}
