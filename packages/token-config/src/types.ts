export type Platform = "aliyun" | "tencent";

export type TokenProfileModel = {
  id: string;
  name: string;
};

export type TokenProfile = {
  platform: Platform;
  token: string;
  baseUrl: string;
  claudeBaseUrl?: string;
  models: TokenProfileModel[];
};

export type TokenProfileFile = {
  profiles: Record<string, TokenProfile>;
};

export type AgentTool = "claude-code" | "opencode";
