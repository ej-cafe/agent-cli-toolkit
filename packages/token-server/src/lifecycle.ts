import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { resolveActiveProfile } from "./active-profile.js";
import { fail } from "./errors.js";
import { readApiKey } from "./key.js";
import { logFilePath } from "./paths.js";
import {
  clearPidFile,
  isProcessAlive,
  readPidFile,
  writePidFile,
} from "./pidfile.js";
import { createTokenServer } from "./server.js";

export const serverHost = "127.0.0.1";

const readyTimeoutMs = 5_000;
const stopTimeoutMs = 3_000;
const pollIntervalMs = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function listen(server: Server, port: number): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.off("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, serverHost);
  });

  const address = server.address() as AddressInfo | null;
  if (address === null || typeof address === "string") {
    fail("无法确定监听地址");
  }
  return address.port;
}

/** 打印客户端所需的连接信息：两个 baseUrl 约定与服务器 API key。 */
function printBaseUrlAndKey(host: string, port: number): void {
  const key = readApiKey();
  if (key === undefined) {
    return;
  }
  process.stdout.write(`OpenAI 兼容 baseUrl: http://${host}:${port}/v1\n`);
  process.stdout.write(`Anthropic 兼容 baseUrl: http://${host}:${port}/anthropic\n`);
  process.stdout.write(`apiKey: ${key}\n`);
}

/** 前台运行服务器：监听成功后写 pidfile，收到 SIGTERM/SIGINT 时清理并退出。 */
export async function runForeground(
  port: number,
  printCredentials = false,
): Promise<number> {
  const server = createTokenServer({
    resolveProfile: resolveActiveProfile,
    resolveApiKey: readApiKey,
  });
  let boundPort: number;
  try {
    boundPort = await listen(server, port);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    fail(`无法监听 ${serverHost}:${port}（${reason}）`);
  }

  writePidFile({ pid: process.pid, host: serverHost, port: boundPort });
  process.stdout.write(
    `token-server 正在监听 http://${serverHost}:${boundPort}\n`,
  );
  if (printCredentials) {
    printBaseUrlAndKey(serverHost, boundPort);
  }

  await new Promise<void>((resolve) => {
    const shutdown = (): void => {
      server.close(() => {
        resolve();
      });
    };
    process.once("SIGTERM", shutdown);
    process.once("SIGINT", shutdown);
  });

  clearPidFile();
  return 0;
}

/** 后台守护启动：spawn 一个前台子进程，轮询 pidfile 判定就绪。 */
export async function startDaemon(port: number): Promise<number> {
  const existing = readPidFile();
  if (existing !== undefined && isProcessAlive(existing.pid)) {
    fail(
      `token-server 已在运行（pid ${existing.pid}，http://${existing.host}:${existing.port}）`,
    );
  }
  clearPidFile();

  const script = process.argv[1];
  if (script === undefined) {
    fail("无法定位 agent-cli 入口；请改用 agent-cli token-server start --foreground");
  }

  const logFd = openSync(logFilePath(), "a");
  let child;
  try {
    child = spawn(
      process.execPath,
      [
        ...process.execArgv,
        script,
        "token-server",
        "start",
        "--foreground",
        "--port",
        String(port),
      ],
      {
        detached: true,
        stdio: ["ignore", logFd, logFd],
        env: { ...process.env, AGENT_CLI_TOKEN_SERVER_DAEMON_CHILD: "1" },
      },
    );
  } finally {
    closeSync(logFd);
  }
  child.unref();

  const childPid = child.pid;
  if (childPid === undefined) {
    fail("无法启动后台进程");
  }

  const deadline = Date.now() + readyTimeoutMs;
  while (Date.now() < deadline) {
    const info = readPidFile();
    if (info !== undefined && info.pid === childPid) {
      process.stdout.write(
        `token-server 正在监听 http://${info.host}:${info.port}（pid ${info.pid}）\n`,
      );
      printBaseUrlAndKey(info.host, info.port);
      return 0;
    }
    if (child.exitCode !== null || child.signalCode !== null) {
      break;
    }
    await sleep(pollIntervalMs);
  }

  fail(`token-server 启动失败，请查看日志: ${logFilePath()}`);
}

/** 停止后台守护进程：SIGTERM，超时后 SIGKILL，随后清理 pidfile。 */
export async function stopDaemon(): Promise<number> {
  const info = readPidFile();
  if (info === undefined) {
    fail("token-server 未在运行");
  }
  if (!isProcessAlive(info.pid)) {
    clearPidFile();
    fail("token-server 未在运行（已清理残留 pidfile）");
  }

  try {
    process.kill(info.pid, "SIGTERM");
  } catch {
    clearPidFile();
    fail("token-server 未在运行（已清理残留 pidfile）");
  }

  const deadline = Date.now() + stopTimeoutMs;
  while (Date.now() < deadline && isProcessAlive(info.pid)) {
    await sleep(pollIntervalMs);
  }

  if (isProcessAlive(info.pid)) {
    try {
      process.kill(info.pid, "SIGKILL");
    } catch {
      // 进程已在超时窗口内退出。
    }
  }

  clearPidFile();
  process.stdout.write(`已停止 token-server（pid ${info.pid}）\n`);
  return 0;
}
