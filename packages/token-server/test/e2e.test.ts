import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, it } from "node:test";
import { resolveActiveProfile } from "../src/active-profile.js";
import { readApiKey } from "../src/key.js";
import { createTokenServer } from "../src/server.js";
import { writeActiveProfile } from "../src/state.js";
import { installApiKey, profile, useTempXdgConfig, writeProfiles } from "./helpers.js";

/**
 * 端到端测试：用真实阿里云百炼（Bailian / DashScope）profile 验证模型连通性。
 *
 * 需要真实 API key，因此默认跳过；显式设置环境变量才运行：
 *   TOKEN_SERVER_E2E_BAILIAN_TOKEN=sk-... pnpm test
 * 或单独跑：
 *   TOKEN_SERVER_E2E_BAILIAN_TOKEN=sk-... pnpm exec tsx --test packages/token-server/test/e2e.test.ts
 *
 * 可选环境变量：TOKEN_SERVER_E2E_BAILIAN_BASE（上游 OpenAI 兼容端点，默认百炼 compatible-mode/v1）、
 * TOKEN_SERVER_E2E_BAILIAN_MODEL（默认 qwen-turbo）——便于按自己 profile 的 baseUrl / 模型自测。
 * 测试使用临时 XDG 配置目录，不读取、不修改真实用户配置；不会把 key 写入任何文件。
 */
const e2eToken = process.env.TOKEN_SERVER_E2E_BAILIAN_TOKEN?.trim();
const e2eBase = (
  process.env.TOKEN_SERVER_E2E_BAILIAN_BASE?.trim() ||
  "https://dashscope.aliyuncs.com/compatible-mode/v1"
);
const e2eModel =
  process.env.TOKEN_SERVER_E2E_BAILIAN_MODEL?.trim() || "qwen-turbo";

function listen(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

describe("token-server e2e（真实百炼模型连通性）", () => {
  const servers: Server[] = [];
  afterEach(() => {
    for (const server of servers.splice(0)) {
      server.close();
    }
  });

  it("经本地转发服务器调用百炼模型并返回模型输出", async (t) => {
    if (e2eToken === undefined) {
      t.skip("未设置 TOKEN_SERVER_E2E_BAILIAN_TOKEN，跳过真实模型 e2e");
      return;
    }

    const { cleanup } = useTempXdgConfig();
    try {
      writeProfiles({
        "bailian-e2e": profile({
          platform: "aliyun",
          token: e2eToken,
          baseUrl: e2eBase,
          models: [{ id: e2eModel, name: e2eModel }],
        }),
      });
      writeActiveProfile("bailian-e2e");
      installApiKey();

      const server = createTokenServer({
        resolveProfile: resolveActiveProfile,
        resolveApiKey: readApiKey,
      });
      servers.push(server);
      const port = await listen(server);

      // 模拟 OpenAI 风格客户端（与 dsh / pi / opencode 一致）：Authorization: Bearer <服务器 key>。
      const res = await fetch(`http://127.0.0.1:${port}/v1/chat/completions`, {
        method: "POST",
        headers: {
          authorization: "Bearer test-server-key",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: e2eModel,
          messages: [{ role: "user", content: "只回复：ok" }],
          max_tokens: 8,
        }),
        signal: AbortSignal.timeout(60_000),
      });

      assert.equal(res.status, 200, `上游应返回 200，实际 ${res.status}`);
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      assert.ok(
        typeof content === "string" && content.length > 0,
        "模型应返回非空文本内容",
      );
    } finally {
      cleanup();
    }
  });
});