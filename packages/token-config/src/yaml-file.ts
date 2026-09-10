import { randomBytes } from "node:crypto";
import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Document, parseDocument, isMap } from "yaml";
import { fail } from "./errors.js";

export function loadYamlMap(path: string): Document {
  let raw: string | undefined;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    if (code === "ENOENT") {
      return new Document({});
    }
    throw error;
  }

  const doc = parseDocument(raw);
  if (doc.errors.length > 0) {
    fail(`无法解析 YAML 文件: ${path}`);
  }
  if (doc.contents == null) {
    return new Document({});
  }
  if (!isMap(doc.contents)) {
    fail(`YAML 文件根节点必须是映射: ${path}`);
  }
  return doc;
}

export function writeYamlAtomic(
  path: string,
  doc: Document,
  options?: { fileMode?: number; dirMode?: number },
): void {
  const dir = dirname(path);
  mkdirSync(dir, {
    recursive: true,
    ...(options?.dirMode !== undefined ? { mode: options.dirMode } : {}),
  });
  const tmp = `${path}.${randomBytes(8).toString("hex")}.tmp`;
  const text = doc.toString();
  const body = text.endsWith("\n") ? text : `${text}\n`;
  writeFileSync(tmp, body, {
    encoding: "utf8",
    ...(options?.fileMode !== undefined ? { mode: options.fileMode } : {}),
  });
  renameSync(tmp, path);
  if (options?.fileMode !== undefined) {
    chmodSync(path, options.fileMode);
  }
  if (options?.dirMode !== undefined) {
    chmodSync(dir, options.dirMode);
  }
}
