import { join } from "node:path";
import { ensureConfigDir, getConfigDir } from "@agent-cli-toolkit/core";
import { fail } from "./errors.js";
import { isRecord, readJsonObject, writeJsonAtomic } from "./json-file.js";
import { tryFetchOpenAiModels } from "./openai-models.js";
import type {
  Platform,
  TokenProfile,
  TokenProfileFile,
  TokenProfileModel,
} from "./types.js";

const profileFileName = "token-profile.json";

export function isPlatform(value: string): value is Platform {
  return (
    value === "aliyun" ||
    value === "tencent" ||
    value === "deepseek" ||
    value === "kimi"
  );
}

export function profileFilePath(): string {
  return join(getConfigDir(), profileFileName);
}

function parseModels(value: unknown): TokenProfileModel[] {
  if (!Array.isArray(value)) {
    fail("token-profile.json 中的 models 必须是数组");
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      fail(`token-profile.json 中的 models[${index}] 必须是对象`);
    }
    const id = item.id;
    const name = item.name;
    if (typeof id !== "string" || id.trim() === "") {
      fail(`token-profile.json 中的 models[${index}].id 无效`);
    }
    if (typeof name !== "string" || name.trim() === "") {
      fail(`token-profile.json 中的 models[${index}].name 无效`);
    }
    return { id, name };
  });
}

function parseProfile(name: string, value: unknown): TokenProfile {
  if (!isRecord(value)) {
    fail(`token-profile.json 中的 profile "${name}" 必须是对象`);
  }

  const platform = value.platform;
  if (typeof platform !== "string" || !isPlatform(platform)) {
    fail(`token-profile.json 中的 profile "${name}" 平台无效`);
  }

  const token = value.token;
  const baseUrl = value.baseUrl;
  if (typeof token !== "string" || token.trim() === "") {
    fail(`token-profile.json 中的 profile "${name}" 缺少 token`);
  }
  if (typeof baseUrl !== "string" || baseUrl.trim() === "") {
    fail(`token-profile.json 中的 profile "${name}" 缺少 baseUrl`);
  }

  const profile: TokenProfile = {
    platform,
    token,
    baseUrl,
    models: parseModels(value.models),
  };

  const claudeBaseUrl = value.claudeBaseUrl;
  if (typeof claudeBaseUrl === "string" && claudeBaseUrl.trim() !== "") {
    profile.claudeBaseUrl = claudeBaseUrl;
  }

  return profile;
}

export function loadProfiles(): TokenProfileFile {
  const path = profileFilePath();
  const data = readJsonObject(path);
  if (data === undefined) {
    return { profiles: {} };
  }

  const profilesValue = data.profiles;
  if (!isRecord(profilesValue)) {
    fail("token-profile.json 必须包含 profiles 对象");
  }

  const profiles: Record<string, TokenProfile> = {};
  for (const [name, value] of Object.entries(profilesValue)) {
    profiles[name] = parseProfile(name, value);
  }

  return { profiles };
}

export function saveProfiles(file: TokenProfileFile): void {
  ensureConfigDir();
  writeJsonAtomic(profileFilePath(), file);
}

async function fetchModelsOrFail(
  baseUrl: string,
  token: string,
  label: string,
): Promise<TokenProfileModel[]> {
  const result = await tryFetchOpenAiModels(baseUrl, token);
  if (result.models === undefined) {
    fail(`无法获取 ${label} 模型列表: ${result.reason}`);
  }
  return result.models;
}

export async function syncProfileModels(
  name: string,
): Promise<TokenProfileModel[]> {
  const file = loadProfiles();
  const profile = file.profiles[name];
  if (profile === undefined) {
    fail(`profile 不存在: ${name}`);
  }

  const models = await fetchModelsOrFail(
    profile.baseUrl,
    profile.token,
    name,
  );
  const latest = loadProfiles();
  const current = latest.profiles[name];
  if (current === undefined) {
    fail(`profile 不存在: ${name}`);
  }
  current.models = models.map((item) => ({ ...item }));
  saveProfiles(latest);
  return current.models;
}

export async function addProfile(input: {
  name: string;
  platform: Platform;
  token: string;
  baseUrl: string;
  claudeBaseUrl?: string;
}): Promise<TokenProfile> {
  const file = loadProfiles();
  if (file.profiles[input.name] !== undefined) {
    fail(`profile 已存在: ${input.name}`);
  }

  const models = await fetchModelsOrFail(
    input.baseUrl,
    input.token,
    input.name,
  );
  const latest = loadProfiles();
  if (latest.profiles[input.name] !== undefined) {
    fail(`profile 已存在: ${input.name}`);
  }
  const profile: TokenProfile = {
    platform: input.platform,
    token: input.token,
    baseUrl: input.baseUrl,
    models: models.map((item) => ({ ...item })),
  };
  if (input.claudeBaseUrl !== undefined) {
    profile.claudeBaseUrl = input.claudeBaseUrl;
  }

  latest.profiles[input.name] = profile;
  saveProfiles(latest);
  return profile;
}

export function deleteProfile(name: string): void {
  const file = loadProfiles();
  if (file.profiles[name] === undefined) {
    fail(`profile 不存在: ${name}`);
  }
  const { [name]: _removed, ...rest } = file.profiles;
  saveProfiles({ profiles: rest });
}

export function getProfile(name: string): TokenProfile {
  const file = loadProfiles();
  const profile = file.profiles[name];
  if (profile === undefined) {
    fail(`profile 不存在: ${name}`);
  }
  return profile;
}
