import { parseArgs } from "node:util";
import { getVersion, toolkitName } from "@agent-cli-toolkit/core";
import { printHelp } from "./help.js";
import { printVersion } from "./version.js";

export function run(args: string[] = process.argv.slice(2)): number {
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
