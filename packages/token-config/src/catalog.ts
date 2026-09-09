import type { Platform, TokenProfileModel } from "./types.js";

function model(id: string, name = id): TokenProfileModel {
  return { id, name };
}

const aliyunModels: TokenProfileModel[] = [
  model("qwen3.8-max"),
  model("qwen3.8-flash"),
  model("qwen3.7-max"),
  model("qwen3.7-plus"),
  model("qwen3.6-flash"),
  model("deepseek-v4-pro"),
  model("deepseek-v4-pro-0813"),
  model("deepseek-v4-flash-0731"),
  model("glm-5.2"),
];

const tencentModels: TokenProfileModel[] = [
  model("tc-code-latest", "Auto"),
  model("deepseek-v4-flash-202605", "DeepSeek-V4-Flash"),
  model("deepseek-v4-pro-202606", "DeepSeek-V4-Pro"),
  model("minimax-m2.7", "MiniMax-M2.7"),
  model("minimax-m3", "MiniMax-M3"),
  model("glm-5", "GLM-5"),
  model("glm-5.1", "GLM-5.1"),
  model("glm-5.2", "GLM-5.2"),
  model("glm-5.3", "GLM-5.3"),
  model("glm-5.3-flash", "GLM-5.3-Flash"),
  model("hy4-preview", "Hy4 preview"),
  model("kimi-k2.7-code", "Kimi K2.7 Code"),
  model("kimi-k3", "Kimi K3"),
  model("hy3", "Hy3"),
];

const catalogs: Record<Platform, TokenProfileModel[]> = {
  aliyun: aliyunModels,
  tencent: tencentModels,
};

export function modelsForPlatform(platform: Platform): TokenProfileModel[] {
  return catalogs[platform].map((item) => ({ ...item }));
}
