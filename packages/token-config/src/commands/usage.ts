import { parseArgs } from "node:util";
import { TokenConfigError, fail } from "../errors.js";
import { getProfile, loadProfiles } from "../store.js";
import type { TokenProfile } from "../types.js";
import type { OutputFormat } from "../platforms/platform.js";
import { getPlatform } from "../platforms/registry.js";

const usageHelp =
  "用法: agent-cli token usage [--name <profile>] [--output table|text|raw]";

function isOutputFormat(value: string): value is OutputFormat {
  return value === "table" || value === "text" || value === "raw";
}

function withProfileHeader(
  name: string,
  platform: string,
  body: string,
): string {
  return `${name} (${platform})\n${body}`;
}

async function queryProfile(
  name: string,
  profile: TokenProfile,
  output: OutputFormat,
): Promise<string> {
  const platform = getPlatform(profile.platform);
  const raw = await platform.queryUsage(profile);
  return withProfileHeader(name, profile.platform, platform.formatUsage(raw, output));
}

export async function runTokenUsage(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      platform: { type: "string" },
      name: { type: "string" },
      output: { type: "string" },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    fail(usageHelp);
  }

  if (values.platform !== undefined) {
    fail("token usage 已取消 --platform；请按 profile 查询，可用 --name 指定");
  }

  const outputRaw = values.output?.trim() || "table";
  if (!isOutputFormat(outputRaw)) {
    fail(`未知 --output: ${outputRaw}（支持 table、text、raw）`);
  }

  const nameFlag = values.name?.trim();
  const { profiles } = loadProfiles();

  let targets: string[];
  if (nameFlag !== undefined && nameFlag !== "") {
    getProfile(nameFlag);
    targets = [nameFlag];
  } else if (Object.keys(profiles).length === 0) {
    process.stdout.write("暂无 profile\n");
    return 0;
  } else {
    targets = Object.keys(profiles).sort((a, b) => a.localeCompare(b));
  }

  const chunks: string[] = [];
  const errorLines: string[] = [];
  let failures = 0;

  for (const name of targets) {
    const profile = profiles[name];
    if (profile === undefined) {
      process.stderr.write(`${name}: profile 不存在\n`);
      failures += 1;
      continue;
    }
    try {
      chunks.push(await queryProfile(name, profile, outputRaw));
    } catch (error) {
      if (!(error instanceof TokenConfigError)) {
        throw error;
      }
      errorLines.push(`${name}: ${error.message}`);
      failures += 1;
    }
  }

  if (chunks.length > 0) {
    process.stdout.write(chunks.join("\n"));
  }
  if (errorLines.length > 0) {
    process.stderr.write(`${errorLines.join("\n\n")}\n`);
  }
  return failures > 0 && chunks.length === 0 ? 1 : 0;
}
