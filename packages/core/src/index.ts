export const toolkitName = "agent-cli-toolkit";

export function getVersion(): string {
  return "0.1.1";
}

export { ensureConfigDir, getConfigDir } from "./config-dir.js";
