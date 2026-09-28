## Context

动机见 `proposal.md`；行为约束见本变更 `specs/token-config/spec.md`。

现状：`packages/token-config/src/platforms/tencent.ts` 的 `queryUsage` 直接 `fail`（引导 TokenHub 控制台）；`usage.ts` 按 profile 分段查询，平台通过 `platforms/registry.ts` 注册，`TokenPlatform` 接口为 `queryUsage(profile) → Record<string, unknown>` + `formatUsage(raw, output)`，渲染工具在 `platforms/format.ts`（`formatTable` / `cell` / `formatRaw`）。aliyun 用了「模块级 promise 去重 + execFile 调 `bl`」的模式；deepseek/kimi 走 `fetchJson` + `setHttpFetch` 注入缝（`http.ts`）。测试用 `node:test` + `helpers.ts`（`captureStd` / `mockHttpFetch` / `useTempXdgConfig`），根目录 `pnpm test` 直跑。

已确认的腾讯侧事实：TokenHub 官方 OpenAPI（endpoint `tokenhub.tencentcloudapi.com`，版本 `2026-03-22`），余额查询用 `DescribeTokenPlanList`（无必填参数；响应 `TokenPlanSet[]`，每项含 `Name` / `TeamId` / `Status` / `StopReason` / `ProductType` / `PackageInfo`；`PackageInfo` 含 `TotalQuota` / `TotalUsed` / `CycleQuota` / `ExpireTime` 等，单位按 `ProductType`：`enterprise` 专业套餐为积分 credits，`enterprise-auto` 轻享套餐为 token）。官方 npm 包 `tencentcloud-sdk-nodejs-tokenhub`（4.1.315+；CJS main，ESM 子入口）提供 `tokenhub.v20260322.Client`；鉴权为腾讯云标准 SecretId/SecretKey + region（TC3 签名由 SDK 完成）。

## Goals / Non-Goals

**目标：**

