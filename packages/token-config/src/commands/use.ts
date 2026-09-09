import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { applyClaudeCode } from "../apply/claude-code.js";
import { applyOpenCode } from "../apply/opencode.js";
import { fail } from "../errors.js";
import { getProfile } from "../store.js";
import type { AgentTool } from "../types.js";

const supportedTools: AgentTool[] = ["claude-code", "opencode"];

function isAgentTool(value: string): value is AgentTool {
  return value === "claude-code" || value === "opencode";
}

function unique(tools: AgentTool[]): AgentTool[] {
  return [...new Set(tools)];
}

async function promptTools(): Promise<AgentTool[]> {
  process.stdout.write(`选择要同步的工具（编号或 id，逗号/空格分隔）:
  1) claude-code
  2) opencode
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

function applyTools(name: string, tools: AgentTool[]): void {
  const profile = getProfile(name);
  for (const tool of tools) {
    if (tool === "claude-code") {
      applyClaudeCode(profile);
    } else {
      applyOpenCode(profile);
    }
  }
}

export async function runTokenUse(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      all: { type: "boolean", default: false },
      tool: { type: "string", multiple: true },
    },
    allowPositionals: true,
  });

  const name = positionals[0]?.trim();
  if (!name) {
    fail("用法: agent-cli token use <name> [--all | --tool <id>]");
  }

  if (positionals.length > 1) {
    fail("用法: agent-cli token use <name> [--all | --tool <id>]");
  }

  const tools = await resolveTools(values.all === true, values.tool);
  applyTools(name, tools);
  process.stdout.write(
    `已将 profile ${name} 应用到: ${tools.join(", ")}\n`,
  );
  return 0;
}
