import type { TokenProfile } from "../types.js";

export function claudeCompatibleUrl(profile: TokenProfile): string {
  const claudeBaseUrl = profile.claudeBaseUrl?.trim();
  if (claudeBaseUrl) {
    return claudeBaseUrl;
  }
  return profile.baseUrl;
}
