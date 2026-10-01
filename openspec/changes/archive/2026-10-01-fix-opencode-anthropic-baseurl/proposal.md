## Why

`更新 OpenCode 的 provider` 需求只说把 `provider.<id>.options.baseURL` 写成「Claude 兼容地址」，但这个地址对两个客户端的要求正好不同：

- Claude Code 自己拼 `/v1/messages`，所以 `ANTHROPIC_BASE_URL` 必须**不带** `/v1`；
- OpenCode 写入的 provider 由 `@ai-sdk/anthropic` 驱动，该 SDK 只往 `baseURL` 后面拼 `/messages`，所以它必须**自带** `/v1`。

规格没有区分这两者，实现按字面写入了不带 `/v1` 的地址，OpenCode 于是请求 `{claudeBaseUrl}/messages`，而真实 Anthropic 兼容端点只提供 `{claudeBaseUrl}/v1/messages`（实测前者 404、后者 401，即路由存在）。该缺陷在 `add-docker-e2e-env` 的真实工具验收中被暴露：A 流程四家里只有 opencode 失败（`Provider request failed with HTTP 404`），其余三家正常。

修复本身已随那次验收落地，本 change 的职责是**消除规格里的这条二义性**，让「Claude 兼容地址」在不同客户端下的取值有唯一解释，并把实现与规格、测试对齐。

## What Changes

- 修改 `token-config` 的 `更新 OpenCode 的 provider` 需求：`options.baseURL` 必须按最终客户端补齐协议版本段 —— 最终 `npm` 为 `@ai-sdk/anthropic` 时写成 Claude 兼容地址并确保以 `/v1` 结尾（已是 `/v1` 时不重复追加），否则原样写成该地址。同时写清它与 Claude Code `ANTHROPIC_BASE_URL`（不带 `/v1`）的区别，避免再次按「同一个地址」理解。
- 在同一需求中补记 provider 条目的 `npm` 字段：provider 新建且未指定时写 `@ai-sdk/anthropic`，调用方可显式指定其它兼容包（如 OpenAI 风格 `@ai-sdk/openai`）。这是既有行为（`HEAD` 已如此）与并行实现（`add-token-server` 的 B 路径）的事实，规格此前未写；不写则 `baseURL` 规则无从判定。
- 不改变对外 CLI 命令与标志，不改变 `token-server use` 写入的 `@ai-sdk/openai` 路径（其 baseURL 取自本地服务器已带 `/v1` 的地址，原样写入即正确）。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: `更新 OpenCode 的 provider` 需求中 `options.baseURL` 的取值规则由「写成 Claude 兼容地址」改为「按最终 `npm` 补齐协议版本段」，并补记 `npm` 字段取值。新增场景覆盖 anthropic 包补 `/v1`、地址已带 `/v1` 不重复追加、非 anthropic 包原样写入。

## Impact

- 规格：`openspec/specs/token-config/spec.md`（归档时同步）。
- 代码：`packages/token-config/src/apply/opencode.ts` —— 修复已落地（新增 `anthropicSdkBaseUrl()`，按最终 `npm` 决定 `baseURL`）；本 change 完成后该行为即为受规格约束的行为。
- 测试：`packages/token-config/test/apply.test.ts`（3 条新用例覆盖上述三条规则）；`docker/scripts/assert-config.mjs` 的 A 路径期望值同步为「`claudeBaseUrl` + `/v1`」。
- 无 API/依赖变化；`build` / `typecheck` / `test` 均须保持通过。
