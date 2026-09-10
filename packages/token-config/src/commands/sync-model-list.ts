import { parseArgs } from "node:util";
import { fail } from "../errors.js";
import { isPlatform, syncPlatformModels } from "../store.js";
import type { Platform } from "../types.js";

const usage = "用法: agent-cli token sync-model-list [--platform <aliyun|tencent>]";

export async function runTokenSyncModelList(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      platform: { type: "string" },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    fail(usage);
  }

  const platformFlag = values.platform?.trim();
  const platforms: Platform[] = [];
  if (platformFlag) {
    if (!isPlatform(platformFlag)) {
      fail(`未知平台: ${platformFlag}`);
    }
    platforms.push(platformFlag);
  } else {
    platforms.push("aliyun", "tencent");
  }
  for (const platform of platforms) {
    await syncPlatformModels(platform);
  }

  process.stdout.write(`已同步模型列表: ${platforms.join(", ")}\n`);
  return 0;
}
