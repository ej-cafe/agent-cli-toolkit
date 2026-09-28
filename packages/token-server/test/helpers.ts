import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getConfigDir } from "@agent-cli-toolkit/core";
import type { TokenProfile } from "@agent-cli-toolkit/token-config";
import { writeApiKey } from "../src/key.js";

/** 指向临时目录的 XDG_CONFIG_HOME（每个测试文件独立进程，互不影响）。 */
export function useTempXdgConfig(): {
  configHome: string;
  cleanup: () => void;
} {
  const configHome = mkdtempSync(join(tmpdir(), "agent-cli-token-server-test-"));
  process.env.XDG_CONFIG_HOME = configHome;
  return {
    configHome,
    cleanup: () => {
      rmSync(configHome, { recursive: true, force: true });
      delete process.env.XDG_CONFIG_HOME;
    },
  };
}

export function profile(overrides: Partial<TokenProfile> = {}): TokenProfile {
  const base: TokenProfile = {
    platform: "deepseek",
    token: "secret-token",
    baseUrl: "http://127.0.0.1:9/v1",
    models: [{ id: "model-a", name: "Model A" }],
  };
  return { ...base, ...overrides };
}

/** 直接写入 token-profile.json（绕过 add 流程，便于离线测试）。 */
export function writeProfiles(profiles: Record<string, TokenProfile>): void {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "token-profile.json"),
    `${JSON.stringify({ profiles }, null, 2)}\n`,
    "utf8",
  );
}

/** 直接写入一个服务器 API key，返回测试用的固定 key。 */
export function installApiKey(key = "test-server-key"): string {
  writeApiKey(key);
  return key;
}
