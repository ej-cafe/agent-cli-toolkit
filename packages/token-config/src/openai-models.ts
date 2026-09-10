import { isRecord } from "./json-file.js";
import type { TokenProfileModel } from "./types.js";

const requestTimeoutMs = 15_000;

export type OpenAiModelsFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export type OpenAiModelsResult =
  | { models: TokenProfileModel[] }
  | { models: undefined; reason: string };

async function defaultFetch(
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  const response = await fetch(input, init);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
  };
}

let openAiModelsFetch: OpenAiModelsFetch = defaultFetch;

export function setOpenAiModelsFetch(fn: OpenAiModelsFetch | undefined): void {
  openAiModelsFetch = fn ?? defaultFetch;
}

function modelsUrl(baseUrl: string): string | undefined {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed === "") {
    return undefined;
  }
  try {
    new URL(trimmed);
  } catch {
    return undefined;
  }
  return `${trimmed}/models`;
}

function parseOpenAiModels(parsed: unknown): TokenProfileModel[] | undefined {
  if (!isRecord(parsed) || !Array.isArray(parsed.data)) {
    return undefined;
  }

  const models: TokenProfileModel[] = [];
  for (const item of parsed.data) {
    if (!isRecord(item)) {
      continue;
    }
    const id = item.id;
    if (typeof id !== "string" || id.trim() === "") {
      continue;
    }
    const trimmedId = id.trim();
    const name = item.name;
    models.push({
      id: trimmedId,
      name:
        typeof name === "string" && name.trim() !== ""
          ? name.trim()
          : trimmedId,
    });
  }

  return models.length > 0 ? models : undefined;
}

function isTimeout(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name: unknown }).name === "TimeoutError"
  );
}

export async function tryFetchOpenAiModels(
  baseUrl: string,
  token: string,
): Promise<OpenAiModelsResult> {
  const url = modelsUrl(baseUrl);
  if (url === undefined) {
    return { models: undefined, reason: "baseUrl 无效" };
  }
  
  try {
    const response = await openAiModelsFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    if (!response.ok) {
      return {
        models: undefined,
        reason: `GET ${url} 失败: HTTP ${response.status}`,
      };
    }
    const models = parseOpenAiModels(await response.json());
    if (models === undefined) {
      return {
        models: undefined,
        reason: `GET ${url} 响应无法解析或列表为空`,
      };
    }
    return { models };
  } catch (error) {
    if (isTimeout(error)) {
      return { models: undefined, reason: `GET ${url} 超时` };
    }
    return { models: undefined, reason: `GET ${url} 失败` };
  }
}
