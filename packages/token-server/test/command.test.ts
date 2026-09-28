import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, it } from "node:test";
import { TokenConfigError } from "@agent-cli-toolkit/token-config";
import { runTokenServerCommand } from "../src/commands/token-server.js";
import { runForeground } from "../src/lifecycle.js";
import { readPidFile, writePidFile } from "../src/pidfile.js";
import { readActiveProfile, writeActiveProfile } from "../src/state.js";
import { readApiKey } from "../src/key.js";
import { installApiKey, profile, useTempXdgConfig, writeProfiles } from "./helpers.js";

async function capture(
  fn: () => Promise<number>,
): Promise<{ stdout: string; stderr: string; code: number }> {
  const writes = { stdout: "", stderr: "" };
  const rawStdout = process.stdout.write;
  const rawStderr = process.stderr.write;
  const origStdout = rawStdout.bind(process.stdout) as unknown as (
    chunk: string | Uint8Array,
    ...rest: unknown[]
  ) => boolean;
  const origStderr = rawStderr.bind(process.stderr) as unknown as (
    chunk: string | Uint8Array,
    ...rest: unknown[]
  ) => boolean;
  process.stdout.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    writes.stdout += String(chunk);
    return origStdout(chunk, ...rest);
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
    writes.stderr += String(chunk);
    return origStderr(chunk, ...rest);
  }) as typeof process.stderr.write;
  try {
    const code = await fn();
    return { ...writes, code };
  } finally {
    process.stdout.write = rawStdout;
    process.stderr.write = rawStderr;
  }
}

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

describe("token-server command dispatch", () => {
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = useTempXdgConfig());
  });

  afterEach(() => {
    cleanup();
  });

  it("prints usage to stderr and exits non-zero without a subcommand", async () => {
    const result = await capture(() => runTokenServerCommand([]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /token-server start/);
    assert.match(result.stderr, /token-server stop/);
    assert.match(result.stderr, /token-server switch <profile>/);
    assert.match(result.stderr, /token-server use \[--all \| --tool <id>\]/);
    assert.match(result.stderr, /token-server gen-api-key/);
  });

  it("prints usage to stdout and exits 0 for --help", async () => {
    const result = await capture(() => runTokenServerCommand(["--help"]));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /token-server start/);
  });

  it("rejects an unknown subcommand", async () => {
    const result = await capture(() => runTokenServerCommand(["bogus"]));
    assert.equal(result.code, 1);
    assert.match(result.stderr, /未知 token-server 命令: bogus/);
  });

  it("persists the active profile on switch", async () => {
    writeProfiles({ work: profile() });
    const result = await capture(() => runTokenServerCommand(["switch", "work"]));
    assert.equal(result.code, 0);
    assert.match(result.stdout, /已切换激活 profile: work/);
    assert.equal(readActiveProfile(), "work");
  });

  it("rejects switch for a missing profile without changing the active value", async () => {
    writeProfiles({ work: profile() });
    writeActiveProfile("work");

    await assert.rejects(
      () => runTokenServerCommand(["switch", "missing"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /profile 不存在: missing/);
        return true;
      },
    );
    assert.equal(readActiveProfile(), "work");
  });

  it("rejects switch without a profile argument", async () => {
    await assert.rejects(
      () => runTokenServerCommand(["switch"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /用法/);
        return true;
      },
    );
  });

  it("refuses to start without an active profile and does not write a pidfile", async () => {
    writeProfiles({ work: profile() });

    await assert.rejects(
      () => runTokenServerCommand(["start"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /switch/);
        return true;
      },
    );
    assert.equal(readPidFile(), undefined);
  });

  it("refuses to start without an api key and does not write a pidfile", async () => {
    writeProfiles({ work: profile() });
    writeActiveProfile("work");

    await assert.rejects(
      () => runTokenServerCommand(["start"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /gen-api-key/);
        return true;
      },
    );
    assert.equal(readPidFile(), undefined);
  });

  it("refuses to start when a server is already running", async () => {
    writeProfiles({ work: profile() });
    writeActiveProfile("work");
    installApiKey();
    writePidFile({ pid: process.pid, host: "127.0.0.1", port: 8787 });

    await assert.rejects(
      () => runTokenServerCommand(["start"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /已在运行/);
        return true;
      },
    );
    assert.equal(readPidFile()?.pid, process.pid);
  });

  it("rejects an invalid port", async () => {
    writeProfiles({ work: profile() });
    writeActiveProfile("work");
    installApiKey();

    await assert.rejects(
      () => runTokenServerCommand(["start", "--port", "abc"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /无效端口/);
        return true;
      },
    );
  });

  it("rejects an unknown flag", async () => {
    writeProfiles({ work: profile() });
    writeActiveProfile("work");
    installApiKey();

    await assert.rejects(
      () => runTokenServerCommand(["start", "--nope"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /未知标志/);
        return true;
      },
    );
  });

  it("generates an api key and prints it exactly once", async () => {
    const result = await capture(() => runTokenServerCommand(["gen-api-key"]));
    assert.equal(result.code, 0);
    const printed = result.stdout.match(/tsk_[A-Za-z0-9_-]+/);
    assert.ok(printed, result.stdout);
    assert.equal(readApiKey(), printed[0]);
    assert.equal(result.stdout.match(/tsk_/g)?.length, 1);
  });

  it("rotates the previous key on a second gen-api-key", async () => {
    const first = await capture(() => runTokenServerCommand(["gen-api-key"]));
    const second = await capture(() => runTokenServerCommand(["gen-api-key"]));
    assert.equal(first.code, 0);
    assert.equal(second.code, 0);
    const keyOne = first.stdout.match(/tsk_[A-Za-z0-9_-]+/)?.[0];
    const keyTwo = second.stdout.match(/tsk_[A-Za-z0-9_-]+/)?.[0];
    assert.ok(keyOne);
    assert.ok(keyTwo);
    assert.notEqual(keyOne, keyTwo);
    assert.match(second.stderr, /旧 API key 已失效/);
  });

  it("rejects extra positional arguments for gen-api-key", async () => {
    await assert.rejects(
      () => runTokenServerCommand(["gen-api-key", "extra"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /用法/);
        return true;
      },
    );
  });

  it("fails stop when no server is running", async () => {
    await assert.rejects(
      () => runTokenServerCommand(["stop"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /未在运行/);
        return true;
      },
    );
  });

  it("fails stop for a stale pidfile and clears it", async () => {
    writePidFile({ pid: 4_194_303, host: "127.0.0.1", port: 8787 });

    await assert.rejects(
      () => runTokenServerCommand(["stop"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /未在运行/);
        return true;
      },
    );
    assert.equal(readPidFile(), undefined);
  });
});

describe("token-server foreground listen", () => {
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = useTempXdgConfig());
  });

  afterEach(() => {
    cleanup();
  });

  it("does not write a pidfile when the port is already in use", async () => {
    const blocker = createServer();
    const port = await listen(blocker);
    try {
      await assert.rejects(() => runForeground(port));
      assert.equal(readPidFile(), undefined);
    } finally {
      await new Promise<void>((resolve) => {
        blocker.close(() => {
          resolve();
        });
      });
    }
  });
});
