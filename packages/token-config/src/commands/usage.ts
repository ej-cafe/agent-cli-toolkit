import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { TokenConfigError, fail } from "../errors.js";
import { isRecord } from "../json-file.js";
import { getProfile, loadProfiles } from "../store.js";
import type { TokenProfile } from "../types.js";

const execFileAsync = promisify(execFile);

const usageHelp =
  "用法: agent-cli token usage [--name <profile>] [--output table|text|raw]";

type OutputFormat = "table" | "text" | "raw";

function isOutputFormat(value: string): value is OutputFormat {
  return value === "table" || value === "text" || value === "raw";
}

function displayWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    width += code > 0x7f ? 2 : 1;
  }
  return width;
}

function padCell(text: string, width: number): string {
  const pad = Math.max(0, width - displayWidth(text));
  return `${text}${" ".repeat(pad)}`;
}

function formatTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) => {
    let max = displayWidth(header);
    for (const row of rows) {
      max = Math.max(max, displayWidth(row[index] ?? "-"));
    }
    return max;
  });
  const lines = [
    headers.map((header, index) => padCell(header, widths[index]!)).join("  "),
    ...rows.map((row) =>
      headers
        .map((_, index) => padCell(row[index] ?? "-", widths[index]!))
        .join("  "),
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function cell(value: string | undefined): string {
  return value !== undefined && value !== "" ? value : "-";
}

function formatPercent(fraction: number): string {
  const percent = Math.round(fraction * 1000) / 10;
  return `${Number.isInteger(percent) ? percent : percent.toFixed(1)}%`;
}

function formatResetTime(epochMs: number): string {
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) {
    return String(epochMs);
  }
  return date.toLocaleString();
}

function formatWindow(
  label: string,
  percentage: unknown,
  resetTime: unknown,
): string | undefined {
  if (typeof percentage !== "number" || !Number.isFinite(percentage)) {
    return undefined;
  }
  const parts = [`${label}: 已用 ${formatPercent(percentage)}`];
  if (typeof resetTime === "number" && Number.isFinite(resetTime)) {
    parts.push(`重置时间 ${formatResetTime(resetTime)}`);
  }
  return parts.join(" · ");
}

function aliyunWindowRows(
  data: Record<string, unknown>,
): Array<{ label: string; used: string; reset: string }> {
  const rows: Array<{ label: string; used: string; reset: string }> = [];
  const push = (
    label: string,
    percentage: unknown,
    resetTime: unknown,
  ): void => {
    if (typeof percentage !== "number" || !Number.isFinite(percentage)) {
      return;
    }
    rows.push({
      label,
      used: formatPercent(percentage),
      reset:
        typeof resetTime === "number" && Number.isFinite(resetTime)
          ? formatResetTime(resetTime)
          : "-",
    });
  };
  push("5 小时窗口", data.per5HourPercentage, data.per5HourResetTime);
  push("7 天窗口", data.per1WeekPercentage, data.per1WeekResetTime);
  return rows;
}

function summarizeAliyunUsage(data: Record<string, unknown>): string {
  const lines: string[] = ["阿里云百炼 Token Plan 余量"];
  const fiveHour = formatWindow(
    "5 小时窗口",
    data.per5HourPercentage,
    data.per5HourResetTime,
  );
  const week = formatWindow(
    "7 天窗口",
    data.per1WeekPercentage,
    data.per1WeekResetTime,
  );
  if (fiveHour) {
    lines.push(fiveHour);
  }
  if (week) {
    lines.push(week);
  }
  if (lines.length === 1) {
    lines.push(JSON.stringify(data, null, 2));
  }
  return `${lines.join("\n")}\n`;
}

function tabulateAliyunUsage(data: Record<string, unknown>): string {
  const rows = aliyunWindowRows(data);
  if (rows.length === 0) {
    return formatTable(
      ["窗口", "已用", "重置时间"],
      [["-", "-", "-"]],
    );
  }
  return formatTable(
    ["窗口", "已用", "重置时间"],
    rows.map((row) => [row.label, row.used, row.reset]),
  );
}

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

function formatRaw(data: Record<string, unknown>): string {
  return `${JSON.stringify(data, null, 2)}\n`;
}

function formatBody(
  platform: "aliyun" | "deepseek" | "kimi",
  raw: Record<string, unknown>,
  output: OutputFormat,
): string {
  if (output === "raw") {
    return formatRaw(raw);
  }
  if (platform === "aliyun") {
    return output === "table"
      ? tabulateAliyunUsage(raw)
      : summarizeAliyunUsage(raw);
  }
  if (platform === "deepseek") {
    return output === "table"
      ? tabulateDeepseekBalance(raw)
      : summarizeDeepseekBalance(raw);
  }
  const data = kimiDataFromRoot(raw);
  return output === "table"
    ? tabulateKimiBalance(data)
    : summarizeKimiBalance(data);
}

function failFromBlError(payload: unknown, fallback: string): never {
  if (isRecord(payload) && isRecord(payload.error)) {
    const hint = payload.error.hint;
    const message = payload.error.message;
    if (typeof hint === "string" && hint.trim() !== "") {
      fail(hint.trim());
    }
    if (typeof message === "string" && message.trim() !== "") {
      const lower = message.toLowerCase();
      if (
        lower.includes("console") ||
        lower.includes("access token") ||
        message.includes("控制台")
      ) {
        fail(`${message.trim()}。请先执行: bl auth login --console`);
      }
      fail(message.trim());
    }
  }
  fail(fallback);
}

async function runBlTokenPlanUsage(): Promise<Record<string, unknown>> {
  let stdout: string;
  let stderr: string;
  try {
    const result = await execFileAsync(
      "bl",
      ["usage", "token-plan", "--output", "json"],
      {
        encoding: "utf8",
        maxBuffer: 2 * 1024 * 1024,
      },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    if (code === "ENOENT") {
      fail("未找到 bl（bailian-cli）。请先安装并将其加入 PATH");
    }

    const stdoutText =
      typeof error === "object" &&
      error !== null &&
      "stdout" in error &&
      typeof (error as { stdout: unknown }).stdout === "string"
        ? (error as { stdout: string }).stdout
        : "";
    const stderrText =
      typeof error === "object" &&
      error !== null &&
      "stderr" in error &&
      typeof (error as { stderr: unknown }).stderr === "string"
        ? (error as { stderr: string }).stderr
        : "";

    const combined = `${stdoutText}\n${stderrText}`.trim();
    if (combined.length > 0) {
      try {
        failFromBlError(JSON.parse(stdoutText || combined) as unknown, combined);
      } catch {
        if (
          combined.includes("bl auth login --console") ||
          combined.toLowerCase().includes("no console access token")
        ) {
          fail("请先执行: bl auth login --console");
        }
        fail(`bl usage token-plan 失败: ${combined}`);
      }
    }
    fail("bl usage token-plan 失败");
  }

  const raw = stdout.trim() || stderr.trim();
  if (!raw) {
    fail("bl usage token-plan 未返回内容");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    fail(`无法解析 bl 输出为 JSON: ${raw.slice(0, 200)}`);
  }

  if (isRecord(parsed) && parsed.error !== undefined) {
    failFromBlError(parsed, "bl usage token-plan 返回错误");
  }

  if (!isRecord(parsed)) {
    fail("bl usage token-plan 返回的根节点必须是对象");
  }

  return parsed;
}

function joinBalancePath(baseUrl: string, suffix: string): string | undefined {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (trimmed === "") {
    return undefined;
  }
  try {
    new URL(trimmed);
  } catch {
    return undefined;
  }
  return `${trimmed}${suffix}`;
}

type BalanceFetch = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

async function defaultBalanceFetch(
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    signal: AbortSignal;
  },
): Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }> {
  const response = await fetch(input, init);
  return {
    ok: response.ok,
    status: response.status,
    json: () => response.json() as Promise<unknown>,
  };
}

