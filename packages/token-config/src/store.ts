import { join } from "node:path";
import { ensureConfigDir, getConfigDir } from "@agent-cli-toolkit/core";
import { modelsForPlatform } from "./catalog.js";
import { fail } from "./errors.js";
import { isRecord, readJsonObject, writeJsonAtomic } from "./json-file.js";
import { fetchTencentModels } from "./tencent-models.js";
import type {
  Platform,
  TokenProfile,
  TokenProfileFile,
  TokenProfileModel,
} from "./types.js";

const profileFileName = "token-profile.json";
const modelListFileName = "model-list.json";

export function isPlatform(value: string): value is Platform {
  return value === "aliyun" || value === "tencent";
}

export function profileFilePath(): string {
  return join(getConfigDir(), profileFileName);
}

export function modelListFilePath(): string {
  return join(getConfigDir(), modelListFileName);
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

function parseCatalogModels(
  value: unknown,
  label: string,
): TokenProfileModel[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }

  return value.map((item, index) => {
    if (!isRecord(item)) {
      fail(`${label}[${index}] 必须是对象`);
    }
    const id = item.id;
    const name = item.name;
    if (typeof id !== "string" || id.trim() === "") {
      fail(`${label}[${index}].id 无效`);
    }
    if (typeof name !== "string" || name.trim() === "") {
      fail(`${label}[${index}].name 无效`);
    }
    return { id, name };
  });
}

function loadModelListRoot(): Record<string, unknown> {
  return readJsonObject(modelListFilePath()) ?? {};
}

export function getStoredPlatformModels(
  platform: Platform,
): TokenProfileModel[] | undefined {
  return parseCatalogModels(
    loadModelListRoot()[platform],
    `model-list.json 中的 ${platform}`,
  );
}

function writePlatformModels(
  platform: Platform,
  models: TokenProfileModel[],
): void {
  if (models.length === 0) {
    fail("模型列表不能为空");
  }
  ensureConfigDir();
  const root = loadModelListRoot();
  writeJsonAtomic(modelListFilePath(), { ...root, [platform]: models });
}

function applyModelsToProfiles(
  platform: Platform,
  models: TokenProfileModel[],
): void {
  const file = loadProfiles();
  let changed = false;
  for (const profile of Object.values(file.profiles)) {
    if (profile.platform === platform) {
      profile.models = models.map((item) => ({ ...item }));
      changed = true;
    }
  }
  if (changed) {
    saveProfiles(file);
  }
}

async function modelsForSync(platform: Platform): Promise<TokenProfileModel[]> {
  if (platform === "aliyun") {
    return modelsForPlatform("aliyun");
  }
  return fetchTencentModels();
}

export async function syncPlatformModels(
  platform: Platform,
): Promise<TokenProfileModel[]> {
  const models = await modelsForSync(platform);
  writePlatformModels(platform, models);
  applyModelsToProfiles(platform, models);
  return models;
}

export async function ensurePlatformModels(
  platform: Platform,
): Promise<TokenProfileModel[]> {
  const stored = getStoredPlatformModels(platform);
  if (stored !== undefined) {
    return stored;
  }
  return syncPlatformModels(platform);
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

  const models = await ensurePlatformModels(input.platform);
  const latest = loadProfiles();
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
