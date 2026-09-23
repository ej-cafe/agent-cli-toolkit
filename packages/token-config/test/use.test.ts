import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { runTokenUse } from "../src/commands/use.js";
import { TokenConfigError } from "../src/errors.js";
import { saveProfiles } from "../src/store.js";
import type { TokenProfile } from "../src/types.js";
import { captureStd, useTempXdgConfig } from "./helpers.js";

const cleanups: Array<() => void> = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-cli-use-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function setEnv(name: string, value: string | undefined): void {
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

function stubExecutable(directory: string, name: string): void {
  mkdirSync(directory, { recursive: true });
  const file = join(directory, name);
  writeFileSync(file, "");
  chmodSync(file, 0o755);
}

function useProgram(name: string): void {
  const bin = tempDir();
  stubExecutable(bin, name);
  setEnv("PATH", bin);
}

function saveWork(models: TokenProfile["models"] = [{ id: "qwen3.8-max", name: "Qwen" }]): void {
  saveProfiles({
    profiles: {
      work: {
        platform: "deepseek",
        token: "sk-test",
        baseUrl: "https://example.test/v1",
        models,
      },
    },
  });
}

async function withStdin<T>(text: string, fn: () => Promise<T>): Promise<T> {
  const input = Readable.from([text.endsWith("\n") ? text : `${text}\n`]);
  const descriptor = Object.getOwnPropertyDescriptor(process, "stdin");
  Object.defineProperty(process, "stdin", {
    configurable: true,
    get: () => input,
  });
  cleanups.push(() => {
    if (descriptor) {
      Object.defineProperty(process, "stdin", descriptor);
    }
  });
  return fn();
}

describe("runTokenUse", () => {
  let cleanupXdg: () => void;

  afterEach(() => {
    cleanupXdg();
  });

  it("skips a missing directory without creating it", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    const home = tempDir();
    setEnv("HOME", home);
    useProgram("claude");
    saveWork();

    const { stdout, stderr, code } = await captureStd(() =>
      runTokenUse(["work", "--tool", "claude-code"]),
    );
    assert.equal(code, 0);
    assert.equal(existsSync(join(home, ".claude")), false);
    assert.match(stderr, /跳过 claude-code：配置目录不存在/);
    assert.doesNotMatch(stdout, /已将 profile/);
  });

  it("skips a missing program and leaves existing files", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    const dshHome = tempDir();
    setEnv("DSH_HOME", dshHome);
    setEnv("PATH", tempDir());
    const settings = join(dshHome, "settings.yaml");
    writeFileSync(settings, "keep: yes\n", "utf8");
    saveWork();

    const { stdout, stderr, code } = await captureStd(() =>
      runTokenUse(["work", "--tool", "dsh"]),
    );
    assert.equal(code, 0);
    assert.match(stderr, /跳过 DeepSeek Harness（dsh）：未找到程序 dsh/);
    assert.doesNotMatch(stdout, /已将 profile/);
    assert.equal(readFileSync(settings, "utf8"), "keep: yes\n");
  });

  it("applies only ready tools for --all and names DeepSeek Harness（dsh）", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    const home = tempDir();
    setEnv("HOME", home);
    const dshHome = tempDir();
    setEnv("DSH_HOME", dshHome);
    setEnv("PI_CODING_AGENT_DIR", join(tempDir(), "missing-pi"));
    mkdirSync(join(process.env.XDG_CONFIG_HOME!, "opencode"));
    const bin = tempDir();
    stubExecutable(bin, "opencode");
    stubExecutable(bin, "dsh");
    setEnv("PATH", bin);
    saveWork();

    const { stdout, stderr, code } = await captureStd(() =>
      runTokenUse(["work", "--all"]),
    );
    assert.equal(code, 0);
    assert.match(stdout, /已将 profile work 应用到: opencode, DeepSeek Harness（dsh）/);
    assert.doesNotMatch(stdout, /claude-code/);
    assert.match(stderr, /跳过 claude-code：配置目录不存在/);
    assert.match(stderr, /跳过 pi：配置目录不存在，且未找到程序 pi/);
    assert.equal(existsSync(join(home, ".claude")), false);
    assert.equal(existsSync(join(dshHome, "settings.yaml")), true);
  });

  it("exits 0 when every selected tool is skipped", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    const home = tempDir();
    setEnv("HOME", home);
    setEnv("XDG_CONFIG_HOME", process.env.XDG_CONFIG_HOME);
    setEnv("DSH_HOME", join(tempDir(), "missing-dsh"));
    setEnv("PI_CODING_AGENT_DIR", join(tempDir(), "missing-pi"));
    setEnv("PATH", tempDir());
    saveWork();

    const { stdout, stderr, code } = await captureStd(() =>
      runTokenUse(["work", "--all"]),
    );
    assert.equal(code, 0);
    assert.equal(stdout, "");
    assert.match(stderr, /跳过 DeepSeek Harness（dsh）：配置目录不存在，且未找到程序 dsh/);
    assert.equal(existsSync(join(home, ".claude")), false);
  });

  it("rejects --model when no model-capable tool remains", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    setEnv("HOME", tempDir());
    setEnv("DSH_HOME", join(tempDir(), "missing-dsh"));
    setEnv("PI_CODING_AGENT_DIR", join(tempDir(), "missing-pi"));
    mkdirSync(join(process.env.XDG_CONFIG_HOME!, "opencode"));
    useProgram("opencode");
    saveWork();

    await assert.rejects(
      runTokenUse(["work", "--all", "--model", "qwen3.8-max"]),
      /--model 仅对 Claude Code、DeepSeek Harness（dsh）与 pi 有效/,
    );
    assert.equal(
      existsSync(join(process.env.XDG_CONFIG_HOME!, "opencode", "opencode.json")),
      false,
    );
  });

  it("rejects a missing profile before skipping tools", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    const home = tempDir();
    setEnv("HOME", home);
    setEnv("PATH", tempDir());

    await assert.rejects(
      runTokenUse(["missing", "--all"]),
      (error: unknown) =>
        error instanceof TokenConfigError && error.message === "profile 不存在: missing",
    );
    assert.equal(existsSync(join(home, ".claude")), false);
  });

  it("does not require a pi model id when pi is skipped", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    setEnv("PI_CODING_AGENT_DIR", join(tempDir(), "missing-pi"));
    setEnv("PATH", tempDir());
    saveWork([]);

    const { code, stderr } = await captureStd(() =>
      runTokenUse(["work", "--tool", "pi"]),
    );
    assert.equal(code, 0);
    assert.match(stderr, /跳过 pi：配置目录不存在，且未找到程序 pi/);
  });

  it("lists DeepSeek Harness（dsh） in the menu and accepts 3", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    const dshHome = tempDir();
    setEnv("DSH_HOME", dshHome);
    useProgram("dsh");
    saveWork();

    const { stdout, code } = await withStdin("3\n", () =>
      captureStd(() => runTokenUse(["work"])),
    );
    assert.equal(code, 0);
    assert.match(stdout, /3\) DeepSeek Harness（dsh）/);
    assert.match(stdout, /已将 profile work 应用到: DeepSeek Harness（dsh）/);
    assert.equal(existsSync(join(dshHome, "settings.yaml")), true);
  });

  it("still accepts the dsh id from the menu", async () => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    const dshHome = tempDir();
    setEnv("DSH_HOME", dshHome);
    useProgram("dsh");
    saveWork();

    const { stdout, code } = await withStdin("dsh\n", () =>
      captureStd(() => runTokenUse(["work"])),
    );
    assert.equal(code, 0);
    assert.match(stdout, /已将 profile work 应用到: DeepSeek Harness（dsh）/);
  });
});
