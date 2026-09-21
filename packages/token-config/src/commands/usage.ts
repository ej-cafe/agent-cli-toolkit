import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { fail } from "../errors.js";
import { isRecord } from "../json-file.js";
import { getProfile, loadProfiles } from "../store.js";
import type { Platform, TokenProfile } from "../types.js";

const execFileAsync = promisify(execFile);

const usageHelp =
  "用法: agent-cli token usage [--platform aliyun|deepseek|kimi] [--name <profile>]";

type UsagePlatform = "aliyun" | "tencent" | "deepseek" | "kimi";

function isUsagePlatform(value: string): value is UsagePlatform {
  return (
    value === "aliyun" ||
    value === "tencent" ||
    value === "deepseek" ||
    value === "kimi"
  );
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

function formatBalanceNumber(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === "string" && value.trim() !== "") {
    return value.trim();
  }
  return undefined;
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

function resolveBalanceProfile(
  platform: "deepseek" | "kimi",
  nameFlag: string | undefined,
): TokenProfile {
  const label = platform === "deepseek" ? "DeepSeek" : "Kimi";
  if (nameFlag !== undefined && nameFlag !== "") {
    const profile = getProfile(nameFlag);
    if (profile.platform !== platform) {
      fail(
        `profile "${nameFlag}" 的平台是 ${profile.platform}，${label} 余额查询需要 ${platform} profile`,
      );
    }
    return profile;
  }

  const { profiles } = loadProfiles();
  const names = Object.keys(profiles).filter(
    (name) => profiles[name]?.platform === platform,
  );
  if (names.length === 0) {
    fail(
      `没有 ${platform} profile 可查询余额；请先 token add --platform ${platform}，或用 --name 指定`,
    );
  }
  if (names.length > 1) {
    fail(
      `有多套 ${platform} profile（${names.join(", ")}）；请用 --name 指定`,
    );
  }
  const only = profiles[names[0]!];
  if (only === undefined) {
    fail(`没有 ${platform} profile 可查询余额`);
  }
  return only;
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
  return parsed.data;
}

export async function runTokenUsage(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      platform: { type: "string" },
      name: { type: "string" },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    fail(usageHelp);
  }

  const platformRaw = values.platform?.trim() || "aliyun";
  if (!isUsagePlatform(platformRaw)) {
    fail(`未知平台: ${platformRaw}（当前支持 aliyun、deepseek、kimi）`);
  }
  if (platformRaw === "tencent") {
    fail(
      "暂不支持腾讯云套餐余量查询（当前支持阿里云百炼、DeepSeek 与 Kimi）",
    );
  }

  const nameFlag = values.name?.trim();
  const nameProvided = nameFlag !== undefined && nameFlag !== "";

  if (platformRaw === "aliyun") {
    if (nameProvided) {
      fail("阿里云余量查询不支持 --name（不绑定 token profile）");
    }
    const data = await runBlTokenPlanUsage();
    process.stdout.write(summarizeAliyunUsage(data));
    return 0;
  }

  const balancePlatform = platformRaw as Extract<Platform, "deepseek" | "kimi">;
  const profile = resolveBalanceProfile(
    balancePlatform,
    nameProvided ? nameFlag : undefined,
  );

  if (balancePlatform === "deepseek") {
    const data = await runDeepseekBalance(profile);
    process.stdout.write(summarizeDeepseekBalance(data));
    return 0;
  }

  const data = await runKimiBalance(profile);
  process.stdout.write(summarizeKimiBalance(data));
  return 0;
}
