import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { fail } from "./errors.js";
import { apiKeyPath } from "./paths.js";

/** 生成一个新的服务器 API key（`tsk_` 前缀 + 32 字节 base64url）。 */
export function generateApiKey(): string {
  return `tsk_${randomBytes(32).toString("base64url")}`;
}

/** 读取已配置的 API key；文件缺失或内容为空视为未配置。 */
export function readApiKey(): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(apiKeyPath(), "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code: unknown }).code === "ENOENT") {
      return undefined;
    }
    fail(`无法读取 API key 配置文件: ${apiKeyPath()}`);
  }
  const key = raw.trim();
  return key === "" ? undefined : key;
}

/** 原子写入 API key（临时文件 + rename，0644 无关紧要，最终 0600）。 */
export function writeApiKey(key: string): void {
  const path = apiKeyPath();
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  try {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    writeFileSync(tmp, `${key}\n`, { encoding: "utf8", mode: 0o600 });
    renameSync(tmp, path);
  } catch (error) {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // 忽略清理失败
    }
    const reason = error instanceof Error ? error.message : String(error);
    fail(`无法写入 API key 配置文件: ${path}（${reason}）`);
  }
  chmodSync(path, 0o600);
}