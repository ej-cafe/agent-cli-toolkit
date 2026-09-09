import { parseArgs } from "node:util";
import { fail } from "../errors.js";
import { deleteProfile } from "../store.js";

export function runTokenDelete(args: string[]): number {
  const { positionals } = parseArgs({
    args,
    options: {},
    allowPositionals: true,
  });

  const name = positionals[0]?.trim();
  if (!name) {
    fail("用法: agent-cli token delete <name>");
  }

  if (positionals.length > 1) {
    fail("用法: agent-cli token delete <name>");
  }

  deleteProfile(name);
  process.stdout.write(`已删除 profile: ${name}\n`);
  return 0;
}
