import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { pidFilePath } from "../src/paths.js";
import {
  clearPidFile,
  isProcessAlive,
  readPidFile,
  writePidFile,
} from "../src/pidfile.js";
import { useTempXdgConfig } from "./helpers.js";

describe("token-server pidfile", () => {
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = useTempXdgConfig());
  });

  afterEach(() => {
    cleanup();
  });

  it("writes and reads back pid/host/port", () => {
    writePidFile({ pid: 4321, host: "127.0.0.1", port: 8787 });
    assert.deepEqual(readPidFile(), {
      pid: 4321,
      host: "127.0.0.1",
      port: 8787,
    });
  });

  it("returns undefined when the file does not exist", () => {
    assert.equal(readPidFile(), undefined);
  });

  it("returns undefined for malformed or incomplete content", () => {
    const path = pidFilePath();
    mkdirSync(dirname(path), { recursive: true });

    writeFileSync(path, "{ nope", "utf8");
    assert.equal(readPidFile(), undefined);

    writeFileSync(path, JSON.stringify({ pid: "x", host: 1, port: null }), "utf8");
    assert.equal(readPidFile(), undefined);

    writeFileSync(path, JSON.stringify({ pid: 1, host: "h" }), "utf8");
    assert.equal(readPidFile(), undefined);
  });

  it("clears the file", () => {
    writePidFile({ pid: 1, host: "127.0.0.1", port: 1 });
    clearPidFile();
    assert.equal(readPidFile(), undefined);
  });

  it("reports the current process as alive and a dead pid as not alive", () => {
    assert.equal(isProcessAlive(process.pid), true);
    // 2^22 以上的 pid 在常见系统上不会存在。
    assert.equal(isProcessAlive(4_194_303), false);
  });
});
