export const toolkitName = "agent-cli-toolkit";

export function getVersion(): string {
  return "0.1.3";
}

export { ensureConfigDir, getConfigDir } from "./config-dir.js";
