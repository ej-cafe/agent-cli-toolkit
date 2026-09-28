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
});
