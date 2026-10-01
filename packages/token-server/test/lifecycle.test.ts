import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, it } from "node:test";
import { logFilePath } from "../src/paths.js";
import { isProcessAlive, readPidFile } from "../src/pidfile.js";
import { writeActiveProfile } from "../src/state.js";
import { installApiKey, profile, useTempXdgConfig, writeProfiles } from "./helpers.js";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliEntry = join(repoRoot, "apps/cli/src/main.ts");

async function runCli(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ["--import", "tsx", cliEntry, ...args],
      { cwd: repoRoot, env: process.env },
    );
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code?: unknown; stdout?: string; stderr?: string };
    return {
      code: typeof failure.code === "number" ? failure.code : 1,
      stdout: failure.stdout ?? "",
      stderr: failure.stderr ?? "",
    };
  }
}

async function waitFor<T>(
  produce: () => T | undefined,
  timeoutMs = 10_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = produce();
    if (value !== undefined) {
      return value;
    }
    await delay(50);
  }
  throw new Error("timeout waiting for condition");
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

describe("token-server lifecycle (integration)", () => {
  let cleanup: () => void;
  const upstreams: Server[] = [];

  beforeEach(async () => {
    ({ cleanup } = useTempXdgConfig());
  });

  afterEach(async () => {
    await Promise.all(
      upstreams.splice(0).map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => {
              resolve();
            });
          }),
      ),
    );
    cleanup();
  });

  async function startUpstream(): Promise<number> {
    const upstream = createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("pong");
    });
    upstreams.push(upstream);
    return listen(upstream);
  }

  it("runs in the foreground, prints credentials, serves requests, and cleans the pidfile on SIGTERM", async () => {
    const upstreamPort = await startUpstream();
    writeProfiles({
      work: profile({ baseUrl: `http://127.0.0.1:${upstreamPort}`, token: "tok" }),
    });
    writeActiveProfile("work");
    installApiKey();

    const child = spawn(
      process.execPath,
      [
        "--import",
        "tsx",
        cliEntry,
        "token-server",
        "start",
        "--foreground",
        "--port",
        "0",
      ],
      { cwd: repoRoot, env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let childOut = "";
    child.stdout?.on("data", (chunk) => {
      childOut += String(chunk);
    });

    try {
      const info = await waitFor(() => readPidFile());
      assert.equal(info.pid, child.pid);

      // pidfile 是同步落盘、立即可见，stdout 到管道要等刷新；
      // 若不等凭据行到达就断言，满负载下会读到「正在监听」而已（偶发失败）。
      await waitFor(() => (childOut.includes("apiKey: test-server-key") ? true : undefined));
      assert.match(childOut, /OpenAI 兼容 baseUrl: http:\/\/127\.0\.0\.1:\d+\/v1/);
      assert.match(
        childOut,
        /Anthropic 兼容 baseUrl: http:\/\/127\.0\.0\.1:\d+\/anthropic/,
      );
      assert.match(childOut, /apiKey: test-server-key/);

      const unauthorized = await fetch(`http://127.0.0.1:${info.port}/v1/models`);
      assert.equal(unauthorized.status, 401);

      const res = await fetch(`http://127.0.0.1:${info.port}/v1/models`, {
        headers: { authorization: "Bearer test-server-key" },
      });
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "pong");

      child.kill("SIGTERM");
      await once(child, "exit");
      assert.equal(readPidFile(), undefined);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await once(child, "exit").catch(() => undefined);
      }
    }
  });

  it("starts daemonized, records the pidfile, and stops cleanly", async () => {
    const upstreamPort = await startUpstream();
    writeProfiles({
      work: profile({ baseUrl: `http://127.0.0.1:${upstreamPort}`, token: "tok" }),
    });
    writeActiveProfile("work");
    installApiKey();

    let daemonPid: number | undefined;
    try {
      const started = await runCli(["token-server", "start", "--port", "0"]);
      assert.equal(started.code, 0, started.stderr);
      assert.match(started.stdout, /正在监听/);
      assert.match(started.stdout, /OpenAI 兼容 baseUrl: http:\/\/127\.0\.0\.1:\d+\/v1/);
      assert.match(
        started.stdout,
        /Anthropic 兼容 baseUrl: http:\/\/127\.0\.0\.1:\d+\/anthropic/,
      );
      assert.match(started.stdout, /apiKey: test-server-key/);

      const info = await waitFor(() => readPidFile());
      daemonPid = info.pid;

      const res = await fetch(`http://127.0.0.1:${info.port}/v1/models`, {
        headers: { authorization: "Bearer test-server-key" },
      });
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "pong");

      // 守护子进程的输出进日志文件，但 API key 不得出现在日志中。
      const log = readFileSync(logFilePath(), "utf8");
      assert.doesNotMatch(log, /test-server-key/);
      assert.doesNotMatch(log, /tsk_/);

      const stopped = await runCli(["token-server", "stop"]);
      assert.equal(stopped.code, 0, stopped.stderr);
      assert.equal(readPidFile(), undefined);

      await waitFor(() =>
        isProcessAlive(info.pid) ? undefined : true,
      );
    } finally {
      if (daemonPid !== undefined && isProcessAlive(daemonPid)) {
        try {
          process.kill(daemonPid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
  });
});
