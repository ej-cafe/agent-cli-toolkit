import { TokenConfigError } from "@agent-cli-toolkit/token-config";

/** 抛出一致的用户可见错误；由顶层 run 收敛为 stderr 一行 + 退出码 1。 */
export function fail(message: string): never {
  throw new TokenConfigError(message);
}
