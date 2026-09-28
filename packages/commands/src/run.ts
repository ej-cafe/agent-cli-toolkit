import { parseArgs } from "node:util";
import { getVersion, toolkitName } from "@agent-cli-toolkit/core";
import { runTokenCommand, TokenConfigError } from "@agent-cli-toolkit/token-config";
import { runTokenServerCommand } from "@agent-cli-toolkit/token-server";
import { printHelp } from "./help.js";
import { printVersion } from "./version.js";

/** 把命令抛出的 TokenConfigError 收敛为 stderr 一行 + 退出码 1。 */
async function runGuarded(fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TokenConfigError) {
      process.stderr.write(`${toolkitName}: ${error.message}\n`);
      return 1;
    }
    throw error;
  }
}

export async function run(
  args: string[] = process.argv.slice(2),
): Promise<number> {
  if (args[0] === "token") {
    return runGuarded(() => runTokenCommand(args.slice(1)));
  }

  if (args[0] === "token-server") {
    return runGuarded(() => runTokenServerCommand(args.slice(1)));
  }

  const { values } = parseArgs({
    args,
    options: {
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
    allowPositionals: true,
  });

  if (values.help) {
    printHelp();
    return 0;
  }

  if (values.version) {
    printVersion();
    return 0;
  }

  process.stdout.write(`${toolkitName} ${getVersion()}\n`);
  return 0;
}
