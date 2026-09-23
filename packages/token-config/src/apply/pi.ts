import { chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fail } from "../errors.js";
import { isRecord, readJsonObject, writeJsonAtomic } from "../json-file.js";
import type { TokenProfile } from "../types.js";
import { inspectTool } from "./presence.js";

export function piAgentDir(): string {
  const fromEnv = process.env.PI_CODING_AGENT_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return join(homedir(), ".pi", "agent");
}

export function piModelsPath(): string {
  return join(piAgentDir(), "models.json");
}

export function piAuthPath(): string {
  return join(piAgentDir(), "auth.json");
}

export function piSettingsPath(): string {
  return join(piAgentDir(), "settings.json");
}

function upsertModels(
  existing: unknown,
  profile: TokenProfile,
  label: string,
): unknown[] {
  if (existing !== undefined && !Array.isArray(existing)) {
    fail(`${label}.models 必须是数组`);
  }

  const models: unknown[] = Array.isArray(existing) ? [...existing] : [];
  const indexById = new Map<string, number>();
  for (let i = 0; i < models.length; i += 1) {
    const item = models[i];
    if (isRecord(item) && typeof item.id === "string" && item.id.length > 0) {
      indexById.set(item.id, i);
    }
  }

  for (const model of profile.models) {
    const index = indexById.get(model.id);
    if (index !== undefined) {
      const current = models[index];
      if (isRecord(current)) {
        models[index] = { ...current, name: model.name };
      }
      continue;
    }
    models.push({ id: model.id, name: model.name });
  }

  return models;
}

export function applyPi(
  name: string,
  profile: TokenProfile,
  modelId: string,
): void {
  if (!inspectTool("pi").ok) {
    return;
  }
  const modelsPath = piModelsPath();
  const authPath = piAuthPath();
  const settingsPath = piSettingsPath();

  const modelsRoot = readJsonObject(modelsPath) ?? {};
  const authRoot = readJsonObject(authPath) ?? {};
  const settingsRoot = readJsonObject(settingsPath) ?? {};

  const providersValue = modelsRoot.providers;
  if (providersValue !== undefined && !isRecord(providersValue)) {
    fail(`pi models.json 的 providers 必须是对象: ${modelsPath}`);
  }
  const providers: Record<string, unknown> = isRecord(providersValue)
    ? { ...providersValue }
    : {};

  const existingProvider = providers[name];
  if (existingProvider !== undefined && !isRecord(existingProvider)) {
    fail(`pi providers.${name} 必须是对象: ${modelsPath}`);
  }

  const provider: Record<string, unknown> = isRecord(existingProvider)
    ? { ...existingProvider }
    : {};

  provider.baseUrl = profile.baseUrl;
  provider.api = "openai-completions";
  provider.authHeader = true;
  provider.models = upsertModels(
    provider.models,
    profile,
    `providers.${name}`,
  );

  providers[name] = provider;

  const nextAuth: Record<string, unknown> = {
    ...authRoot,
    [name]: { type: "api_key", key: profile.token },
  };

  writeJsonAtomic(modelsPath, { ...modelsRoot, providers });
  writeJsonAtomic(authPath, nextAuth);
  chmodSync(authPath, 0o600);

  writeJsonAtomic(settingsPath, {
    ...settingsRoot,
    defaultProvider: name,
    defaultModel: modelId,
  });
}
