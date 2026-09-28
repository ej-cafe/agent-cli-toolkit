import { join } from "node:path";
import { getConfigDir } from "@agent-cli-toolkit/core";

/** 激活 profile 的持久化文件。 */
export function stateFilePath(): string {
  return join(getConfigDir(), "token-server.json");
}

/** 运行中服务器的 pid 文件。 */
export function pidFilePath(): string {
  return join(getConfigDir(), "token-server.pid");
}

/** 服务器 API key（客户端访问凭据，0600）。 */
export function apiKeyPath(): string {
  return join(getConfigDir(), "token-server.key");
}

/** 守护进程的日志文件。 */
export function logFilePath(): string {
  return join(getConfigDir(), "token-server.log");
}
