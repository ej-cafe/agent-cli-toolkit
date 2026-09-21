import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fail } from "../errors.js";
import { addProfile } from "../store.js";
import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_CLAUDE_BASE_URL,
  KIMI_DEFAULT_BASE_URL,
  KIMI_DEFAULT_CLAUDE_BASE_URL,
  type Platform,
} from "../types.js";

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function parsePlatform(value: string): Platform {
  if (value === "1" || value === "aliyun") {
    return "aliyun";
  }
  if (value === "2" || value === "tencent") {
    return "tencent";
  }
  if (value === "3" || value === "deepseek") {
    return "deepseek";
  }
  if (value === "4" || value === "kimi") {
    return "kimi";
  }
  fail(`未知平台: ${value}`);
}

function requireFlag(value: string | undefined, flag: string): string {
  if (!value) {
    fail(`缺少必填标志: ${flag}`);
  }
  return value;
}

function usesUrlPresets(platform: Platform | undefined): boolean {
  return platform === "deepseek" || platform === "kimi";
}

export async function runTokenAdd(args: string[]): Promise<number> {
  const { values } = parseArgs({
    args,
    options: {
      name: { type: "string" },
      platform: { type: "string" },
      token: { type: "string" },
      "base-url": { type: "string" },
      "claude-base-url": { type: "string" },
    },
    allowPositionals: false,
  });

  let name = nonempty(values.name);
  let platform: Platform | undefined;
  const platformFlag = nonempty(values.platform);
  if (platformFlag !== undefined) {
    platform = parsePlatform(platformFlag);
  }
  let token = nonempty(values.token);
  let baseUrl = nonempty(values["base-url"]);
  const claudeFlagProvided = values["claude-base-url"] !== undefined;
  let claudeBaseUrl = nonempty(values["claude-base-url"]);

  const needsBaseUrl = !usesUrlPresets(platform);
  const missingRequired =
    name === undefined ||
    platform === undefined ||
    token === undefined ||
    (needsBaseUrl && baseUrl === undefined);

  if (missingRequired) {
    if (process.stdin.isTTY !== true) {
      requireFlag(name, "--name");
      requireFlag(platform, "--platform");
      requireFlag(token, "--token");
      if (!usesUrlPresets(platform)) {
        requireFlag(baseUrl, "--base-url");
      }
    } else {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      try {
        if (name === undefined) {
          name = requireFlag(nonempty(await rl.question("名称: ")), "--name");
        }

        if (platform === undefined) {
          process.stdout.write(`选择平台（编号或 id）:
  1) aliyun
  2) tencent
  3) deepseek
  4) kimi
`);
          platform = parsePlatform(
            requireFlag(nonempty(await rl.question("> ")), "--platform"),
          );
        }

        if (token === undefined) {
          token = requireFlag(nonempty(await rl.question("token: ")), "--token");
        }

        if (baseUrl === undefined) {
          if (usesUrlPresets(platform)) {
            baseUrl = nonempty(
              await rl.question("base-url（可选，回车用预设）: "),
            );
          } else {
            baseUrl = requireFlag(
              nonempty(await rl.question("base-url: ")),
              "--base-url",
            );
          }
        }

        if (!claudeFlagProvided) {
          if (usesUrlPresets(platform)) {
            claudeBaseUrl = nonempty(
              await rl.question("claude-base-url（可选，回车用预设）: "),
            );
          } else {
            claudeBaseUrl = nonempty(
              await rl.question("claude-base-url（可选）: "),
            );
          }
        }
      } finally {
        rl.close();
      }
    }
  }

  const resolvedPlatform = parsePlatform(
    requireFlag(platform, "--platform"),
  );
  const resolvedToken = requireFlag(token, "--token");
  const resolvedName = requireFlag(name, "--name");

  let resolvedBaseUrl: string;
  let resolvedClaudeBaseUrl: string | undefined;
  if (resolvedPlatform === "deepseek") {
    resolvedBaseUrl = baseUrl ?? DEEPSEEK_DEFAULT_BASE_URL;
    resolvedClaudeBaseUrl =
      claudeBaseUrl ?? DEEPSEEK_DEFAULT_CLAUDE_BASE_URL;
  } else if (resolvedPlatform === "kimi") {
    resolvedBaseUrl = baseUrl ?? KIMI_DEFAULT_BASE_URL;
    resolvedClaudeBaseUrl = claudeBaseUrl ?? KIMI_DEFAULT_CLAUDE_BASE_URL;
  } else {
    resolvedBaseUrl = requireFlag(baseUrl, "--base-url");
    resolvedClaudeBaseUrl = claudeBaseUrl;
  }

  await addProfile({
    name: resolvedName,
    platform: resolvedPlatform,
    token: resolvedToken,
    baseUrl: resolvedBaseUrl,
    ...(resolvedClaudeBaseUrl
      ? { claudeBaseUrl: resolvedClaudeBaseUrl }
      : {}),
  });

  process.stdout.write(`已添加 profile: ${name}\n`);
  return 0;
}
