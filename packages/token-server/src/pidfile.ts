import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pidFilePath } from "./paths.js";

export type PidFile = {
  pid: number;
  host: string;
  port: number;
};

function isEnoent(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === "ENOENT"
  );
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}

/** 读取 pid 文件；文件缺失或内容无效时返回 undefined。 */
export function readPidFile(): PidFile | undefined {
  let raw: string;
  try {
    raw = readFileSync(pidFilePath(), "utf8");
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
  const record = parsed as Record<string, unknown>;
  const pid = record.pid;
  const host = record.host;
  const port = record.port;
  if (!Number.isInteger(pid) || typeof host !== "string" || !Number.isInteger(port)) {
    return undefined;
  }
  return { pid: pid as number, host, port: port as number };
}

export function writePidFile(info: PidFile): void {
  const path = pidFilePath();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(info, null, 2)}\n`, "utf8");
}

export function clearPidFile(): void {
  rmSync(pidFilePath(), { force: true });
}

/** 进程是否存在；`EPERM` 表示存在但无权限操作，同样视为存活。 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isErrno(error, "EPERM");
  }
}
