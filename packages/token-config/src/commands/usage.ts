import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { parseArgs } from "node:util";
import { fail } from "../errors.js";
import { isRecord } from "../json-file.js";

const execFileAsync = promisify(execFile);

type UsagePlatform = "aliyun" | "tencent";

function isUsagePlatform(value: string): value is UsagePlatform {
  return value === "aliyun" || value === "tencent";
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

function summarizeUsage(data: Record<string, unknown>): string {
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

export async function runTokenUsage(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      platform: { type: "string" },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    fail("用法: agent-cli token usage [--platform aliyun]");
  }

  const platformRaw = values.platform?.trim() || "aliyun";
  if (!isUsagePlatform(platformRaw)) {
    fail(`未知平台: ${platformRaw}（当前仅支持 aliyun）`);
  }
  if (platformRaw === "tencent") {
    fail("暂不支持腾讯云套餐余量查询（当前仅支持阿里云百炼）");
  }

  const data = await runBlTokenPlanUsage();
  process.stdout.write(summarizeUsage(data));
  return 0;
}
