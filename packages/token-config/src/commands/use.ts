import { createInterface, type Interface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { applyClaudeCode } from "../apply/claude-code.js";
import { applyDsh } from "../apply/dsh.js";
import { applyOpenCode } from "../apply/opencode.js";
import { applyPi } from "../apply/pi.js";
import {
  inspectTool,
  skipMessage,
  toolLabel,
  type ToolAbsence,
} from "../apply/presence.js";
import { fail } from "../errors.js";
import { getProfile, loadProfiles } from "../store.js";
import type { AgentTool, TokenProfile } from "../types.js";

const supportedTools: AgentTool[] = ["claude-code", "opencode", "dsh", "pi"];

/** 延迟创建、三个问答共用的 readline 会话；无问答时不创建。 */
class Prompter {
  #rl: Interface | undefined;

  async ask(question: string): Promise<string> {
    this.#rl ??= createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return this.#rl.question(question);
  }

  close(): void {
    this.#rl?.close();
    this.#rl = undefined;
  }
}

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

function isModelTool(tool: AgentTool): boolean {
  return tool === "claude-code" || tool === "dsh" || tool === "pi";
}

function selectedIndex(answer: string, length: number): number | undefined {
  if (!/^\d+$/u.test(answer)) {
    return undefined;
  }
  const index = Number(answer);
  return Number.isInteger(index) && index >= 1 && index <= length
    ? index - 1
    : undefined;
}

async function promptProfile(prompter: Prompter): Promise<string> {
  const names = Object.keys(loadProfiles().profiles).sort();
  if (names.length === 0) {
    fail("没有可选择的 profile，请先运行 agent-cli token add");
  }

  process.stdout.write(
    `选择 profile（编号或名称）:\n${
      names.map((name, index) => `  ${index + 1}) ${name}`).join("\n")
    }\n`,
  );

  const answer = (await prompter.ask("> ")).trim();
  if (answer === "") {
    fail("未选择任何 profile");
  }

  const index = selectedIndex(answer, names.length);
  if (index !== undefined) {
    const name = names[index];
    if (name !== undefined) {
      return name;
    }
  }
  if (names.includes(answer)) {
    return answer;
  }
  fail(`未知 profile: ${answer}`);
}

async function resolveName(
  positional: string | undefined,
  prompter: Prompter,
): Promise<string> {
  const name = positional?.trim();
  if (name) {
    return name;
  }
  if (process.stdin.isTTY !== true) {
    fail("缺少 profile 名称；非交互环境请显式传入 <name>");
  }
  return promptProfile(prompter);
}

async function promptTools(prompter: Prompter): Promise<AgentTool[]> {
  process.stdout.write(`选择要同步的工具（编号或 id，逗号/空格分隔）:
  1) claude-code
  2) opencode
  3) DeepSeek Harness（dsh）
  4) pi
`);

  const line = await prompter.ask("> ");

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
  prompter: Prompter,
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

  return promptTools(prompter);
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
  profile: TokenProfile,
  tools: AgentTool[],
  modelId?: string,
): void {
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

async function promptModel(
  prompter: Prompter,
  profile: TokenProfile,
): Promise<string | undefined> {
  const models = profile.models;
  process.stdout.write(
    `选择默认模型（编号或 id，直接回车跳过）:\n${
      models
        .map((model, index) => {
          const label =
            model.name === model.id
              ? model.id
              : `${model.id}（${model.name}）`;
          return `  ${index + 1}) ${label}`;
        })
        .join("\n")
    }\n`,
  );

  const answer = (await prompter.ask("> ")).trim();
  if (answer === "") {
    return undefined;
  }

  const index = selectedIndex(answer, models.length);
  if (index !== undefined) {
    return models[index]?.id;
  }

  const byId = models.find((model) => model.id === answer);
  if (byId !== undefined) {
    return byId.id;
  }
  fail(`未知模型: ${answer}`);
}

async function resolveModel(
  profile: TokenProfile,
  modelFlag: string | undefined,
  tools: AgentTool[],
  prompter: Prompter,
): Promise<string | undefined> {
  const modelId = modelFlag?.trim();
  if (modelId) {
    if (!profile.models.some((item) => item.id === modelId)) {
      fail(`未知模型: ${modelId}`);
    }
    if (!tools.some(isModelTool)) {
      fail("--model 仅对 Claude Code、DeepSeek Harness（dsh）与 pi 有效");
    }
    return modelId;
  }

  if (
    !tools.some(isModelTool) ||
    profile.models.length === 0 ||
    process.stdin.isTTY !== true
  ) {
    return undefined;
  }

  return promptModel(prompter, profile);
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
    "用法: agent-cli token use [<name>] [--all | --tool <id>] [--model <id>]";
  if (positionals.length > 1) {
    fail(usage);
  }

  const prompter = new Prompter();
  try {
    const name = await resolveName(positionals[0], prompter);
    const profile = getProfile(name);
    const tools = await resolveTools(values.all === true, values.tool, prompter);

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

    const modelId = await resolveModel(
      profile,
      values.model,
      ready,
      prompter,
    );
    applyTools(name, profile, ready, modelId);

    for (const item of skipped) {
      process.stderr.write(`${skipMessage(item.tool, item.absence)}\n`);
    }
    if (ready.length > 0) {
      process.stdout.write(
        `已将 profile ${name} 应用到: ${ready.map(toolLabel).join(", ")}\n`,
      );
    }
    return 0;
  } finally {
    prompter.close();
  }
}
