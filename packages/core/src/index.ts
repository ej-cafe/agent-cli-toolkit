export const toolkitName = "agent-cli-toolkit";

export function getVersion(): string {
  return "0.1.0";
}

export { ensureConfigDir, getConfigDir } from "./config-dir.js";
