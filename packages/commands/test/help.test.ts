import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { printHelp } from "../src/help.js";

describe("printHelp", () => {
  it("names DeepSeek Harness（dsh） and skipping absent tools", () => {
    let stdout = "";
    const original = process.stdout.write;
    process.stdout.write = ((chunk: Uint8Array | string) => {
      stdout += String(chunk);
      return true;
    }) as typeof process.stdout.write;
    try {
      printHelp();
    } finally {
      process.stdout.write = original;
    }

    assert.match(stdout, /DeepSeek Harness（dsh）/);
    assert.match(stdout, /配置目录或对应程序不存在时跳过该工具，且不创建该配置目录/);
    assert.match(stdout, /--tool/);
    assert.match(stdout, /dsh/);
  });
});
