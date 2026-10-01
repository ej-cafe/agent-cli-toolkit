import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  applyClaudeCode,
  applyDsh,
  applyOpenCode,
  applyPi,
  getProfile,
  inspectTool,
  skipMessage,
  toolLabel,
  type AgentTool,
  type TokenProfile,
  type ToolAbsence,
} from "@agent-cli-toolkit/token-config";
import { fail } from "./errors.js";
import { readApiKey } from "./key.js";
import { serverHost } from "./lifecycle.js";
import { readPidFile } from "./pidfile.js";
import { readActiveProfile } from "./state.js";

const supportedTools: AgentTool[] = ["claude-code", "opencode", "dsh", "pi"];
const defaultPort = 8787;

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
  process.stdout.write(`选择要写入配置的工具（编号或 id，逗号/空格分隔）:
  1) claude-code
  2) opencode
  3) DeepSeek Harness（dsh）
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

function resolveModel(
  profileName: string,
  modelFlag: string | undefined,
  tools: AgentTool[],
  profile: TokenProfile,
): string | undefined {
  const modelId = modelFlag?.trim();
  if (!modelId) {
    return undefined;
  }

  if (!profile.models.some((item) => item.id === modelId)) {
    fail(`未知模型: ${modelId}`);
  }
  if (
    !tools.includes("claude-code") &&
    !tools.includes("dsh") &&
    !tools.includes("pi")
  ) {
    fail("--model 仅对 Claude Code、DeepSeek Harness（dsh）与 pi 有效");
  }
  return modelId;
}

/** 以服务器地址 + 生成的 key 合成的 profile，复用 token-config 的写入逻辑。 */
function localProfile(
  profile: TokenProfile,
  key: string,
  port: number,
): TokenProfile {
  return {
    ...profile,
    token: key,
    baseUrl: `http://${serverHost}:${port}/v1`,
    claudeBaseUrl: `http://${serverHost}:${port}/anthropic`,
  };
}

function applyTools(
  name: string,
  profile: TokenProfile,
  tools: AgentTool[],
  modelId?: string,
): void {
  const piModelId = tools.includes("pi")
    ? (modelId ?? firstModelId(name, profile))
    : undefined;

  // 仅 Claude Code 走 anthropic 兼容端点（claudeBaseUrl）；opencode / dsh / pi 一律走 baseUrl。
  const openaiProfile: TokenProfile = { ...profile };
  delete openaiProfile.claudeBaseUrl;

  for (const tool of tools) {
    if (tool === "claude-code") {
      applyClaudeCode(profile, modelId);
    } else if (tool === "opencode") {
      applyOpenCode(name, openaiProfile, "@ai-sdk/openai");
    } else if (tool === "dsh") {
      applyDsh(name, openaiProfile, modelId);
    } else if (piModelId !== undefined) {
      applyPi(name, openaiProfile, piModelId);
    }
  }
}

export async function runTokenServerUse(args: string[]): Promise<number> {
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
    "用法: agent-cli token-server use [--all | --tool <id>] [--model <id>]";
  if (positionals.length > 0) {
    fail(usage);
  }

  // use 不设定 profile：基于 switch 已确定的激活 profile（名字与模型列表）。
  const name = readActiveProfile();
  if (name === undefined) {
    fail("没有可用的激活 profile；请先执行: agent-cli token-server switch <profile>");
  }
  const profile = getProfile(name);
  const apiKey = readApiKey();
  if (apiKey === undefined) {
    fail("尚未生成 token-server API key；请先执行: agent-cli token-server gen-api-key");
  }

  const port = readPidFile()?.port ?? defaultPort;
  const local = localProfile(profile, apiKey, port);

  const tools = await resolveTools(values.all === true, values.tool);

  const ready: AgentTool[] = [];
  const skipped: Array<{ tool: AgentTool; absence: ToolAbsence }> = [];
  for (const tool of tools) {
    const presence = inspectTool(tool);
    if (presence.ok) {
      ready.push(tool);
    } else {
      skipped.push({ tool, absence: presence.absence });
    }
  }

  const modelId = resolveModel(name, values.model, ready, profile);
  applyTools(name, local, ready, modelId);

  for (const item of skipped) {
    process.stderr.write(`${skipMessage(item.tool, item.absence)}\n`);
  }
  if (ready.length > 0) {
    process.stdout.write(
      `已写入配置（profile ${name}）: ${ready.map(toolLabel).join(", ")}\n`,
    );
  }
  process.stdout.write(`token-server 地址: http://${serverHost}:${port}\n`);
  return 0;
}