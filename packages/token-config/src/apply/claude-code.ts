import { homedir } from "node:os";
import { join } from "node:path";
import { fail } from "../errors.js";
import { isRecord, readJsonObject, writeJsonAtomic } from "../json-file.js";
import type { TokenProfile } from "../types.js";
import { claudeCompatibleUrl } from "./claude-url.js";

export function claudeSettingsPath(): string {
  return join(homedir(), ".claude", "settings.json");
}

export function applyClaudeCode(
  profile: TokenProfile,
  modelId?: string,
): void {
  const path = claudeSettingsPath();
  const existing = readJsonObject(path) ?? {};
  const envValue = existing.env;
  const env: Record<string, unknown> = isRecord(envValue) ? { ...envValue } : {};
  if (envValue !== undefined && !isRecord(envValue)) {
    fail(`Claude Code settings.json 的 env 必须是对象: ${path}`);
  }

  env.ANTHROPIC_AUTH_TOKEN = profile.token;
  env.ANTHROPIC_BASE_URL = claudeCompatibleUrl(profile);
  if (modelId !== undefined) {
    env.ANTHROPIC_MODEL = modelId;
  }

  writeJsonAtomic(path, { ...existing, env });
}
