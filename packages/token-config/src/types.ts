export type Platform = "aliyun" | "tencent" | "deepseek" | "kimi" | "glm";

/** Official DeepSeek OpenAI-compatible base URL (overridable on add). */
export const DEEPSEEK_DEFAULT_BASE_URL = "https://api.deepseek.com";

/** Official DeepSeek Anthropic-compatible base URL (overridable on add). */
export const DEEPSEEK_DEFAULT_CLAUDE_BASE_URL =
  "https://api.deepseek.com/anthropic";

/** Official Kimi (Moonshot CN) OpenAI-compatible base URL (overridable on add). */
export const KIMI_DEFAULT_BASE_URL = "https://api.moonshot.cn/v1";

/** Official Kimi (Moonshot CN) Anthropic-compatible base URL (overridable on add). */
export const KIMI_DEFAULT_CLAUDE_BASE_URL = "https://api.moonshot.cn/anthropic";

/** Official GLM Coding Plan (CN) OpenAI-compatible base URL (overridable on add). */
export const GLM_DEFAULT_BASE_URL =
  "https://open.bigmodel.cn/api/coding/paas/v4";

/** Official GLM (CN) Anthropic-compatible base URL (overridable on add). */
export const GLM_DEFAULT_CLAUDE_BASE_URL =
  "https://open.bigmodel.cn/api/anthropic";

export type TokenProfileModel = {
  id: string;
  name: string;
};

export type TokenProfile = {
  platform: Platform;
  token: string;
  baseUrl: string;
  claudeBaseUrl?: string;
  /** 套餐类型（tencent：enterprise 企业版专业套餐 / enterprise-auto 企业版轻享套餐）。 */
  productType?: string;
  models: TokenProfileModel[];
};

export type TokenProfileFile = {
  profiles: Record<string, TokenProfile>;
};

export type AgentTool = "claude-code" | "opencode" | "dsh" | "pi";
