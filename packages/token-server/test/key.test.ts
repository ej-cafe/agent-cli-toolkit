import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { TokenConfigError } from "@agent-cli-toolkit/token-config";
import {
  generateApiKey,
  readApiKey,
  writeApiKey,
} from "../src/key.js";
import { apiKeyPath } from "../src/paths.js";
import { useTempXdgConfig } from "./helpers.js";

describe("token-server api key", () => {
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = useTempXdgConfig());
  });

  afterEach(() => {
    cleanup();
  });

  it("generates unique tsk_-prefixed keys", () => {
    const a = generateApiKey();
    const b = generateApiKey();
    assert.match(a, /^tsk_[A-Za-z0-9_-]+$/);
    assert.notEqual(a, b);
  });

  it("readApiKey returns undefined before any key is written", () => {
    assert.equal(readApiKey(), undefined);
  });

  it("round-trips a written key and stores it with 0600 permissions", () => {
    writeApiKey("tsk_abc");
    assert.equal(readApiKey(), "tsk_abc");
    const mode = statSync(apiKeyPath()).mode & 0o777;
    assert.equal(mode, 0o600);
  });

  it("trims surrounding whitespace on read but preserves the key body", () => {
    writeApiKey("  tsk_xyz\n");
    assert.equal(readApiKey(), "tsk_xyz");
  });

  it("treats an empty file as unconfigured", () => {
    writeApiKey("tsk_a");
    writeApiKey("   \n");
    assert.equal(readApiKey(), undefined);
  });

  it("overwrites on rotation", () => {
    writeApiKey("tsk_old");
    writeApiKey("tsk_new");
    assert.equal(readApiKey(), "tsk_new");
  });

  it("reports a write failure as TokenConfigError", () => {
    const blocker = mkdtempSync(join(tmpdir(), "agent-cli-key-block-"));
    try {
      // 用同名文件挡住配置目录，使 mkdir / rename 均失败。
      writeFileSync(join(blocker, "agent-cli-toolkit"), "not a dir");
      process.env.XDG_CONFIG_HOME = blocker;
      assert.throws(() => writeApiKey("tsk_x"), (error: unknown) => {
        assert.ok(error instanceof TokenConfigError);
        assert.match(error.message, /无法写入 API key/);
        return true;
      });
    } finally {
      rmSync(blocker, { recursive: true, force: true });
    }
  });
});