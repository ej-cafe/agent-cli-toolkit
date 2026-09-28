import assert from "node:assert/strict";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { TokenConfigError } from "@agent-cli-toolkit/token-config";
import { runTokenServerCommand } from "../src/commands/token-server.js";
import { writePidFile } from "../src/pidfile.js";
import { readActiveProfile, writeActiveProfile } from "../src/state.js";
import {
  installApiKey,
  profile,
  useTempXdgConfig,
  writeProfiles,
} from "./helpers.js";

const cleanups: Array<() => void> = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "agent-cli-token-server-use-"));
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

/** 让四种工具目录与程序齐全（claude-code / opencode / dsh / pi）。 */
function installAllTools(): {
  home: string;
  dshHome: string;
  piDir: string;
  opencodeDir: string;
} {
  const home = tempDir();
  setEnv("HOME", home);
  mkdirSync(join(home, ".claude"), { recursive: true });

  const xdg = process.env.XDG_CONFIG_HOME!;
  const opencodeDir = join(xdg, "opencode");
  mkdirSync(opencodeDir, { recursive: true });

  const dshHome = tempDir();
  setEnv("DSH_HOME", dshHome);

  const piDir = tempDir();
  setEnv("PI_CODING_AGENT_DIR", piDir);

  const bin = tempDir();
  for (const program of ["claude", "opencode", "dsh", "pi"]) {
    stubExecutable(bin, program);
  }
  setEnv("PATH", bin);

  return { home, dshHome, piDir, opencodeDir };
}

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

describe("token-server use", () => {
  let cleanupXdg: () => void;

  beforeEach(() => {
    ({ cleanup: cleanupXdg } = useTempXdgConfig());
    writeProfiles({
      work: profile({
        models: [{ id: "model-a", name: "Model A" }],
      }),
    });
  });

  afterEach(() => {
    cleanupXdg();
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  it("points every ready tool at the local server with the generated key, using the active profile", async () => {
    const { home, dshHome, piDir } = installAllTools();
    installApiKey("use-key-123");
    writeActiveProfile("work");

    const result = await capture(() =>
      runTokenServerCommand(["use", "--all"]),
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(
      result.stdout,
      /已写入配置（profile work）: claude-code, opencode, DeepSeek Harness（dsh）, pi/,
    );
    assert.equal(readActiveProfile(), "work");

    const anthropicUrl = "http://127.0.0.1:8787/anthropic";
    const openaiUrl = "http://127.0.0.1:8787/v1";

    const claude = JSON.parse(readFileSync(join(home, ".claude", "settings.json"), "utf8"));
    assert.equal(claude.env.ANTHROPIC_AUTH_TOKEN, "use-key-123");
    assert.equal(claude.env.ANTHROPIC_BASE_URL, anthropicUrl);

    const opencode = JSON.parse(
      readFileSync(join(process.env.XDG_CONFIG_HOME!, "opencode", "opencode.json"), "utf8"),
    );
    assert.equal(opencode.provider.work.options.apiKey, "use-key-123");
    assert.equal(opencode.provider.work.options.baseURL, anthropicUrl);

    const settings = readFileSync(join(dshHome, "settings.yaml"), "utf8");
    assert.match(settings, /baseURL: http:\/\/127\.0\.0\.1:8787\/v1/);
    const credentials = readFileSync(join(dshHome, ".credentials.yaml"), "utf8");
    assert.match(credentials, /WORK_API_KEY: use-key-123/);

    const models = JSON.parse(readFileSync(join(piDir, "models.json"), "utf8"));
    assert.equal(models.providers.work.baseUrl, openaiUrl);
    const auth = JSON.parse(readFileSync(join(piDir, "auth.json"), "utf8"));
    assert.equal(auth.work.key, "use-key-123");
    const piSettings = JSON.parse(readFileSync(join(piDir, "settings.json"), "utf8"));
    assert.equal(piSettings.defaultProvider, "work");
    assert.equal(piSettings.defaultModel, "model-a");
  });

  it("uses the running server port from the pidfile", async () => {
    installAllTools();
    installApiKey("use-key-123");
    writePidFile({ pid: process.pid, host: "127.0.0.1", port: 9999 });
    writeActiveProfile("work");

    const result = await capture(() =>
      runTokenServerCommand(["use", "--all"]),
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /token-server 地址: http:\/\/127\.0\.0\.1:9999/);

    const opencode = JSON.parse(
      readFileSync(join(process.env.XDG_CONFIG_HOME!, "opencode", "opencode.json"), "utf8"),
    );
    assert.equal(opencode.provider.work.options.baseURL, "http://127.0.0.1:9999/anthropic");
  });

  it("refuses to run before an api key exists and leaves the active profile untouched", async () => {
    installAllTools();
    writeActiveProfile("work");

    await assert.rejects(
      () => runTokenServerCommand(["use", "--all"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /gen-api-key/);
        return true;
      },
    );
    assert.equal(readActiveProfile(), "work");
  });

  it("rejects use when no profile is active", async () => {
    installApiKey();
    await assert.rejects(
      () => runTokenServerCommand(["use", "--all"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /switch/);
        return true;
      },
    );
    assert.equal(readActiveProfile(), undefined);
  });

  it("rejects use when the active profile was deleted", async () => {
    installApiKey();
    writeActiveProfile("missing");
    await assert.rejects(
      () => runTokenServerCommand(["use", "--all"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /profile 不存在: missing/);
        return true;
      },
    );
  });

  it("rejects extra positional arguments", async () => {
    installApiKey();
    await assert.rejects(
      () => runTokenServerCommand(["use", "work"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /用法/);
        return true;
      },
    );
  });

  it("rejects an unknown --model without writing anything", async () => {
    installAllTools();
    installApiKey("use-key-123");
    writeActiveProfile("work");

    await assert.rejects(
      () =>
        runTokenServerCommand(["use", "--all", "--model", "nope"]),
      (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /未知模型: nope/);
        return true;
      },
    );
    assert.equal(readActiveProfile(), "work");
    assert.equal(
      existsSync(
        join(process.env.XDG_CONFIG_HOME!, "opencode", "opencode.json"),
      ),
      false,
    );
  });

  it("skips missing tools and writes only ready tools", async () => {
    const opencodeDir = join(process.env.XDG_CONFIG_HOME!, "opencode");
    mkdirSync(opencodeDir, { recursive: true });
    const home = tempDir();
    setEnv("HOME", home);
    setEnv("DSH_HOME", join(tempDir(), "missing-dsh"));
    setEnv("PI_CODING_AGENT_DIR", join(tempDir(), "missing-pi"));
    const bin = tempDir();
    stubExecutable(bin, "opencode");
    setEnv("PATH", bin);
    installApiKey("use-key-123");
    writeActiveProfile("work");

    const result = await capture(() =>
      runTokenServerCommand(["use", "--all"]),
    );
    assert.equal(result.code, 0, result.stderr);
    assert.match(
      result.stdout,
      /已写入配置（profile work）: opencode/,
    );
    assert.match(result.stderr, /跳过 claude-code/);
    assert.match(result.stderr, /跳过 DeepSeek Harness（dsh）/);
    assert.match(result.stderr, /跳过 pi/);
    assert.equal(readActiveProfile(), "work");

    assert.equal(existsSync(join(home, ".claude")), false);
    const opencode = JSON.parse(readFileSync(join(opencodeDir, "opencode.json"), "utf8"));
    assert.equal(opencode.provider.work.options.apiKey, "use-key-123");
  });
});