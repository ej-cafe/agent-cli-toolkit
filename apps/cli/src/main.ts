#!/usr/bin/env node
import { run } from "@agent-cli-toolkit/commands";
import { ensureConfigDir, toolkitName } from "@agent-cli-toolkit/core";

try {
  ensureConfigDir();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(
    `${toolkitName}: failed to create config directory: ${message}\n`,
  );
  process.exit(1);
}

process.exitCode = run();
