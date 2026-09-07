import { mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const configDirName = "agent-cli-toolkit";

export function getConfigDir(): string {
  const xdgConfigHome = process.env.XDG_CONFIG_HOME?.trim();
  if (xdgConfigHome) {
    return join(xdgConfigHome, configDirName);
  }

  return join(homedir(), ".config", configDirName);
}

export function ensureConfigDir(): string {
  const dir = getConfigDir();
  mkdirSync(dir, { recursive: true });
  return dir;
}
