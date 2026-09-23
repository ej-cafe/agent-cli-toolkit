## Context

See proposal.md — Why。平台通过 `packages/token-config/src/platforms/` 的 `TokenPlatform` + `registry` 注册；`Platform` 联合类型在 `types.ts`。带预设的平台（`deepseek`、`kimi`）在 add 时省略 URL；无预设的（`aliyun`、`tencent`）强制 `--base-url`。`queryUsage` 对不支持的平台直接 `fail`（`tencent` 模式）。

## Goals / Non-Goals

**Goals:**

- 以与 `kimi` 相同的注册面接入 `glm`：类型、registry、预设常量、add / sync / help / README。
- 默认 URL 指向中国站 Coding Plan（agent 工具场景）。
- usage 明确失败文案，不发起 HTTP。

**Non-Goals:**

- 不实现 Coding Plan 额度或控制台余额查询（未稳定公开契约）。
- 不新增 agent 工具；不改 apply 字段写入规则。
- 不改已有平台编号别名（`1`–`4`）；`glm` 用 `5`。

## Decisions

1. **平台 id = `glm`**  
   与用户说法一致，短于 `zhipu` / `bigmodel`。别名 `["5", "glm"]`。

2. **默认预设 = Coding Plan（中国站）**  
   - `baseUrl`：`https://open.bigmodel.cn/api/coding/paas/v4`  
   - `claudeBaseUrl`：`https://open.bigmodel.cn/api/anthropic`  
   备选曾考虑通用 `…/api/paas/v4`；本 CLI 面向 coding agent，故选 Coding Plan。按量 / 国际站靠显式覆盖。

3. **usage = 暂不支持**  
   与 `tencent` 相同。Coding Plan 额度与按量余额走不同未文档化接口，本变更不接入。

4. **实现落点**  
   新文件 `platforms/glm.ts`；扩展 `types.ts` 的 `Platform` 与默认 URL 常量；registry 末尾追加；更新 token 命令 hint、`packages/commands` 帮助、README、相关测试（registry / add / sync / usage / help）。

## Risks / Trade-offs

- [Coding Plan 预设与按量用户预期不符] → 帮助与 README 写明预设含义，并说明可用 `--base-url` / `--claude-base-url` 覆盖。  
- [日后补 usage 时接口可能变更] → 本变更刻意不实现；后续单独 change。  
- [`/models` 在 Coding Plan 端点上的行为依赖官方] → 与现有平台相同：失败则不写入 profile。

## Migration Plan

- 纯增量：已有 profile 不受影响。  
- 回滚：移除 `glm` 注册即可；已写入的 `glm` profile 会因未知平台在校验处失败——若需兼容回滚应文档说明先删除该类 profile。
