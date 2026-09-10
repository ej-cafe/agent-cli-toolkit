import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Document, isMap, isSeq } from "yaml";
import type { YAMLMap, YAMLSeq } from "yaml";
import { fail } from "../errors.js";
import type { TokenProfile } from "../types.js";
import { loadYamlMap, writeYamlAtomic } from "../yaml-file.js";

export function dshHome(): string {
  const fromEnv = process.env.DSH_HOME?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  return join(homedir(), ".dsh");
}

export function dshSettingsPath(): string {
  return join(dshHome(), "settings.yaml");
}

export function dshCredentialsPath(): string {
  return join(dshHome(), ".credentials.yaml");
}

export function apiKeyEnvForProfile(name: string): string {
  const body = name.toUpperCase().replace(/[^A-Z0-9]/gu, "_");
  return `AGENT_CLI_${body}_API_KEY`;
}

function assertMapOrMissing(
  doc: Document,
  path: string[],
  label: string,
): void {
  if (!doc.hasIn(path)) {
    return;
  }
  const node = doc.getIn(path);
  if (!isMap(node)) {
    fail(`${label} 必须是映射`);
  }
}

function requireMap(
  doc: Document,
  path: string[],
  label: string,
): YAMLMap {
  assertMapOrMissing(doc, path, label);
  if (!doc.hasIn(path)) {
    doc.setIn(path, doc.createNode({}));
  }
  const node = doc.getIn(path);
  if (!isMap(node)) {
    fail(`${label} 必须是映射`);
  }
  return node;
}

function upsertModels(
  doc: Document,
  provider: YAMLMap,
  profile: TokenProfile,
  label: string,
): void {
  let modelsNode = provider.get("models");
  if (modelsNode === undefined || modelsNode === null) {
    provider.set("models", doc.createNode([]));
    modelsNode = provider.get("models");
  }
  if (!isSeq(modelsNode)) {
    fail(`${label}.models 必须是数组`);
  }
  const seq: YAMLSeq = modelsNode;

  const existing = new Map<string, YAMLMap>();
  for (const item of seq.items) {
    if (!isMap(item)) {
      continue;
    }
    const id = item.get("id");
    if (typeof id === "string" && id.length > 0) {
      existing.set(id, item);
    }
  }

  for (const model of profile.models) {
    const current = existing.get(model.id);
    if (current !== undefined) {
      current.set("name", model.name);
      continue;
    }
    seq.add(doc.createNode({ id: model.id, name: model.name }));
  }
}

export function applyDsh(
  name: string,
  profile: TokenProfile,
  modelId?: string,
): void {
  const settingsPath = dshSettingsPath();
  const credentialsPath = dshCredentialsPath();
  const settings = loadYamlMap(settingsPath);
  const credentials = loadYamlMap(credentialsPath);

  assertMapOrMissing(settings, ["llm-pi-ai"], "llm-pi-ai");
  assertMapOrMissing(settings, ["llm-pi-ai", "providers"], "llm-pi-ai.providers");

  const providers = requireMap(
    settings,
    ["llm-pi-ai", "providers"],
    "llm-pi-ai.providers",
  );
  const existingProvider = providers.get(name);
  if (existingProvider !== undefined && !isMap(existingProvider)) {
    fail(`llm-pi-ai.providers.${name} 必须是映射`);
  }

  const provider = requireMap(
    settings,
    ["llm-pi-ai", "providers", name],
    `llm-pi-ai.providers.${name}`,
  );
  const apiKeyEnv = apiKeyEnvForProfile(name);
  provider.set("displayName", name);
  provider.set("api", "openai-completions");
  provider.set("baseURL", profile.baseUrl);
  provider.set("apiKeyEnv", apiKeyEnv);
  upsertModels(settings, provider, profile, `llm-pi-ai.providers.${name}`);

  if (modelId !== undefined) {
    assertMapOrMissing(
      settings,
      ["agent-default-model"],
      "agent-default-model",
    );
    settings.setIn(["agent-default-model", "provider"], name);
    settings.setIn(["agent-default-model", "model"], modelId);
  }

  credentials.set(apiKeyEnv, profile.token);

  mkdirSync(dshHome(), { recursive: true, mode: 0o700 });
  writeYamlAtomic(settingsPath, settings);
  writeYamlAtomic(credentialsPath, credentials, {
    fileMode: 0o600,
    dirMode: 0o700,
  });
  chmodSync(dshHome(), 0o700);
  chmodSync(credentialsPath, 0o600);
}
