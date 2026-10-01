## Context

- 规格里只有一个「Claude 兼容地址」概念（见 `openspec/specs/token-config/spec.md` 的 `存储 token profile`：`claudeBaseUrl` 非空则用它，否则用 `baseUrl`），而 `更新 Claude Code 的 env` 与 `更新 OpenCode 的 provider` 两条需求都直接复用它。
- 两个客户端对这个地址的用法不同：Claude Code 在 `ANTHROPIC_BASE_URL` 后自行拼 `/v1/messages`；OpenCode 的 provider 由 `@ai-sdk/anthropic` 驱动，该 SDK 的默认 baseURL 是 `https://api.anthropic.com/v1`，请求时只拼 `/messages`。所以「同一个地址」在两边必须差一个 `/v1`。
- 实现侧共用 `claudeCompatibleUrl(profile)`（`packages/token-config/src/apply/claude-url.ts`），Claude Code 与 OpenCode 两条写入路径都调它。
- OpenCode 的 provider 条目还有 `npm` 字段（`HEAD` 已写：新建时默认 `@ai-sdk/anthropic`），`token-server use` 路径会显式传入 `@ai-sdk/openai`。

## Goals / Non-Goals

**Goals:**

- 让「Claude 兼容地址」与「写进某个客户端的地址」在规格里分成两层，使同一份 profile 在两边得到各自正确的值。
- 让不变量可被单测直接钉住：写入值与客户端所依赖 SDK 的拼接规则一致。

**Non-Goals:**

- 不重定义 profile 存储层的「Claude 兼容地址」（`存储 token profile` 需求保持不变，`claudeBaseUrl` 的语义与回退规则都不动）。
- 不改 `claudeCompatibleUrl()` 本身。
- 不新增平台、不改 `token-server use` 写入的 `/v1` 服务器地址（它本来就带 `/v1`，原样写入即正确）。
- 不校验上游是否真的提供 `/v1`，也不为不支持的服务商做特判。

## Decisions

**D1. 在 OpenCode 的写入层补 `/v1`，不动共享的 `claudeCompatibleUrl()`。**
理由：需要 `/v1` 的是 anthropic SDK 的调用约定，不是「Claude 兼容地址」这个 profile 概念；Claude Code 的 `ANTHROPIC_BASE_URL` 必须不带 `/v1`，改共享函数会立刻把 Claude Code 打坏（它拼出 `/v1/v1/messages`）。备选方案「让 OpenCode 生成时去掉 `/v1`」不可行：SDK 行为不可配置，且真实端点的 Anthropic 路由只在 `/v1/messages` 上存在。

**D2. 以最终 `npm` 为判据，而不是「是不是 OpenCode」。**
理由：`token-server use` 路径把 OpenCode 写成 `@ai-sdk/openai` 且地址是本地服务器已带 `/v1` 的 `http://127.0.0.1:<port>/v1`，那条路径不需要也不应补 `/v1`。按 `npm` 分支使两条路径各自正确，且不需要知道调用方是谁。备选方案「按调用方传参决定」会把同一个约定散到调用点，容易漏。

**D3. 幂等追加：先去掉尾部斜杠，已以 `/v1` 结尾则不追加。**
理由：用户可能把 `claudeBaseUrl` 直接写成带 `/v1` 的地址（本环境的真实 Token Plan 凭据就是这样），必须避免 `/v1/v1`；尾部斜杠（`.../anthropic/`）同样要归一化，否则会写出 `//v1`。实现为 `packages/token-config/src/apply/opencode.ts` 的 `anthropicSdkBaseUrl()`。

**D4. 规格分层：profile 层仍叫「Claude 兼容地址」，客户端层写「按 `npm` 补齐协议版本段」。**
理由：二义性来自把客户端约定写进了 profile 层术语。把规则写在 `更新 OpenCode 的 provider` 里，`存储 token profile` 的 `claudeBaseUrl` 语义保持原样，也不需要动 `存储 token profile` 的两个既有场景。

## Risks / Trade-offs

- [用户把 `claudeBaseUrl` 写成完整 `/v1/messages` 端点] → 不处理：规格定义的是「兼容地址」而非完整端点，本 change 只保证 `/v1` 不重复追加。
- [两个客户端对地址的要求未来再分化（例如再接入第三个 Anthropic 兼容客户端）] → 规则已按客户端 + SDK 分层，新增客户端只需在自己的需求里声明约定，不必改共享函数。
- [规格新增的 `npm` 字段描述与 `add-token-server` 的 token-server delta 表述重叠] → 两者不冲突：token-config 侧只声明字段取值规则，`token-server use` 的地址由 token-server delta 负责。
- [写入值与上游是否可用脱钩] → 规格只声明写什么；能否打通由真实工具验收环境（`docker/`，见 `add-docker-e2e-env`）负责验证。

## Migration Plan

无数据迁移。已写入的 `opencode.json` 会在下一次 `token use` 时被覆盖为正确值（写入是幂等的 upsert）；回滚 = 还原这次规格 delta 与实现改动，已写入的旧值不影响其他工具。
