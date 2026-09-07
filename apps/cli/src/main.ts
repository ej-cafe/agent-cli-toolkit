#!/usr/bin/env node
import { parseArgs } from "node:util";
import { getVersion, toolkitName } from "@agent-cli-toolkit/core";

const { values } = parseArgs({
  options: {
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
  allowPositionals: true,
});

if (values.help) {
  process.stdout.write(`${toolkitName}

Usage:
  agent-cli [--help] [--version]
`);
  process.exit(0);
}

if (values.version) {
  process.stdout.write(`${getVersion()}\n`);
  process.exit(0);
}

process.stdout.write(`${toolkitName} ${getVersion()}\n`);