let balanceFetch: BalanceFetch = defaultBalanceFetch;

/** Test hook for balance HTTP (DeepSeek / Kimi). */
export function setDeepseekBalanceFetch(
  fn: BalanceFetch | undefined,
): void {
  balanceFetch = fn ?? defaultBalanceFetch;
}

export function setKimiBalanceFetch(fn: BalanceFetch | undefined): void {
  balanceFetch = fn ?? defaultBalanceFetch;
}

async function fetchBalanceJson(
  url: string,
  token: string,
  label: string,
): Promise<Record<string, unknown>> {
  let response: { ok: boolean; status: number; json: () => Promise<unknown> };
  try {
    response = await balanceFetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    fail(`GET ${url} 失败`);
  }

  if (!response.ok) {
    fail(`GET ${url} 失败: HTTP ${response.status}`);
  }

  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    fail(`无法解析 ${label} 余额响应为 JSON`);
  }

  if (!isRecord(parsed)) {
    fail(`${label} 余额响应根节点必须是对象`);
  }

  return parsed;
}

async function runDeepseekBalance(
  profile: TokenProfile,
): Promise<Record<string, unknown>> {
  const url = joinBalancePath(profile.baseUrl, "/user/balance");
  if (url === undefined) {
    fail("DeepSeek profile 的 baseUrl 无效");
  }
  return fetchBalanceJson(url, profile.token, "DeepSeek");
}

