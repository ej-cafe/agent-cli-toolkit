export const toolkitName = "agent-cli-toolkit";

export function getVersion(): string {
  return "0.1.4";
}

export { ensureConfigDir, getConfigDir } from "./config-dir.js";
