import { accessSync, constants, statSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fail } from "../errors.js";
import type { AgentTool } from "../types.js";
import { claudeSettingsPath } from "./claude-code.js";
import { dshHome } from "./dsh.js";
import { openCodeConfigPath } from "./opencode.js";
import { piAgentDir } from "./pi.js";

export type ToolAbsence = "directory" | "program" | "both";

export type ToolPresence =
  | { ok: true }
  | { ok: false; absence: ToolAbsence };

const programName: Record<AgentTool, string> = {
  "claude-code": "claude",
  opencode: "opencode",
  dsh: "dsh",
  pi: "pi",
};

export function toolLabel(tool: AgentTool): string {
  if (tool === "dsh") {
    return "DeepSeek Harness（dsh）";
  }
  return tool;
}

export function toolDirectory(tool: AgentTool): string {
  switch (tool) {
    case "claude-code":
      return dirname(claudeSettingsPath());
    case "opencode":
      return dirname(openCodeConfigPath());
    case "dsh":
      return dshHome();
    case "pi":
      return piAgentDir();
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function directoryExists(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch (error) {
    if (errorCode(error) === "ENOENT") {
      return false;
    }
    fail(`无法检查配置目录: ${path}`);
  }
}

export function executableOnPath(name: string): boolean {
  const pathEnv = process.env.PATH;
  if (pathEnv === undefined || pathEnv.length === 0) {
    return false;
  }

  for (const dir of pathEnv.split(delimiter)) {
    if (dir.length === 0) {
      continue;
    }
    const candidate = join(dir, name);
    try {
      if (!statSync(candidate).isFile()) {
        continue;
      }
      accessSync(candidate, constants.X_OK);
      return true;
    } catch {
      continue;
    }
  }

  return false;
}

export function inspectTool(tool: AgentTool): ToolPresence {
  const hasDirectory = directoryExists(toolDirectory(tool));
  const hasProgram = executableOnPath(programName[tool]);
  if (hasDirectory && hasProgram) {
    return { ok: true };
  }
  if (!hasDirectory && !hasProgram) {
    return { ok: false, absence: "both" };
  }
  if (!hasDirectory) {
    return { ok: false, absence: "directory" };
  }
  return { ok: false, absence: "program" };
}

export function skipMessage(tool: AgentTool, absence: ToolAbsence): string {
  const label = toolLabel(tool);
  const program = programName[tool];
  if (absence === "directory") {
    return `跳过 ${label}：配置目录不存在`;
  }
  if (absence === "program") {
    return `跳过 ${label}：未找到程序 ${program}`;
  }
  return `跳过 ${label}：配置目录不存在，且未找到程序 ${program}`;
}