- `token usage` 支持 `tencent` profile：通过官方 SDK 调 `DescribeTokenPlanList` 查询 TokenHub 套餐余量。
- 凭据只来自 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`（`TENCENTCLOUD_REGION` 可选），不扩 `TokenProfile`、不改 `token-profile.json`，不读 profile 的 Bearer token。
- 渲染与错误口径并入既有多平台契约（table/text/raw、各套独立成败、空 roll 的「暂无」文案），多 tencent profile 同轮至多一次 SDK 调用。
- openspec 1.13 的 MODIFIED 块不得删除既有场景名（防误删设计）；因此「拒绝腾讯云」场景按名保留，语义重定为「腾讯云凭据缺失时的拒绝路径」（见 delta spec 该场景注释）。
- 测试可离线注入（沿用 `http.ts` 的注入缝风格），不依赖真实腾讯云凭据。

**非目标：**

- 不实现 TokenHub 套餐购买/续费/升配（`CreateTokenPlanTeamOrderAndBuy` 等）等写操作。
- 不把腾讯云密钥写入任何配置文件，不做 OAuth / 控制台登录态。
- 不改 `token add` / `sync-model-list` 语义：模型列表同步仍走 `{baseUrl}/models`，继续不读 `TENCENTCLOUD_*`。
- 不实现 `DescribeTokenPlan` 单套餐详情或 `DescribeTokenPlanApiKeyList` 子额度包查询（一期只做主额度包；按预算后续再加）。

## Decisions

### 1. 数据源：官方 SDK `tencentcloud-sdk-nodejs-tokenhub`

实现：`import { tokenhub } from "tencentcloud-sdk-nodejs-tokenhub"`（NodeNext ESM 下 CJS main 的 named import 可用），构造 `new tokenhub.v20260322.Client({ credential: { secretId, secretKey }, region })`，调用 `DescribeTokenPlanList({})`，返回 `{ TokenPlanSet, TotalCount, RequestId }`。失败时 SDK 抛错 → 收敛为 `TokenConfigError`。

**备选：** 手写 TC3-HMAC-SHA256 签名零依赖。否决：需自行维护签名、时钟偏移、错误码映射，且 AGENTS.md 边界已确认可引依赖。
**备选：** 调用本机 `tccli`。否决：要求额外的 CLI 安装与配置，且与 `bl`（aliyun）的既有工具链叠加更重。

### 2. 凭据：环境变量，profile 结构不变

`queryUsage` 首步读环境变量：`TENCENTCLOUD_SECRET_ID`、`TENCENTCLOUD_SECRET_KEY` 任一缺失/为空 → `fail`（不构造 client、不发请求），文案写明缺失的变量名并给出 `TENCENTCLOUD_REGION`（默认 `ap-guangzhou`）与 TokenHub 控制台地址。请求失败时文案不得包含 SecretKey。

**边界说明：** 历史规格对 `sync-model-list` 的「不得读取 `TENCENTCLOUD_*`」约束保持不动（那是模型列表同步的约束，测试已覆盖）；本变更只让 `usage` 读取这些变量，帮助文案也只在 usage 语境提及。

### 3. 测试注入缝：可替换的「查询执行器」

SDK 自走真实 HTTP，`setHttpFetch` 拦不到。在 tencent 模块内新增与 `setHttpFetch` 同构的钩子（`platforms/tencent.ts` 内私有，导出 getter/setter 仅测试用，或经 `http.ts` 同款接口提供）：默认执行器 = 构造 SDK client 调 `DescribeTokenPlanList`；测试注入假执行器返回固定的 `TokenPlanSet` / 抛错。这样可覆盖：缺 env（不调用执行器）、成功渲染、请求失败、空 `TokenPlanSet`、raw 输出、多 profile 去重。

### 4. 同一轮多 tencent profile 去重

与 aliyun 的 `blUsagePromise` 同款：模块级单飞 promise，首个 tencent 目标触发，其余 tencent 目标复用同一份结果。凭据在同一进程内一致（env 只在启动时读一次并缓存于 client 构造前）。

### 5. 渲染

- table：列 `套餐`（`Name`，缺失用 `TeamId`）、`类型`（`ProductType`：`enterprise`→`专业套餐（积分）`、`enterprise-auto`→`轻享套餐（token）`、其它取值原样显示、缺失→`-`）、`状态`（`Status`）、`总额度`（`PackageInfo.TotalQuota`）、`已用`（`PackageInfo.TotalUsed`）、`当期额度`（`PackageInfo.CycleQuota`）、`到期时间`（`PackageInfo.ExpireTime` 原值），每个套餐一行；缺字段 `cell()` 填 `-`。空 `TokenPlanSet` → 输出单行「未找到 TokenPlan 套餐」（success 段，不渲染表头）。
- text：`腾讯云 TokenHub 套餐余量` 标题 + 每套餐一组标签行（名称+类型+状态+总额度+已用+当期额度+到期时间）。
- raw：`formatRaw(DescribeTokenPlanList 响应根对象)`（含 `TokenPlanSet` / `TotalCount` / `RequestId`）。

### 6. 动态导入 SDK

仅在查询 tencent 时 `await import("tencentcloud-sdk-nodejs-tokenhub")`，避免其它平台/命令（如 `token list`）加载 SDK 与启动开销。

### 7. 依赖与版本

`packages/token-config/package.json` 的 `dependencies` 增加 `tencentcloud-sdk-nodejs-tokenhub`（`^4.1.315`，实现时用 `pnpm --filter @agent-cli-toolkit/token-config add tencentcloud-sdk-nodejs-tokenhub` 取最新并写入 lockfile）。此前已向用户确认新增运行时依赖。

## Risks / Trade-offs

- **SDK 是新产品（v20260322），接口可能演进** → 缓解：只依赖 `DescribeTokenPlanList` 的稳定字段，缺失字段按 `-` 处理；未知结构时 text/table 至少给出可辨认输出，raw 原样透传。
- **SDK 体积/加载开销** → 缓解：动态 import 按需加载；查询是低频命令。
- **region 语义不明确**（endpoint 固定、API 或与 region 无关）→ 缓解：`TENCENTCLOUD_REGION` 可覆盖、默认 `ap-guangzhou`；若某 region 鉴权异常，用户可自行覆盖，无需改代码。
- **测试无法真实调腾讯云** → 缓解：注入缝让全部路径离线可测；真实凭据验证列为手动验收项（tasks 中标记）。
- **凭据缺失的体验**（用户可能不熟 TC3）→ 缓解：失败文案给出具体缺失变量名、region 覆盖方式与控制台入口。

## Migration Plan

无数据迁移：profile 结构不变，`token-profile.json` 不受影响。升级即可用（设置三个环境变量后 `token usage` 即对 tencent profile 生效）。回滚：移除依赖、还原 `tencent.ts` / 帮助文案即可，不影响既有 profile 与其它平台查询。