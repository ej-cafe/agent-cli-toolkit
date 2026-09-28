import { loadProfiles } from "@agent-cli-toolkit/token-config";
import type { TokenProfile } from "@agent-cli-toolkit/token-config";
import { readActiveProfile } from "./state.js";

/**
 * 每次调用都重新读取磁盘（`token-server.json` 与 `token-profile.json`），
 * 使 `switch` 无需重启服务器即可生效。无激活 profile 或该 profile 已被删除时返回 undefined。
 */
export function resolveActiveProfile(): TokenProfile | undefined {
  const name = readActiveProfile();
  if (name === undefined) {
    return undefined;
  }
  const { profiles } = loadProfiles();
  return profiles[name];
}
