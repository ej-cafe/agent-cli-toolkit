import { toolkitName } from "@agent-cli-toolkit/core";
import { fail } from "../errors.js";
import { runTokenAdd } from "./add.js";
import { runTokenDelete } from "./delete.js";
import { runTokenList } from "./list.js";
import { runTokenSyncModelList } from "./sync-model-list.js";
import { runTokenUse } from "./use.js";

export function printTokenUsage(): void {
  process.stderr.write(`用法:
  agent-cli token add [--name <name>] [--platform <aliyun|tencent>] [--token <token>] [--base-url <url>] [--claude-base-url <url>]
  （交互式终端可省略标志，问答补齐缺失字段）
  agent-cli token delete <name>
  agent-cli token list
  agent-cli token use <name> [--all | --tool <claude-code|opencode|dsh|pi>] [--model <id>]
  （--model 对 Claude Code、dsh 与 pi 有效）
  agent-cli token sync-model-list [--name <profile>] [--platform <aliyun|tencent>]
  （省略 --name 时同步全部目标 profile；--platform 仅过滤；每个目标用自己的 {baseUrl}/models）
`);
}

export async function runTokenCommand(args: string[]): Promise<number> {
  const verb = args[0];
  if (verb === undefined || verb === "--help" || verb === "-h") {
    printTokenUsage();
    return verb === undefined ? 1 : 0;
  }

  try {
    if (verb === "add") {
      return await runTokenAdd(args.slice(1));
    }
    if (verb === "delete") {
      return runTokenDelete(args.slice(1));
    }
    if (verb === "list") {
      return runTokenList(args.slice(1));
    }
    if (verb === "use") {
      return await runTokenUse(args.slice(1));
    }
    if (verb === "sync-model-list") {
      return await runTokenSyncModelList(args.slice(1));
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

  process.stderr.write(`${toolkitName}: 未知 token 命令: ${verb}\n`);
  printTokenUsage();
  return 1;
}
