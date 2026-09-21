import type { Platform, TokenProfile } from "../types.js";

export type OutputFormat = "table" | "text" | "raw";

/** 官方 URL 预设（add 时省略 --base-url / --claude-base-url 的回退值）。 */
export type PlatformUrlPresets = {
  baseUrl: string;
  claudeBaseUrl: string;
};

export interface TokenPlatform {
  /** 平台 id，与 TokenProfile.platform 的取值一致。 */
  readonly id: Platform;
  /**
   * add / 交互问答可接受的别名；aliases[0] 为编号别名（"1"~"4"），
   * 与 registry 数组顺序一致（编号 = 数组下标 + 1）。
   */
  readonly aliases: readonly string[];
  /** true = add 时必须显式提供 --base-url；与 presets === undefined 互为充要。 */
  readonly requiresBaseUrl: boolean;
  /** 官方预设；requiresBaseUrl 为 false 时必非 undefined。 */
  readonly presets?: PlatformUrlPresets;
  /** 查询套餐余量或账户余额的原始数据；不支持的平台直接 fail。 */
  queryUsage(profile: TokenProfile): Promise<Record<string, unknown>>;
  /** 将 queryUsage 返回的原始数据渲染为 table / text / raw 三种格式。 */
  formatUsage(raw: Record<string, unknown>, output: OutputFormat): string;
}
