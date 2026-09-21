import { fail } from "../errors.js";
import type { TokenPlatform } from "./platform.js";

const unsupported = "暂不支持腾讯云套餐余量查询\n";

export const tencentPlatform: TokenPlatform = {
  id: "tencent",
  aliases: ["2", "tencent"],
  requiresBaseUrl: true,
  queryUsage: async () => fail(unsupported),
  formatUsage: () => fail(unsupported),
};
