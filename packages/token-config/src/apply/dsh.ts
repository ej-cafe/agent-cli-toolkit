import { chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Document, isMap, isScalar, isSeq } from "yaml";
import type { YAMLMap, YAMLSeq } from "yaml";
import { fail } from "../errors.js";
import type { TokenProfile } from "../types.js";
import { loadYamlMap, writeYamlAtomic } from "../yaml-file.js";
import { inspectTool } from "./presence.js";

const posixEnvName = /^[A-Za-z_][A-Za-z0-9_]*$/u;
const credentialsReservedKeys = new Set(["version", "refs", "records"]);

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
  const env = `${body}_API_KEY`;
  if (!posixEnvName.test(env)) {
    fail(`无法从 profile 名称派生 apiKeyEnv: ${name}`);
  }
  return env;
}

function isPosixEnvName(value: string): boolean {
  return posixEnvName.test(value);
}

function stringKeys(map: YAMLMap): string[] {
  const keys: string[] = [];
  for (const item of map.items) {
    const raw = isScalar(item.key) ? item.key.value : item.key;
    if (typeof raw !== "string") {
      fail(".credentials.yaml 含无法迁入 refs 的键");
    }
    keys.push(raw);
  }
  return keys;
}

function isStringCredentialValue(value: unknown): boolean {
  if (typeof value === "string") {
    return value.length > 0;
  }
  if (isScalar(value) && typeof value.value === "string") {
    return value.value.length > 0;
  }
  return false;
}

function requireRefsMap(doc: Document): YAMLMap {
  if (!doc.has("refs") || doc.get("refs") === null) {
    doc.set("refs", doc.createNode({}));
  }
  const node = doc.get("refs");
  if (!isMap(node)) {
    fail(".credentials.yaml 的 refs 必须是映射");
  }
  return node;
}

function movePosixKeysToRefs(
  doc: Document,
  refs: YAMLMap,
  keys: string[],
): void {
  for (const key of keys) {
    if (!isPosixEnvName(key)) {
      fail(`.credentials.yaml 含无法迁入 refs 的键: ${key}`);
    }
    const value = doc.get(key, true);
    if (value === undefined || value === null) {
      fail(`.credentials.yaml 含无法迁入 refs 的键: ${key}`);
    }
    if (!isStringCredentialValue(value)) {
      fail(`.credentials.yaml 含无法迁入 refs 的键: ${key}`);
    }
    doc.delete(key);
    refs.set(key, value);
  }
}

function normalizeCredentialsDocument(doc: Document): YAMLMap {
  if (doc.contents == null) {
    doc.contents = doc.createNode({});
  }
  if (!isMap(doc.contents)) {
    fail(".credentials.yaml 根节点必须是映射");
  }

  const keys = stringKeys(doc.contents);
  if (keys.length === 0) {
    doc.set("version", 1);
    return requireRefsMap(doc);
  }

  if (!doc.has("version")) {
    const toMove = keys.filter((key) => key !== "refs");
    const refs = requireRefsMap(doc);
    movePosixKeysToRefs(doc, refs, toMove);
    doc.set("version", 1);
    return refs;
  }

  const version = doc.get("version");
  if (version !== 1) {
    fail(".credentials.yaml 的 version 必须是整数 1");
  }

  const toMove = keys.filter((key) => !credentialsReservedKeys.has(key));
  const refs = requireRefsMap(doc);
  movePosixKeysToRefs(doc, refs, toMove);
  return refs;
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
  if (!inspectTool("dsh").ok) {
    return;
  }
  const apiKeyEnv = apiKeyEnvForProfile(name);
  const settingsPath = dshSettingsPath();
  const credentialsPath = dshCredentialsPath();
  const settings = loadYamlMap(settingsPath);
  const credentials = loadYamlMap(credentialsPath);
  const refs = normalizeCredentialsDocument(credentials);
  refs.set(apiKeyEnv, profile.token);

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

  writeYamlAtomic(settingsPath, settings);
  writeYamlAtomic(credentialsPath, credentials, {
    fileMode: 0o600,
    dirMode: 0o700,
  });
  chmodSync(dshHome(), 0o700);
  chmodSync(credentialsPath, 0o600);
}
