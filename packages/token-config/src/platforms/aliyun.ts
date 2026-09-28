import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { isRecord } from "../json-file.js";
import { fail } from "../errors.js";
import type { TokenProfile } from "../types.js";
import { formatRaw, formatTable } from "./format.js";
import type { OutputFormat, TokenPlatform } from "./platform.js";

const execFileAsync = promisify(execFile);

type BlExecResult = { stdout: string; stderr: string };

/** 测试注入钩子：替换 `bl` 调用；默认真实执行 `bl usage token-plan`。 */
export type BlUsageExec = () => Promise<BlExecResult>;

const defaultBlUsageExec: BlUsageExec = async () => {
  const result = await execFileAsync(
    "bl",
    ["usage", "token-plan", "--output", "json"],
    {
      encoding: "utf8",
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  return { stdout: result.stdout, stderr: result.stderr };
};

let blUsageExec: BlUsageExec = defaultBlUsageExec;

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
    const result = await blUsageExec();
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

/** 同一次运行中多个 aliyun profile 共享一次 bl 调用。 */
let blUsagePromise: Promise<Record<string, unknown>> | undefined;

/** 测试注入钩子：替换 `bl` 执行器；传 undefined 恢复默认并清空单飞缓存。 */
export function setBlUsageExec(fn: BlUsageExec | undefined): void {
  blUsagePromise = undefined;
  blUsageExec = fn ?? defaultBlUsageExec;
}

async function queryAliyunUsage(): Promise<Record<string, unknown>> {
  blUsagePromise ??= runBlTokenPlanUsage();
  return blUsagePromise;
}

function formatAliyunUsage(
  raw: Record<string, unknown>,
  output: OutputFormat,
): string {
  if (output === "raw") {
    return formatRaw(raw);
  }
  return output === "table"
    ? tabulateAliyunUsage(raw)
    : summarizeAliyunUsage(raw);
}

export const aliyunPlatform: TokenPlatform = {
  id: "aliyun",
  aliases: ["1", "aliyun"],
  requiresBaseUrl: true,
  queryUsage: async (_profile: TokenProfile) => queryAliyunUsage(),
  formatUsage: formatAliyunUsage,
};