async function runKimiBalance(
  profile: TokenProfile,
): Promise<Record<string, unknown>> {
  const url = joinBalancePath(profile.baseUrl, "/users/me/balance");
  if (url === undefined) {
    fail("Kimi profile 的 baseUrl 无效");
  }
  const parsed = await fetchBalanceJson(url, profile.token, "Kimi");

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

function withProfileHeader(
  name: string,
  platform: string,
  body: string,
): string {
  return `${name} (${platform})\n${body}`;
}

async function queryProfile(
  name: string,
  profile: TokenProfile,
  output: OutputFormat,
  aliyun: { promise?: Promise<Record<string, unknown>> },
): Promise<string> {
  if (profile.platform === "deepseek") {
    const data = await runDeepseekBalance(profile);
    return withProfileHeader(
      name,
      profile.platform,
      formatBody("deepseek", data, output),
    );
  }
  if (profile.platform === "kimi") {
    const data = await runKimiBalance(profile);
    return withProfileHeader(
      name,
      profile.platform,
      formatBody("kimi", data, output),
    );
  }
  if (profile.platform === "aliyun") {
    if (aliyun.promise === undefined) {
      aliyun.promise = runBlTokenPlanUsage();
    }
    const data = await aliyun.promise;
    return withProfileHeader(
      name,
      profile.platform,
      formatBody("aliyun", data, output),
    );
  }
  fail("暂不支持腾讯云套餐余量查询\n");
}

export async function runTokenUsage(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      platform: { type: "string" },
      name: { type: "string" },
      output: { type: "string" },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    fail(usageHelp);
  }

  if (values.platform !== undefined) {
    fail("token usage 已取消 --platform；请按 profile 查询，可用 --name 指定");
  }

  const outputRaw = values.output?.trim() || "table";
  if (!isOutputFormat(outputRaw)) {
    fail(`未知 --output: ${outputRaw}（支持 table、text、raw）`);
  }

  const nameFlag = values.name?.trim();
  const { profiles } = loadProfiles();

  let targets: string[];
  if (nameFlag !== undefined && nameFlag !== "") {
    getProfile(nameFlag);
    targets = [nameFlag];
  } else if (Object.keys(profiles).length === 0) {
    process.stdout.write("暂无 profile\n");
    return 0;
  } else {
    targets = Object.keys(profiles).sort((a, b) => a.localeCompare(b));
  }

  const aliyun: { promise?: Promise<Record<string, unknown>> } = {};
  const chunks: string[] = [];
  let failures = 0;

  for (const name of targets) {
    const profile = profiles[name];
    if (profile === undefined) {
      process.stderr.write(`${name}: profile 不存在\n`);
      failures += 1;
      continue;
    }
    try {
      chunks.push(await queryProfile(name, profile, outputRaw, aliyun));
    } catch (error) {
      if (!(error instanceof TokenConfigError)) {
        throw error;
      }
      process.stderr.write(`${name}: ${error.message}\n`);
      failures += 1;
    }
  }

  if (chunks.length > 0) {
    process.stdout.write(chunks.join("\n"));
  }
  return failures > 0 && chunks.length === 0 ? 1 : 0;
}
