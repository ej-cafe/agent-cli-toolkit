import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { stateFilePath } from "./paths.js";

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

/**
 * 读取激活 profile 名称。
 * 文件缺失、内容不可解析、根不是对象或 `activeProfile` 不是非空字符串时都视为未设置。
 */
export function readActiveProfile(): string | undefined {
  let raw: string;
  try {
    raw = readFileSync(stateFilePath(), "utf8");
  } catch (error) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return undefined;
  }

  const value = (parsed as Record<string, unknown>).activeProfile;
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }
  return value;
}

/** 原子写入激活 profile 名称。 */
export function writeActiveProfile(name: string): void {
  const path = stateFilePath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ activeProfile: name }, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}
