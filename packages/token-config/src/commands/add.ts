import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { fail } from "../errors.js";
import {
  getPlatformOrAlias,
  listPlatforms,
} from "../platforms/registry.js";
import type { TokenPlatform } from "../platforms/platform.js";
import { addProfile } from "../store.js";

function nonempty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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
      "product-type": { type: "string" },
    },
    allowPositionals: false,
  });

  let name = nonempty(values.name);
  let platform: TokenPlatform | undefined;
  const platformFlag = nonempty(values.platform);
  if (platformFlag !== undefined) {
    platform = getPlatformOrAlias(platformFlag);
  }
  let token = nonempty(values.token);
  let baseUrl = nonempty(values["base-url"]);
  const claudeFlagProvided = values["claude-base-url"] !== undefined;
  let claudeBaseUrl = nonempty(values["claude-base-url"]);
  let productType = nonempty(values["product-type"]);

  const needsBaseUrl = platform?.presets === undefined;
  const missingRequired =
    name === undefined ||
    platform === undefined ||
    token === undefined ||
    (needsBaseUrl && baseUrl === undefined);

  if (missingRequired) {
    if (process.stdin.isTTY !== true) {
      requireFlag(name, "--name");
      requireFlag(platformFlag, "--platform");
      requireFlag(token, "--token");
      if (platform?.presets === undefined) {
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
          process.stdout.write(
            `选择平台（编号或 id）:\n${
              listPlatforms()
                .map((item, index) => `  ${index + 1}) ${item.id}`)
                .join("\n")
            }\n`,
          );
          platform = getPlatformOrAlias(
            requireFlag(nonempty(await rl.question("> ")), "--platform"),
          );
        }

        if (productType === undefined && platform.id === "tencent") {
          productType =
            nonempty(
              await rl.question(
                "套餐类型（默认 personal 个人版；enterprise / enterprise-auto 企业版）: ",
              ),
            ) ?? "personal";
        }

        if (token === undefined) {
          token = requireFlag(nonempty(await rl.question("token: ")), "--token");
        }

        if (baseUrl === undefined) {
          if (platform.presets !== undefined) {
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
          if (platform.presets !== undefined) {
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

  const resolvedPlatform: TokenPlatform =
    platform ?? fail("缺少必填标志: --platform");
  const resolvedToken = requireFlag(token, "--token");
  const resolvedName = requireFlag(name, "--name");

  const resolvedProductType = (() => {
    if (resolvedPlatform.id !== "tencent") {
      if (productType !== undefined) {
        fail("仅 tencent 平台支持 --product-type");
      }
      return undefined;
    }
    const value = productType ?? "personal";
    if (
      value !== "personal" &&
      value !== "enterprise" &&
      value !== "enterprise-auto"
    ) {
      fail(
        `无效的套餐类型: ${value}（tencent 可取 personal、enterprise、enterprise-auto，默认 personal）`,
      );
    }
    return value;
  })();

  const presets = resolvedPlatform.presets;
  let resolvedBaseUrl: string;
  let resolvedClaudeBaseUrl: string | undefined;
  if (presets !== undefined) {
    resolvedBaseUrl = baseUrl ?? presets.baseUrl;
    resolvedClaudeBaseUrl = claudeBaseUrl ?? presets.claudeBaseUrl;
  } else {
    resolvedBaseUrl = requireFlag(baseUrl, "--base-url");
    resolvedClaudeBaseUrl = claudeBaseUrl;
  }

  await addProfile({
    name: resolvedName,
    platform: resolvedPlatform.id,
    token: resolvedToken,
    baseUrl: resolvedBaseUrl,
    ...(resolvedClaudeBaseUrl
      ? { claudeBaseUrl: resolvedClaudeBaseUrl }
      : {}),
    ...(resolvedProductType !== undefined
      ? { productType: resolvedProductType }
      : {}),
  });

  process.stdout.write(`已添加 profile: ${name}\n`);
  return 0;
}
