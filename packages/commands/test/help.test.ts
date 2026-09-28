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
    assert.match(stdout, /aliyun\|tencent\|deepseek\|kimi\|glm/);
    assert.match(stdout, /GLM 中国站 Coding Plan/);
    assert.match(stdout, /智谱 GLM 暂不支持 API 余额查询，请前往控制台/);
    assert.match(stdout, /腾讯云调用 TokenHub OpenAPI/);
    assert.match(stdout, /TENCENTCLOUD_SECRET_ID/);
    assert.match(stdout, /TENCENTCLOUD_SECRET_KEY/);
    assert.match(stdout, /TENCENTCLOUD_REGION/);
    assert.match(stdout, /productType/);
    assert.match(stdout, /--product-type/);
    assert.match(stdout, /个人版暂不支持查询/);
    assert.ok(!/腾讯云与智谱 GLM 暂不支持/.test(stdout));
  });

  it("lists every token command and its key flags", () => {
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

    for (const verb of [
      "token add",
      "token delete",
      "token list",
      "token use",
      "token sync-model-list",
      "token usage",
    ]) {
      assert.ok(stdout.includes(verb), `missing ${verb}`);
    }
    assert.match(stdout, /可省略标志，在终端问答补齐/);
    assert.match(
      stdout,
      /--model.*对 Claude Code、DeepSeek Harness（dsh）与 pi 有效/,
    );
    assert.match(stdout, /defaultProvider/);
    assert.match(stdout, /defaultModel/);
    assert.match(stdout, /每个目标 profile 都请求自己的 \{baseUrl\}\/models/);
    assert.match(
      stdout,
      /DeepSeek 预设 base-url 为 https:\/\/api\.deepseek\.com/,
    );
    assert.match(stdout, /Kimi 中国站预设/);
    assert.match(stdout, /GLM 中国站 Coding Plan 预设/);
  });

  it("documents the token-server command", () => {
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

    assert.ok(stdout.includes("token-server start"), "missing token-server start");
    assert.ok(stdout.includes("token-server stop"), "missing token-server stop");
    assert.ok(
      stdout.includes("token-server switch <profile>"),
      "missing token-server switch <profile>",
    );
    assert.ok(
      stdout.includes("token-server use [--all | --tool <claude-code|opencode|dsh|pi>] [--model <id>]"),
      "missing token-server use usage",
    );
    assert.ok(
      stdout.includes("token-server gen-api-key"),
      "missing token-server gen-api-key",
    );
    assert.match(stdout, /--foreground/);
    assert.match(stdout, /--all/);
    assert.match(stdout, /--tool/);
    assert.match(stdout, /仅监听 127\.0\.0\.1/);
    assert.match(stdout, /默认端口 8787/);
    assert.match(stdout, /--port/);
    assert.match(stdout, /token-server switch 选定的激活 profile/);
    assert.match(stdout, /gen-api-key：服务器对每个请求校验 Authorization: Bearer <key>/);
  });
});
