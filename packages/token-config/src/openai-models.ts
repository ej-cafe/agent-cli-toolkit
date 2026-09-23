import { fetchJson, joinUrlPath } from "./http.js";
import { isRecord } from "./json-file.js";
import type { TokenProfileModel } from "./types.js";

export type OpenAiModelsResult =
  | { models: TokenProfileModel[] }
  | { models: undefined; reason: string };

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

export async function tryFetchOpenAiModels(
  baseUrl: string,
  token: string,
): Promise<OpenAiModelsResult> {
  const url = joinUrlPath(baseUrl, "/models");
  if (url === undefined) {
    return { models: undefined, reason: "baseUrl 无效" };
  }

  const result = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!result.ok) {
    if (result.error.kind === "timeout") {
      return { models: undefined, reason: `GET ${url} 超时` };
    }
    if (result.error.kind === "http") {
      return {
        models: undefined,
        reason: `GET ${url} 失败: HTTP ${result.error.status}`,
      };
    }
    return { models: undefined, reason: `GET ${url} 失败` };
  }

  const models = parseOpenAiModels(result.data);
  if (models === undefined) {
    return {
      models: undefined,
      reason: `GET ${url} 响应无法解析或列表为空`,
    };
  }
  return { models };
}
