import { parseArgs } from "node:util";
import { getVersion, toolkitName } from "@agent-cli-toolkit/core";
import { runTokenCommand, TokenConfigError } from "@agent-cli-toolkit/token-config";
import { printHelp } from "./help.js";
import { printVersion } from "./version.js";

export async function run(
  args: string[] = process.argv.slice(2),
): Promise<number> {
  if (args[0] === "token") {
    try {
      return await runTokenCommand(args.slice(1));
    } catch (error) {
      if (error instanceof TokenConfigError) {
        process.stderr.write(`${toolkitName}: ${error.message}\n`);
        return 1;
      }
      throw error;
    }
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
