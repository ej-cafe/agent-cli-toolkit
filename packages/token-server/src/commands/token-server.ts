import { parseArgs } from "node:util";
import { getProfile } from "@agent-cli-toolkit/token-config";
import { resolveActiveProfile } from "../active-profile.js";
import { fail } from "../errors.js";
import { generateApiKey, readApiKey, writeApiKey } from "../key.js";
import { runForeground, startDaemon, stopDaemon } from "../lifecycle.js";
import { apiKeyPath } from "../paths.js";
import { writeActiveProfile } from "../state.js";
import { runTokenServerUse } from "../use.js";

const defaultPort = 8787;

const usageText = [
  "用法:",
  "  agent-cli token-server start [--port <port>] [--foreground]",
  "  agent-cli token-server stop",
  "  agent-cli token-server switch <profile>",
  "  agent-cli token-server use <profile> [--all | --tool <id>] [--model <id>]",
  "  agent-cli token-server gen-api-key",
].join("\n");

function parsePort(value: string | undefined): number {
  if (value === undefined || value.trim() === "") {
    return defaultPort;
  }
  const port = Number(value);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    fail(`无效端口: ${value}（应为 0-65535 的整数）`);
  }
  return port;
}

async function runStart(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args,
    options: {
      port: { type: "string" },
      foreground: { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  if (positionals.length > 0) {
    fail(usageText);
  }

  const port = parsePort(values.port);
  if (resolveActiveProfile() === undefined) {
    fail("没有可用的激活 profile；请先执行: agent-cli token-server switch <profile>");
  }
  if (readApiKey() === undefined) {
    fail("尚未生成 token-server API key；请先执行: agent-cli token-server gen-api-key");
  }
  if (values.foreground) {
    return runForeground(port);
  }
  return startDaemon(port);
}

function runGenApiKey(args: string[]): number {
  if (args.length > 0) {
    fail("用法: agent-cli token-server gen-api-key");
  }
  const previous = readApiKey();
  const key = generateApiKey();
  writeApiKey(key);
  if (previous !== undefined) {
    process.stderr.write("旧 API key 已失效；请更新已配置客户端的 key 或重新运行 token-server use。\n");
  }
  process.stdout.write(`已生成 token-server API key（仅显示一次）：\n${key}\n`);
  process.stdout.write(`已保存到: ${apiKeyPath()}\n`);
  return 0;
}

function runSwitch(args: string[]): number {
  const { positionals } = parseArgs({
    args,
    options: {},
    allowPositionals: true,
  });

  if (positionals.length !== 1) {
    fail(usageText);
  }
  const name = positionals[0];
  if (name === undefined) {
    fail(usageText);
  }

  getProfile(name);
  writeActiveProfile(name);
  process.stdout.write(`已切换激活 profile: ${name}\n`);
  return 0;
}

export function printTokenServerUsage(): void {
  process.stderr.write(`${usageText}\n`);
}

export async function runTokenServerCommand(args: string[]): Promise<number> {
  const verb = args[0];
  if (verb === undefined) {
    printTokenServerUsage();
    return 1;
  }
  if (verb === "--help" || verb === "-h") {
    process.stdout.write(`${usageText}\n`);
    return 0;
  }

  try {
    switch (verb) {
      case "start":
        return await runStart(args.slice(1));
      case "stop":
        return await stopDaemon();
      case "switch":
        return runSwitch(args.slice(1));
      case "use":
        return await runTokenServerUse(args.slice(1));
      case "gen-api-key":
        return runGenApiKey(args.slice(1));
      default:
        process.stderr.write(`agent-cli-toolkit: 未知 token-server 命令: ${verb}\n`);
        printTokenServerUsage();
        return 1;
    }
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code: unknown }).code)
        : undefined;
    if (code === "ERR_PARSE_ARGS_UNKNOWN_OPTION") {
      fail("未知标志，请查看 agent-cli --help");
    }
    throw error;
  }
}
