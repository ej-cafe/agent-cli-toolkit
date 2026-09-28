import type { TokenProfile } from "../types.js";
import { TokenConfigError, fail } from "../errors.js";
import { isRecord } from "../json-file.js";
import { cell, formatRaw, formatTable } from "./format.js";
import type { OutputFormat, TokenPlatform } from "./platform.js";

/**
 * 腾讯云 TokenHub 套餐余量查询。
 *
 * 凭据只来自环境变量（TENCENTCLOUD_SECRET_ID / TENCENTCLOUD_SECRET_KEY），
 * region 用 TENCENTCLOUD_REGION 覆盖、默认 ap-guangzhou；不读 profile 的
 * token，也不读写任何配置文件中的腾讯云密钥。
 */

const TOKENHUB_CONSOLE_URL = "https://console.cloud.tencent.com/tokenhub";

const TEN_TABLE_HEADERS = [
  "套餐",
  "类型",
  "状态",
  "总额度",
  "已用",
  "当期额度",
  "到期时间",
] as const;

function requiredEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value.trim() : undefined;
}

const TEN_PRODUCT_TYPES = new Set(["enterprise", "enterprise-auto"]);

/** 个人版/未声明企业版套餐的 profile 直接拒绝（不发请求）。 */
function checkTencentProductType(profile: TokenProfile): void {
  if (
    profile.productType === undefined ||
    !TEN_PRODUCT_TYPES.has(profile.productType)
  ) {
    fail("腾讯云个人版暂不支持查询");
  }
}

/** 凭据缺失即失败（不构造 client、不发请求）。 */
function checkTencentEnv(): void {
  const missing: string[] = [];
  if (requiredEnv("TENCENTCLOUD_SECRET_ID") === undefined) {
    missing.push("TENCENTCLOUD_SECRET_ID");
  }
  if (requiredEnv("TENCENTCLOUD_SECRET_KEY") === undefined) {
    missing.push("TENCENTCLOUD_SECRET_KEY");
  }
  if (missing.length > 0) {
    fail(
      `腾讯云 TokenHub 查询需要设置环境变量 ${missing.join("、")}` +
        `（region 可用 TENCENTCLOUD_REGION 覆盖，默认 ap-guangzhou）。` +
        `设置后重试，或前往 ${TOKENHUB_CONSOLE_URL} 查询`,
    );
  }
}

/** 查询执行器：完成一次 DescribeTokenPlanList 并返回响应根对象。 */
export type TokenPlanQuery = () => Promise<Record<string, unknown>>;

/** 测试注入钩子：替换 TokenHub client 构造，便于断言 region/凭据。 */
export type TokenHubClient = {
  DescribeTokenPlanList(input: Record<string, unknown>): Promise<unknown>;
};
export type TokenHubClientFactory = (options: {
  secretId: string;
  secretKey: string;
  region: string;
}) => TokenHubClient;

let tokenHubClientFactory: TokenHubClientFactory | undefined;

