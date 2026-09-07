export const toolkitName = "agent-cli-toolkit";

export function getVersion(): string {
  return "0.0.0";
}

export { ensureConfigDir, getConfigDir } from "./config-dir.js";
