import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fail } from "../errors.js";
import { addProfile } from "../store.js";
import type { Platform } from "../types.js";

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
  fail(`未知平台: ${value}`);
}

function requireFlag(value: string | undefined, flag: string): string {
  if (!value) {
    fail(`缺少必填标志: ${flag}`);
  }
  return value;
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

  const missingRequired =
    name === undefined ||
    platform === undefined ||
    token === undefined ||
    baseUrl === undefined;

  if (missingRequired) {
    if (process.stdin.isTTY !== true) {
      requireFlag(name, "--name");
      requireFlag(platform, "--platform");
      requireFlag(token, "--token");
      requireFlag(baseUrl, "--base-url");
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
`);
          platform = parsePlatform(
            requireFlag(nonempty(await rl.question("> ")), "--platform"),
          );
        }

        if (token === undefined) {
          token = requireFlag(nonempty(await rl.question("token: ")), "--token");
        }

        if (baseUrl === undefined) {
          baseUrl = requireFlag(
            nonempty(await rl.question("base-url: ")),
            "--base-url",
          );
        }

        if (!claudeFlagProvided) {
          claudeBaseUrl = nonempty(
            await rl.question("claude-base-url（可选）: "),
          );
        }
      } finally {
        rl.close();
      }
    }
  }

  addProfile({
    name: requireFlag(name, "--name"),
    platform: parsePlatform(requireFlag(platform, "--platform")),
    token: requireFlag(token, "--token"),
    baseUrl: requireFlag(baseUrl, "--base-url"),
    ...(claudeBaseUrl ? { claudeBaseUrl } : {}),
  });

  process.stdout.write(`已添加 profile: ${name}\n`);
  return 0;
}
