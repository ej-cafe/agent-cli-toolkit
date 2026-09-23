import { fail } from "../errors.js";
import type { Platform } from "../types.js";
import { aliyunPlatform } from "./aliyun.js";
import { deepseekPlatform } from "./deepseek.js";
import { glmPlatform } from "./glm.js";
import { kimiPlatform } from "./kimi.js";
import type { TokenPlatform } from "./platform.js";
import { tencentPlatform } from "./tencent.js";

/** 顺序即编号顺序（aliases[0] === String(index + 1)）。 */
const platforms: readonly TokenPlatform[] = [
  aliyunPlatform,
  tencentPlatform,
  deepseekPlatform,
  kimiPlatform,
  glmPlatform,
];

export function listPlatforms(): readonly TokenPlatform[] {
  return platforms;
}

export function isPlatform(value: string): value is Platform {
  return platforms.some((platform) => platform.id === value);
}

/** 按 id 精确查找（profile.platform 已被 store 校验，正常必命中）。 */
export function getPlatform(id: Platform): TokenPlatform {
  const found = platforms.find((platform) => platform.id === id);
  if (found === undefined) {
    fail(`内部错误: 未知平台 ${id}`);
  }
  return found;
}

/** add 的 --platform 取值解析：接受编号别名与 id。 */
export function getPlatformOrAlias(value: string): TokenPlatform {
  const found = platforms.find((platform) => platform.aliases.includes(value));
  if (found === undefined) {
    fail(`未知平台: ${value}`);
  }
  return found;
}
