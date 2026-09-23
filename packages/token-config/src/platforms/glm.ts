import { fail } from "../errors.js";
import {
  GLM_DEFAULT_BASE_URL,
  GLM_DEFAULT_CLAUDE_BASE_URL,
} from "../types.js";
import type { TokenPlatform } from "./platform.js";

const unsupported =
  "智谱 GLM 暂不支持 API 形式余额查询，请前往控制台查询。网址：https://bigmodel.cn/coding-plan/personal/usage\n";

export const glmPlatform: TokenPlatform = {
  id: "glm",
  aliases: ["5", "glm"],
  requiresBaseUrl: false,
  presets: {
    baseUrl: GLM_DEFAULT_BASE_URL,
    claudeBaseUrl: GLM_DEFAULT_CLAUDE_BASE_URL,
  },
  queryUsage: async () => fail(unsupported),
  formatUsage: () => fail(unsupported),
};
