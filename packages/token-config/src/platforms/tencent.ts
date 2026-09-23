import { fail } from "../errors.js";
import type { TokenPlatform } from "./platform.js";

const unsupported =
  "腾讯云 暂不支持 API 形式余额查询，请前往控制台查询。网址：https://console.cloud.tencent.com/tokenhub\n";

export const tencentPlatform: TokenPlatform = {
  id: "tencent",
  aliases: ["2", "tencent"],
  requiresBaseUrl: true,
  queryUsage: async () => fail(unsupported),
  formatUsage: () => fail(unsupported),
};
