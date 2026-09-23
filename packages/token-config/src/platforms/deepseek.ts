import { fail } from "../errors.js";
import { fetchJson, joinUrlPath } from "../http.js";
import { isRecord } from "../json-file.js";
import {
  DEEPSEEK_DEFAULT_BASE_URL,
  DEEPSEEK_DEFAULT_CLAUDE_BASE_URL,
  type TokenProfile,
} from "../types.js";
import { cell, formatRaw, formatTable } from "./format.js";
import type { OutputFormat, TokenPlatform } from "./platform.js";

function summarizeDeepseekBalance(data: Record<string, unknown>): string {
  const lines: string[] = ["DeepSeek 账户余额"];
  if (typeof data.is_available === "boolean") {
    lines.push(`可用: ${data.is_available ? "是" : "否"}`);
  }

  const infos = data.balance_infos;
  if (Array.isArray(infos)) {
    for (const item of infos) {
      if (!isRecord(item)) {
        continue;
      }
      const currency =
        typeof item.currency === "string" && item.currency.trim() !== ""
          ? item.currency.trim()
          : "未知币种";
      const parts: string[] = [currency];
      if (typeof item.total_balance === "string") {
        parts.push(`总额 ${item.total_balance}`);
      }
      if (typeof item.granted_balance === "string") {
        parts.push(`赠送 ${item.granted_balance}`);
      }
      if (typeof item.topped_up_balance === "string") {
        parts.push(`充值 ${item.topped_up_balance}`);
      }
      if (parts.length > 1) {
        lines.push(parts.join(" · "));
      }
    }
  }

  if (lines.length === 1) {
    fail("DeepSeek 余额响应无法解析为可用摘要");
  }
  return `${lines.join("\n")}\n`;
}

function tabulateDeepseekBalance(data: Record<string, unknown>): string {
  const lines: string[] = [];
  if (typeof data.is_available === "boolean") {
    lines.push(`可用: ${data.is_available ? "是" : "否"}`);
  }

  const tableRows: string[][] = [];
  const infos = data.balance_infos;
  if (Array.isArray(infos)) {
    for (const item of infos) {
      if (!isRecord(item)) {
        continue;
      }
      const currency =
        typeof item.currency === "string" && item.currency.trim() !== ""
          ? item.currency.trim()
          : "未知币种";
      tableRows.push([
        currency,
        cell(typeof item.total_balance === "string" ? item.total_balance : undefined),
        cell(
          typeof item.granted_balance === "string"
            ? item.granted_balance
            : undefined,
        ),
        cell(
          typeof item.topped_up_balance === "string"
            ? item.topped_up_balance
            : undefined,
        ),
      ]);
    }
  }

  if (tableRows.length === 0 && lines.length === 0) {
    fail("DeepSeek 余额响应无法解析为可用摘要");
  }
  if (tableRows.length === 0) {
    tableRows.push(["-", "-", "-", "-"]);
  }

  lines.push(
    formatTable(["币种", "总额", "赠送", "充值"], tableRows).trimEnd(),
  );
  return `${lines.join("\n")}\n`;
}

async function queryDeepseekBalance(
  profile: TokenProfile,
): Promise<Record<string, unknown>> {
  const url = joinUrlPath(profile.baseUrl, "/user/balance");
  if (url === undefined) {
    fail("DeepSeek profile 的 baseUrl 无效");
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
      fail("无法解析 DeepSeek 余额响应为 JSON");
    }
    fail(`GET ${url} 失败`);
  }

  if (!isRecord(result.data)) {
    fail("DeepSeek 余额响应根节点必须是对象");
  }
  return result.data;
}

function formatDeepseekBalance(
  raw: Record<string, unknown>,
  output: OutputFormat,
): string {
  if (output === "raw") {
    return formatRaw(raw);
  }
  return output === "table"
    ? tabulateDeepseekBalance(raw)
    : summarizeDeepseekBalance(raw);
}

export const deepseekPlatform: TokenPlatform = {
  id: "deepseek",
  aliases: ["3", "deepseek"],
  requiresBaseUrl: false,
  presets: {
    baseUrl: DEEPSEEK_DEFAULT_BASE_URL,
    claudeBaseUrl: DEEPSEEK_DEFAULT_CLAUDE_BASE_URL,
  },
  queryUsage: queryDeepseekBalance,
  formatUsage: formatDeepseekBalance,
};
