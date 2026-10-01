import { homedir } from "node:os";
import { join } from "node:path";
import { fail } from "../errors.js";
import { isRecord, readJsonObject, writeJsonAtomic } from "../json-file.js";
import type { TokenProfile } from "../types.js";
import { claudeCompatibleUrl } from "./claude-url.js";
import { inspectTool } from "./presence.js";

const anthropicNpm = "@ai-sdk/anthropic";

/**
 * `@ai-sdk/anthropic` 只在 `baseURL` 后面拼 `/messages`（其默认 baseURL 是
 * `https://api.anthropic.com/v1`），所以它需要的 `baseURL` 必须自带 `/v1`；
 * 而 Claude Code 自己会拼 `/v1/messages`，用的是不带 `/v1` 的 Claude 兼容地址。
 * 已以 `/v1` 结尾时不重复追加。
 */
function anthropicSdkBaseUrl(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

export function openCodeConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    return join(xdgConfigHome, "opencode", "opencode.json");
  }
  return join(homedir(), ".config", "opencode", "opencode.json");
}

function upsertModels(
  existing: unknown,
  profile: TokenProfile,
): Record<string, unknown> {
  const models: Record<string, unknown> = isRecord(existing) ? { ...existing } : {};

  for (const model of profile.models) {
    const current = models[model.id];
    if (isRecord(current)) {
      models[model.id] = { ...current, name: model.name };
    } else {
      models[model.id] = { name: model.name };
    }
  }

  return models;
}

/**
 * 把 OpenCode provider 写入配置。
 * @param npmOverride 显式指定 provider 的 npm 包（如 OpenAI 风格 `@ai-sdk/openai`）；
 *   不传时沿用既有行为：新建 provider 默认 `@ai-sdk/anthropic`，已存在则不覆盖。
 *   若最终 npm 为 `@ai-sdk/anthropic`，`options.baseURL` 会补上 `/v1`（该 SDK 只拼 `/messages`）。
 */
export function applyOpenCode(
  name: string,
  profile: TokenProfile,
  npmOverride?: string,
): void {
  if (!inspectTool("opencode").ok) {
    return;
  }
  const path = openCodeConfigPath();
  const root = readJsonObject(path) ?? {};
  const providerValue = root.provider;
  const providers: Record<string, unknown> = isRecord(providerValue)
    ? { ...providerValue }
    : {};
  if (providerValue !== undefined && !isRecord(providerValue)) {
    fail(`OpenCode 配置的 provider 必须是对象: ${path}`);
  }

  const id = name;
  const existingProvider = providers[id];
  const created = existingProvider === undefined;
  if (existingProvider !== undefined && !isRecord(existingProvider)) {
    fail(`OpenCode provider.${id} 必须是对象: ${path}`);
  }

  const provider: Record<string, unknown> = isRecord(existingProvider)
    ? { ...existingProvider }
    : {};

  const optionsValue = provider.options;
  const options: Record<string, unknown> = isRecord(optionsValue)
    ? { ...optionsValue }
    : {};
  if (optionsValue !== undefined && !isRecord(optionsValue)) {
    fail(`OpenCode provider.${id}.options 必须是对象: ${path}`);
  }

  provider.name = name;
  options.apiKey = profile.token;

  if (npmOverride !== undefined) {
    provider.npm = npmOverride;
  } else if (created && provider.npm === undefined) {
    provider.npm = anthropicNpm;
  }

  const compatibleUrl = claudeCompatibleUrl(profile);
  options.baseURL =
    provider.npm === anthropicNpm
      ? anthropicSdkBaseUrl(compatibleUrl)
      : compatibleUrl;
  provider.options = options;
  provider.models = upsertModels(provider.models, profile);

  providers[id] = provider;
  writeJsonAtomic(path, { ...root, provider: providers });
}