/** SDK 报错不成文地阻止泄漏 SecretKey：只取 code 与 message。 */
function sdkErrorText(error: unknown): string {
  if (isRecord(error)) {
    const code =
      typeof error.code === "string" && error.code !== "" ? error.code : undefined;
    const message =
      typeof error.message === "string" && error.message !== ""
        ? error.message
        : undefined;
    const detail = [code, message].filter((part) => part !== undefined).join(": ");
    if (detail !== "") {
      return detail;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

async function createRealTokenHubClient(options: {
  secretId: string;
  secretKey: string;
  region: string;
}): Promise<TokenHubClient> {
  // 动态导入：仅在查询 tencent 时加载官方 SDK。
  const { tokenhub } = await import("tencentcloud-sdk-nodejs-tokenhub");
  const client = new tokenhub.v20260322.Client({
    credential: {
      secretId: options.secretId,
      secretKey: options.secretKey,
    },
    region: options.region,
  });
  return client as unknown as TokenHubClient;
}

async function defaultTokenPlanQuery(): Promise<Record<string, unknown>> {
  const options = {
    secretId: requiredEnv("TENCENTCLOUD_SECRET_ID") ?? "",
    secretKey: requiredEnv("TENCENTCLOUD_SECRET_KEY") ?? "",
    region: requiredEnv("TENCENTCLOUD_REGION") ?? "ap-guangzhou",
  };
  const client =
    tokenHubClientFactory !== undefined
      ? tokenHubClientFactory(options)
      : await createRealTokenHubClient(options);

  const response = await client.DescribeTokenPlanList({});
  if (!isRecord(response)) {
    fail("腾讯云 TokenHub DescribeTokenPlanList 响应根节点必须是对象");
  }
  return response;
}

let tokenPlanQuery: TokenPlanQuery = defaultTokenPlanQuery;
let tokenPlanPromise: Promise<Record<string, unknown>> | undefined;

/** 测试注入钩子：替换查询执行器；传 undefined 恢复默认（并清空单飞缓存）。 */
export function setTokenPlanQuery(fn: TokenPlanQuery | undefined): void {
  tokenPlanPromise = undefined;
  tokenPlanQuery = fn ?? defaultTokenPlanQuery;
}

/** 测试注入钩子：替换 client 构造；传 undefined 恢复真实 SDK（并清空单飞缓存）。 */
export function setTokenHubClientFactory(
  fn: TokenHubClientFactory | undefined,
): void {
  tokenPlanPromise = undefined;
  tokenHubClientFactory = fn;
}

/** 同一轮命令中多个 tencent profile 共享一次查询；任何执行器抛错统一收敛为 TokenConfigError。 */
async function queryTencentUsage(): Promise<Record<string, unknown>> {
  try {
    tokenPlanPromise ??= tokenPlanQuery();
    return await tokenPlanPromise;
  } catch (error) {
    if (error instanceof TokenConfigError) {
      throw error;
    }
    fail(`腾讯云 TokenHub 查询失败: ${sdkErrorText(error)}`);
  }
}

function toText(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return undefined;
}

/** 单位随套餐类型：enterprise = 积分，enterprise-auto = token；未知一律 `-`。 */
function planTypeLabel(productType: unknown): string {
  if (productType === "enterprise") {
    return "专业套餐（积分）";
  }
  if (productType === "enterprise-auto") {
    return "轻享套餐（token）";
  }
  return "-";
}

function planRows(data: Record<string, unknown>): string[][] {
  const set = data.TokenPlanSet;
  if (!Array.isArray(set)) {
    return [];
  }
  return set.filter(isRecord).map((plan) => {
    const packageInfo = isRecord(plan.PackageInfo) ? plan.PackageInfo : undefined;
    return [
      cell(toText(plan.Name) ?? toText(plan.TeamId)),
      planTypeLabel(plan.ProductType),
      cell(toText(plan.Status)),
      cell(packageInfo ? toText(packageInfo.TotalQuota) : undefined),
      cell(packageInfo ? toText(packageInfo.TotalUsed) : undefined),
      cell(packageInfo ? toText(packageInfo.CycleQuota) : undefined),
      cell(packageInfo ? toText(packageInfo.ExpireTime) : undefined),
    ];
  });
}

function tabulateTencentUsage(rows: string[][]): string {
  if (rows.length === 0) {
    return "未找到 TokenPlan 套餐\n";
  }
  return formatTable([...TEN_TABLE_HEADERS], rows);
}

function summarizeTencentUsage(data: Record<string, unknown>): string {
  const set = data.TokenPlanSet;
  const plans = Array.isArray(set) ? set.filter(isRecord) : [];
  const lines: string[] = ["腾讯云 TokenHub 套餐余量"];
  if (plans.length === 0) {
    lines.push("未找到 TokenPlan 套餐");
    return `${lines.join("\n")}\n`;
  }
  for (const plan of plans) {
    const packageInfo = isRecord(plan.PackageInfo) ? plan.PackageInfo : undefined;
    const name = cell(toText(plan.Name) ?? toText(plan.TeamId));
    const type = planTypeLabel(plan.ProductType);
    const status = cell(toText(plan.Status));
    const totalQuota = cell(packageInfo ? toText(packageInfo.TotalQuota) : undefined);
    const totalUsed = cell(packageInfo ? toText(packageInfo.TotalUsed) : undefined);
    const cycleQuota = cell(packageInfo ? toText(packageInfo.CycleQuota) : undefined);
    const expireTime = cell(packageInfo ? toText(packageInfo.ExpireTime) : undefined);
    lines.push(`${name}（${type}）`);
    lines.push(`状态: ${status}`);
    lines.push(`总额度: ${totalQuota}`);
    lines.push(`已用: ${totalUsed}`);
    lines.push(`当期额度: ${cycleQuota}`);
    lines.push(`到期时间: ${expireTime}`);
  }
  return `${lines.join("\n")}\n`;
}

function formatTencentUsage(
  raw: Record<string, unknown>,
  output: OutputFormat,
): string {
  if (output === "raw") {
    return formatRaw(raw);
  }
  const rows = planRows(raw);
  return output === "table"
    ? tabulateTencentUsage(rows)
    : summarizeTencentUsage(raw);
}

export const tencentPlatform: TokenPlatform = {
  id: "tencent",
  aliases: ["2", "tencent"],
  requiresBaseUrl: true,
  queryUsage: async (profile: TokenProfile) => {
    checkTencentProductType(profile);
    checkTencentEnv();
    return queryTencentUsage();
  },
  formatUsage: formatTencentUsage,
};