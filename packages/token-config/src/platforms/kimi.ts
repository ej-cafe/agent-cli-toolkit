import { fail } from "../errors.js";
import { fetchJson, joinUrlPath } from "../http.js";
import { isRecord } from "../json-file.js";
import {
  KIMI_DEFAULT_BASE_URL,
  KIMI_DEFAULT_CLAUDE_BASE_URL,
  type TokenProfile,
} from "../types.js";
import { formatRaw, formatTable } from "./format.js";
import type { OutputFormat, TokenPlatform } from "./platform.js";

function formatBalanceNumber(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return undefined;
}

function kimiDataFromRoot(root: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(root.data)) {
    fail("Kimi 余额响应缺少 data 对象");
  }
  return root.data;
}

function summarizeKimiBalance(data: Record<string, unknown>): string {
  const lines: string[] = ["Kimi 账户余额"];
  const available = formatBalanceNumber(data.available_balance);
  const voucher = formatBalanceNumber(data.voucher_balance);
  const cash = formatBalanceNumber(data.cash_balance);
  if (available !== undefined) {
    lines.push(`可用余额: ${available}`);
  }
  if (voucher !== undefined) {
    lines.push(`代金券: ${voucher}`);
  }
  if (cash !== undefined) {
    lines.push(`现金: ${cash}`);
  }
  if (lines.length === 1) {
    fail("Kimi 余额响应无法解析为可用摘要");
  }
  return `${lines.join("\n")}\n`;
}

function tabulateKimiBalance(data: Record<string, unknown>): string {
  const rows: string[][] = [];
  const available = formatBalanceNumber(data.available_balance);
  const voucher = formatBalanceNumber(data.voucher_balance);
  const cash = formatBalanceNumber(data.cash_balance);
  if (available !== undefined) {
    rows.push(["可用余额", available]);
  }
  if (voucher !== undefined) {
    rows.push(["代金券", voucher]);
  }
  if (cash !== undefined) {
    rows.push(["现金", cash]);
  }
  if (rows.length === 0) {
    fail("Kimi 余额响应无法解析为可用摘要");
  }
  return formatTable(["项目", "金额"], rows);
}

async function queryKimiBalance(
  profile: TokenProfile,
): Promise<Record<string, unknown>> {
  const url = joinUrlPath(profile.baseUrl, "/users/me/balance");
  if (url === undefined) {
    fail("Kimi profile 的 baseUrl 无效");
  }

  const result = await fetchJson(url, {
    headers: {
      Authorization: `Bearer ${profile.token}`,
      Accept: "application/json",
    },
  });
  if (!result.ok) {
    if (result.error.kind === "http") {
      fail(`GET ${url} 失败: HTTP ${result.error.status}`);
    }
    if (result.error.kind === "json") {
      fail("无法解析 Kimi 余额响应为 JSON");
    }
    fail(`GET ${url} 失败`);
  }
  const parsed = result.data;

  if (!isRecord(parsed)) {
    fail("Kimi 余额响应根节点必须是对象");
  }
  if (parsed.status === false) {
    fail("Kimi 余额查询失败（status=false）");
  }
  if (parsed.code !== undefined && parsed.code !== 0) {
    fail(`Kimi 余额查询失败（code=${String(parsed.code)}）`);
  }
  if (!isRecord(parsed.data)) {
    fail("Kimi 余额响应缺少 data 对象");
  }
  return parsed;
}

function formatKimiBalance(
  raw: Record<string, unknown>,
  output: OutputFormat,
): string {
  if (output === "raw") {
    return formatRaw(raw);
  }
  const data = kimiDataFromRoot(raw);
  return output === "table"
    ? tabulateKimiBalance(data)
    : summarizeKimiBalance(data);
}

export const kimiPlatform: TokenPlatform = {
  id: "kimi",
  aliases: ["4", "kimi"],
  requiresBaseUrl: false,
  presets: {
    baseUrl: KIMI_DEFAULT_BASE_URL,
    claudeBaseUrl: KIMI_DEFAULT_CLAUDE_BASE_URL,
  },
  queryUsage: queryKimiBalance,
  formatUsage: formatKimiBalance,
};
