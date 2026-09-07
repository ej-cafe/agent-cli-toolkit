#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  ensureConfigDir,
  getVersion,
  toolkitName,
} from "@agent-cli-toolkit/core";

const { values } = parseArgs({
  options: {
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
  allowPositionals: true,
});

try {
  ensureConfigDir();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${toolkitName}: failed to create config directory: ${message}\n`,
  );
  process.exit(1);
}

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
