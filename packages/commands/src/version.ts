import { getVersion } from "@agent-cli-toolkit/core";

export function printVersion(): void {
  process.stdout.write(`${getVersion()}\n`);
}
