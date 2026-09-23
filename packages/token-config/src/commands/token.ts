import { toolkitName } from "@agent-cli-toolkit/core";
import { fail } from "../errors.js";
import { runTokenAdd } from "./add.js";
import { runTokenDelete } from "./delete.js";
import { runTokenList } from "./list.js";
import { runTokenSyncModelList } from "./sync-model-list.js";
import { runTokenUsage } from "./usage.js";
import { runTokenUse } from "./use.js";

/** token 子命令。run 收到的 args 已去掉 verb，可同步或异步返回退出码。 */
export type TokenCommand = {
  /** 子命令动词，如 "add"。 */
  readonly verb: string;
  /** 用法行（不含两空格缩进）。 */
  readonly usage: string;
  /** 用法行下方的中文补充行；无则不输出该行。 */
  readonly hint?: string;
  readonly run: (args: string[]) => number | Promise<number>;
};

const tokenCommands: readonly TokenCommand[] = [
  {
    verb: "add",
    usage:
      "agent-cli token add [--name <name>] [--platform <aliyun|tencent|deepseek|kimi|glm>] [--token <token>] [--base-url <url>] [--claude-base-url <url>]",
    hint: "（交互式终端可省略标志，问答补齐缺失字段；deepseek / kimi / glm 可省略 URL，使用官方预设，显式传入则覆盖；glm 预设为中国站 Coding Plan）",
    run: runTokenAdd,
  },
  { verb: "delete", usage: "agent-cli token delete <name>", run: runTokenDelete },
  { verb: "list", usage: "agent-cli token list", run: runTokenList },
  {
    verb: "use",
    usage:
      "agent-cli token use <name> [--all | --tool <claude-code|opencode|dsh|pi>] [--model <id>]",
    hint: "（--model 对 Claude Code、DeepSeek Harness（dsh）与 pi 有效；应用到 pi 时总会设置 defaultProvider（profile 名称）与 defaultModel，有 --model 用该 id，否则用模型列表第一项；配置目录或对应程序不存在时跳过该工具，且不创建该配置目录。显示名是 DeepSeek Harness（dsh），--tool 的取值仍是 dsh）",
    run: runTokenUse,
  },
  {
    verb: "sync-model-list",
    usage:
      "agent-cli token sync-model-list [--name <profile>] [--platform <aliyun|tencent|deepseek|kimi|glm>]",
    hint: "（省略 --name 时同步全部目标 profile；--platform 仅过滤；每个目标用自己的 {baseUrl}/models）",
    run: runTokenSyncModelList,
  },
  {
    verb: "usage",
    usage: "agent-cli token usage [--name <profile>] [--output table|text|raw]",
    hint: "（按 profile 分段展示余量，段间空行；省略 --name 查全部；--output 默认 table）",
    run: runTokenUsage,
  },
];

export function printTokenUsage(): void {
  const lines: string[] = ["用法:"];
  for (const command of tokenCommands) {
    lines.push(`  ${command.usage}`);
    if (command.hint !== undefined) {
      lines.push(`  ${command.hint}`);
    }
  }
  process.stderr.write(`${lines.join("\n")}\n`);
}

export async function runTokenCommand(args: string[]): Promise<number> {
  const verb = args[0];
  if (verb === undefined || verb === "--help" || verb === "-h") {
    printTokenUsage();
    return verb === undefined ? 1 : 0;
  }

  const command = tokenCommands.find((item) => item.verb === verb);
  if (command === undefined) {
    process.stderr.write(`${toolkitName}: 未知 token 命令: ${verb}\n`);
    printTokenUsage();
    return 1;
  }

  try {
    return await command.run(args.slice(1));
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
