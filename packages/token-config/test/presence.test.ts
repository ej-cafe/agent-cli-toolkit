import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectTool, toolDirectory } from "../src/apply/presence.js";
import { TokenConfigError } from "../src/errors.js";
import type { AgentTool } from "../src/types.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-cli-presence-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function stubExecutable(directory: string, name: string): void {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, name);
  writeFileSync(file, "");
  chmodSync(file, 0o755);
}

function withEnv(name: string, value: string | undefined): void {
  const previous = process.env[name];
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  cleanups.push(() => {
    if (previous === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  });
}

const tools: Array<{
  tool: AgentTool;
  program: string;
  place(root: string): void;
}> = [
  {
    tool: "claude-code",
    program: "claude",
    place(root) {
      withEnv("HOME", root);
    },
  },
  {
    tool: "opencode",
    program: "opencode",
    place(root) {
      withEnv("XDG_CONFIG_HOME", root);
    },
  },
  {
    tool: "dsh",
    program: "dsh",
    place(root) {
      withEnv("DSH_HOME", join(root, ".dsh"));
    },
  },
  {
    tool: "pi",
    program: "pi",
    place(root) {
      withEnv("PI_CODING_AGENT_DIR", join(root, "agent"));
    },
  },
];

describe("inspectTool", () => {
  for (const { tool, program, place } of tools) {
    it(`${tool}: ready when directory and program exist`, () => {
      const root = tempDir();
      place(root);
      const bin = tempDir();
      stubExecutable(bin, program);
      withEnv("PATH", bin);
      mkdirSync(toolDirectory(tool), { recursive: true });
      assert.deepEqual(inspectTool(tool), { ok: true });
    });

    it(`${tool}: missing directory does not create it`, () => {
      const root = tempDir();
      place(root);
      const bin = tempDir();
      stubExecutable(bin, program);
      withEnv("PATH", bin);
      const dir = toolDirectory(tool);
      assert.equal(existsSync(dir), false);
      assert.deepEqual(inspectTool(tool), { ok: false, absence: "directory" });
      assert.equal(existsSync(dir), false);
    });

    it(`${tool}: missing program`, () => {
      const root = tempDir();
      place(root);
      withEnv("PATH", tempDir());
      mkdirSync(toolDirectory(tool), { recursive: true });
      assert.deepEqual(inspectTool(tool), { ok: false, absence: "program" });
    });

    it(`${tool}: missing directory and program`, () => {
      const root = tempDir();
      place(root);
      withEnv("PATH", tempDir());
      const dir = toolDirectory(tool);
      assert.deepEqual(inspectTool(tool), { ok: false, absence: "both" });
      assert.equal(existsSync(dir), false);
    });

    it(`${tool}: path is a file, not a directory`, () => {
      const root = tempDir();
      place(root);
      const bin = tempDir();
      stubExecutable(bin, program);
      withEnv("PATH", bin);
      const dir = toolDirectory(tool);
      mkdirSync(join(dir, ".."), { recursive: true });
      writeFileSync(dir, "not-a-dir");
      assert.deepEqual(inspectTool(tool), { ok: false, absence: "directory" });
    });
  }

  it("fails when stat returns an error other than ENOENT", () => {
    const root = tempDir();
    const blocker = join(root, "blocker");
    writeFileSync(blocker, "file");
    withEnv("DSH_HOME", join(blocker, "child"));
    withEnv("PATH", tempDir());
    assert.throws(
      () => inspectTool("dsh"),
      (error: unknown) => error instanceof TokenConfigError,
    );
  });
});
