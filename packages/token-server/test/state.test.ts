import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { stateFilePath } from "../src/paths.js";
import { readActiveProfile, writeActiveProfile } from "../src/state.js";
import { useTempXdgConfig } from "./helpers.js";

describe("token-server state", () => {
  let cleanup: () => void;

  beforeEach(() => {
    ({ cleanup } = useTempXdgConfig());
  });

  afterEach(() => {
    cleanup();
  });

  it("writes and reads back the active profile", () => {
    writeActiveProfile("work");
    assert.equal(readActiveProfile(), "work");

    const raw = readFileSync(stateFilePath(), "utf8");
    assert.deepEqual(JSON.parse(raw), { activeProfile: "work" });
  });

  it("returns undefined when the file does not exist", () => {
    assert.equal(readActiveProfile(), undefined);
  });

  it("treats malformed json as unset", () => {
    const path = stateFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "{ not json", "utf8");
    assert.equal(readActiveProfile(), undefined);
  });

  it("treats a non-object root as unset", () => {
    const path = stateFilePath();
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "[1,2,3]", "utf8");
    assert.equal(readActiveProfile(), undefined);
  });

  it("treats a missing or empty activeProfile as unset", () => {
    const path = stateFilePath();
    mkdirSync(dirname(path), { recursive: true });

    writeFileSync(path, JSON.stringify({}), "utf8");
    assert.equal(readActiveProfile(), undefined);

    writeFileSync(path, JSON.stringify({ activeProfile: "   " }), "utf8");
    assert.equal(readActiveProfile(), undefined);

    writeFileSync(path, JSON.stringify({ activeProfile: 42 }), "utf8");
    assert.equal(readActiveProfile(), undefined);
  });

  it("overwrites a previous value", () => {
    writeActiveProfile("first");
    writeActiveProfile("second");
    assert.equal(readActiveProfile(), "second");
  });
});
