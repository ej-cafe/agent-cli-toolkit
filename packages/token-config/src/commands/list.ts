import { parseArgs } from "node:util";
import { fail } from "../errors.js";
import { loadProfiles } from "../store.js";

function maskToken(token: string): string {
  if (token.length <= 8) {
    return "****";
  }
  return `${token.slice(0, 4)}****${token.slice(-4)}`;
}

export function runTokenList(args: string[]): number {
  const { positionals } = parseArgs({
    args,
    options: {},
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    fail("用法: agent-cli token list");
  }

  const { profiles } = loadProfiles();
  const names = Object.keys(profiles).sort();
  if (names.length === 0) {
    process.stdout.write("暂无 profile\n");
    return 0;
  }

  const lines: string[] = [];
  for (const name of names) {
    const profile = profiles[name];
    if (profile === undefined) {
      continue;
    }
    lines.push(`${name}`);
    lines.push(`  platform: ${profile.platform}`);
    lines.push(`  baseUrl: ${profile.baseUrl}`);
    if (profile.claudeBaseUrl !== undefined) {
      lines.push(`  claudeBaseUrl: ${profile.claudeBaseUrl}`);
    }
    lines.push(`  token: ${maskToken(profile.token)}`);
    lines.push(`  models: ${profile.models.length}`);
  }

  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}
