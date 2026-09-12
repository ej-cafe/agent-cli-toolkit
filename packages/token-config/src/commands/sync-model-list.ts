import { parseArgs } from "node:util";
import { TokenConfigError, fail } from "../errors.js";
import {
  getProfile,
  isPlatform,
  loadProfiles,
  syncProfileModels,
} from "../store.js";

const usage =
  "用法: agent-cli token sync-model-list [--name <profile>] [--platform <aliyun|tencent>]";

export async function runTokenSyncModelList(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      name: { type: "string" },
      platform: { type: "string" },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    fail(usage);
  }

  const nameFlag = values.name?.trim();
  const platformFlag = values.platform?.trim();
  if (platformFlag !== undefined && platformFlag !== "" && !isPlatform(platformFlag)) {
    fail(`未知平台: ${platformFlag}`);
  }

  let targets: string[];
  if (nameFlag !== undefined && nameFlag !== "") {
    const profile = getProfile(nameFlag);
    if (platformFlag !== undefined && platformFlag !== "" && profile.platform !== platformFlag) {
      fail(
        `profile "${nameFlag}" 的平台是 ${profile.platform}，与 --platform ${platformFlag} 不匹配`,
      );
    }
    targets = [nameFlag];
  } else {
    const profiles = loadProfiles().profiles;
    const names = Object.keys(profiles).sort((a, b) => a.localeCompare(b));
    targets =
      platformFlag !== undefined && platformFlag !== ""
        ? names.filter((name) => profiles[name]?.platform === platformFlag)
        : names;
    if (targets.length === 0) {
      fail(
        platformFlag !== undefined && platformFlag !== ""
          ? `没有 ${platformFlag} profile 可同步`
          : "没有 profile 可同步",
      );
    }
  }

  const failures: string[] = [];
  const succeeded: string[] = [];
  for (const name of targets) {
    try {
      await syncProfileModels(name);
      succeeded.push(name);
    } catch (error) {
      if (error instanceof TokenConfigError) {
        failures.push(`${name}: ${error.message}`);
        continue;
      }
      throw error;
    }
  }

  if (succeeded.length > 0) {
    process.stdout.write(`已同步模型列表: ${succeeded.join(", ")}\n`);
  }
  if (failures.length > 0) {
    process.stderr.write(
      `同步失败:\n${failures.map((line) => `  ${line}`).join("\n")}\n`,
    );
    return 1;
  }
  return 0;
}
