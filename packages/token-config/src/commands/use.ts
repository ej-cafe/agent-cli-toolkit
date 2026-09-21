import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { applyClaudeCode } from "../apply/claude-code.js";
import { applyDsh } from "../apply/dsh.js";
import { applyOpenCode } from "../apply/opencode.js";
import { applyPi } from "../apply/pi.js";
import { fail } from "../errors.js";
import { getProfile } from "../store.js";
import type { AgentTool, TokenProfile } from "../types.js";

const supportedTools: AgentTool[] = ["claude-code", "opencode", "dsh", "pi"];

function isAgentTool(value: string): value is AgentTool {
  return (
    value === "claude-code" ||
    value === "opencode" ||
    value === "dsh" ||
    value === "pi"
  );
}

function unique(tools: AgentTool[]): AgentTool[] {
  return [...new Set(tools)];
}

async function promptTools(): Promise<AgentTool[]> {
  process.stdout.write(`选择要同步的工具（编号或 id，逗号/空格分隔）:
  1) claude-code
  2) opencode
  3) dsh
  4) pi
`);

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  let line: string;
  try {
    line = await rl.question("> ");
  } finally {
    rl.close();
  }

  const tokens = line
    .split(/[\s,]+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  if (tokens.length === 0) {
    fail("未选择任何工具");
  }

  const selected: AgentTool[] = [];
  for (const token of tokens) {
    if (token === "1" || token === "claude-code") {
      selected.push("claude-code");
      continue;
    }
    if (token === "2" || token === "opencode") {
      selected.push("opencode");
      continue;
    }
    if (token === "3" || token === "dsh") {
      selected.push("dsh");
      continue;
    }
    if (token === "4" || token === "pi") {
      selected.push("pi");
      continue;
    }
    fail(`未知工具: ${token}`);
  }

  return unique(selected);
}

async function resolveTools(
  all: boolean,
  tools: string[] | undefined,
): Promise<AgentTool[]> {
  if (all) {
    return [...supportedTools];
  }

  if (tools !== undefined && tools.length > 0) {
    const selected: AgentTool[] = [];
    for (const tool of tools) {
      if (!isAgentTool(tool)) {
        fail(`未知工具: ${tool}`);
      }
      selected.push(tool);
    }
    return unique(selected);
  }

  return promptTools();
}

function firstModelId(name: string, profile: TokenProfile): string {
  const id = profile.models[0]?.id.trim() ?? "";
  if (id === "") {
    fail(`profile "${name}" 没有可用模型，无法设置 pi 的 defaultModel`);
  }
  return id;
}

function applyTools(
  name: string,
  tools: AgentTool[],
  modelId?: string,
): void {
  const profile = getProfile(name);
  const piModelId = tools.includes("pi")
    ? (modelId ?? firstModelId(name, profile))
    : undefined;

  for (const tool of tools) {
    if (tool === "claude-code") {
      applyClaudeCode(profile, modelId);
    } else if (tool === "opencode") {
      applyOpenCode(name, profile);
    } else if (tool === "dsh") {
      applyDsh(name, profile, modelId);
    } else if (piModelId !== undefined) {
      applyPi(name, profile, piModelId);
    }
  }
}

function resolveModel(
  profileName: string,
  modelFlag: string | undefined,
  tools: AgentTool[],
): string | undefined {
  const modelId = modelFlag?.trim();
  if (!modelId) {
    return undefined;
  }

  const profile = getProfile(profileName);
  if (!profile.models.some((item) => item.id === modelId)) {
    fail(`未知模型: ${modelId}`);
  }
  if (
    !tools.includes("claude-code") &&
    !tools.includes("dsh") &&
    !tools.includes("pi")
  ) {
    fail("--model 仅对 Claude Code、dsh 与 pi 有效");
  }
  return modelId;
}

export async function runTokenUse(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      all: { type: "boolean", default: false },
      tool: { type: "string", multiple: true },
      model: { type: "string" },
    },
    allowPositionals: true,
  });

  const usage =
    "用法: agent-cli token use <name> [--all | --tool <id>] [--model <id>]";
  const name = positionals[0]?.trim();
  if (!name) {
    fail(usage);
  }

  if (positionals.length > 1) {
    fail(usage);
  }

  const tools = await resolveTools(values.all === true, values.tool);
  const modelId = resolveModel(name, values.model, tools);
  applyTools(name, tools, modelId);
  process.stdout.write(
    `已将 profile ${name} 应用到: ${tools.join(", ")}\n`,
  );
  return 0;
}
