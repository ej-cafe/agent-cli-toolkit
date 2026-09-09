import { homedir } from "node:os";
import { join } from "node:path";
import { fail } from "../errors.js";
import { isRecord, readJsonObject, writeJsonAtomic } from "../json-file.js";
import type { Platform, TokenProfile } from "../types.js";
import { claudeCompatibleUrl } from "./claude-url.js";

const anthropicNpm = "@ai-sdk/anthropic";

export function openCodeConfigPath(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    return join(xdgConfigHome, "opencode", "opencode.json");
  }
  return join(homedir(), ".config", "opencode", "opencode.json");
}

export function openCodeProviderId(platform: Platform): "bailian" | "tencent" {
  return platform === "aliyun" ? "bailian" : "tencent";
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

export function applyOpenCode(profile: TokenProfile): void {
  const path = openCodeConfigPath();
  const root = readJsonObject(path) ?? {};
  const providerValue = root.provider;
  const providers: Record<string, unknown> = isRecord(providerValue)
    ? { ...providerValue }
    : {};
  if (providerValue !== undefined && !isRecord(providerValue)) {
    fail(`OpenCode 配置的 provider 必须是对象: ${path}`);
  }

  const id = openCodeProviderId(profile.platform);
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

  options.apiKey = profile.token;
  options.baseURL = claudeCompatibleUrl(profile);
  provider.options = options;
  provider.models = upsertModels(provider.models, profile);

  if (created && provider.npm === undefined) {
    provider.npm = anthropicNpm;
  }

  providers[id] = provider;
  writeJsonAtomic(path, { ...root, provider: providers });
}
