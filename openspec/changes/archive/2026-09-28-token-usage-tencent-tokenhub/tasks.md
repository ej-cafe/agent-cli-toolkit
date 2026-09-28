## 1. 依赖与环境

- [x] 1.1 在 `packages/token-config` 通过 `pnpm --filter @agent-cli-toolkit/token-config add tencentcloud-sdk-nodejs-tokenhub` 加入官方 SDK 依赖；确认 `package.json` 的 `dependencies` 与 `pnpm-lock.yaml` 已更新且 `pnpm install` 无报错
- [x] 1.2 确认可在 ESM（NodeNext）下 `import { tokenhub } from "tencentcloud-sdk-nodejs-tokenhub"` 并 `new tokenhub.v20260322.Client({ credential, region }).DescribeTokenPlanList({})` 通过类型检查（先写一个最小 smoke 片段，`pnpm typecheck` 通过后删除或保留为代码引用）

## 2. tencent 平台实现

- [x] 2.1 重写 `packages/token-config/src/platforms/tencent.ts` 的 `queryUsage`：先读 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`（任一缺失或为空即 `fail`、不构造 client、不发请求，错误文案包含缺失变量名、`TENCENTCLOUD_REGION` 覆盖说明与 TokenHub 控制台地址）；动态 `import` SDK 并按 `TENCENTCLOUD_REGION`（默认 `ap-guangzhou`）构造 client；调用 `DescribeTokenPlanList({})` 返回响应根对象；SDK 抛错收敛为带「腾讯云 TokenHub」前缀的 `TokenConfigError`，任何输出不得包含 SecretKey
- [x] 2.2 为 tencent 实现 `formatUsage` 三态：`table` 列 `套餐`/`类型`/`状态`/`总额度`/`已用`/`当期额度`/`到期时间`（`类型` 按 `ProductType` 映射 `enterprise`→`专业套餐（积分）`、`enterprise-auto`→`轻享套餐（token）`、其它取值及缺失一律 `-`；缺字段用 `cell()` 填 `-`；`套餐` 缺名用 `TeamId`；每个套餐一行）；`text` 为「腾讯云 TokenHub 套餐余量」标题 + 每组标签行；`raw` 用 `formatRaw(响应根对象)`（含 `TokenPlanSet`，不拆层）；`TokenPlanSet` 为空数组时输出「未找到 TokenPlan 套餐」的成功段（任意 output）
- [x] 2.3 在 tencent 模块内提供与 `http.ts setHttpFetch` 同风格的测试注入缝（默认真实执行器 = 构造 SDK client + `DescribeTokenPlanList`；测试可注入假执行器/假异常），并确认 `queryUsage`/`formatUsage` 签名与 `TokenPlatform` 接口一致（`platforms/registry.ts` 注册不变）
- [x] 2.4 同一轮命令中多个 tencent profile 只触发一次 SDK 查询：模块级 promise 单飞（对齐 aliyun 的 `blUsagePromise`），各 tencent profile 复用同一份响应分别渲染

## 3. 测试

- [x] 3.1 更新 `packages/token-config/test/usage.test.ts` 中原「腾讯云拒绝」用例与断言（含 `returns 1 only when every segment fails` 中 tencent 语义）：改用注入缝覆盖——凭据齐全 + 假响应成功段（表头含 `套餐`/`类型`，含「专业套餐（积分）」）、凭据缺失（断言不调用执行器、stderr 含缺失变量名、退出码非 0）、SDK 抛错（stderr 带 profile 名、含 TokenHub）、多 tencent profile 共享一次查询（断言执行器只调用一次）、空 `TokenPlanSet` 输出「未找到 TokenPlan 套餐」；确保这些用例经 `pnpm --filter @agent-cli-toolkit/token-config test`（根 `pnpm test`）通过且 `setHttpFetch` 未被 tencent 路径误用
- [x] 3.2 为 tencent 的 `formatUsage` 补 `raw` 输出断言（`--output raw` 段内 JSON 含 `TokenPlanSet`），并按需在 `registry.test.ts` / 新增测试中覆盖 `ProductType` 映射与缺字段 `-` 的边界；`pnpm test` 通过
- [x] 3.3 确认 `glm` 平台行为未受影响（既有「拒绝 GLM」用例仍通过、不发 HTTP）；aliyun/deepseek/kimi 用例保持通过

## 4. 帮助与文档

- [x] 4.1 更新 `packages/commands/src/help.ts` 的 `token usage` 文案与介绍：说明 tencent 查询 TokenHub 套餐余量需 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`（`TENCENTCLOUD_REGION` 可覆盖、默认 `ap-guangzhou`）、凭据缺失提示设置或前往控制台；仅 `glm` 仍「暂不支持、前往控制台」；不得再把腾讯云列为暂不支持平台；确认 `packages/commands/test/help.test.ts` 与 `agent-cli --help` 产出符合
- [x] 4.2 更新根 `README.md` 的 token usage 段落与平台表格：tencent 行为/凭据说明（含 env 变量），保留 glm 控制台说明；README 中不再把腾讯云列为「-」不支持行

## 5. 验证

- [x] 5.1 仓库根目录 `pnpm typecheck` 与 `pnpm test` 全部通过（含 help 测试与既有 token-config 测试）
- [x] 5.2 手动（可选，需真实凭据）：设置 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY` 后对真实 tencent profile 执行 `agent-cli token usage --name tx`，确认输出套餐表格且不打印 SecretKey；无凭据时确认 stderr 提示缺失变量名。若环境无凭据则记录为待验收项
  - 本机 shell 已有真实 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`，已用真实 SDK 走通：真实账户无 TokenPlan → 成功段「未找到 TokenPlan 套餐」（exit 0）与 `--output raw` 打印真实响应根对象（`TokenPlanSet`/`TotalCount`/`RequestId`，无 SecretKey）；伪造 KEY 触发真实 `AuthFailure.SignatureFailure` 并被收敛为带「腾讯云 TokenHub 查询失败」前缀的 stderr；`env -u` 强制无凭据 → 缺失变量名提示（exit 1）；两 tencent profile 共享一份结果分段输出。非空套餐表格渲染由注入缝单测覆盖

## 6. 个人版 productType 判定（追加需求）

- [x] 6.1 更新 delta spec「查询套餐余量」tencent bullet：新增 profile 的 `productType` 前置校验句（仅 `enterprise` / `enterprise-auto` 允许查询；缺失或其它取值计为失败、不发请求、提示「个人版暂不支持查询」）；四个既有 tencent 查询场景 WHEN 补 `productType: enterprise`；新增场景「腾讯云个人版暂不支持查询」；`openspec validate` 通过
- [x] 6.2 `TokenProfile` 增加可选 `productType?: string`；`store.ts parseProfile` round-trip 读取 `value.productType`；`tencent.ts queryUsage` 在凭据检查前调用 `checkTencentProductType`（不发任何请求）
- [x] 6.3 测试：`usage.test.ts` 所有 tencent fixture 改经 `tencentProfile()`（默认 `productType: "enterprise"`），新增两用例（productType 缺失 / 为 `personal` → stderr 含「个人版暂不支持查询」、不调用执行器、exit 1）；help.test.ts 补断言；`pnpm test` 全绿
- [x] 6.4 update `packages/commands/src/help.ts` 与根 `README.md`：tencent 说明增加 productType 要求与「个人版暂不支持查询」；端到端冒烟确认（real 凭据 enterprise → 真实 TokenHub 空套餐成功段；personal / 缺失 → 拒绝 exit 1）
- [x] 6.5 `token add` 支持 `--product-type`（仅 tencent；缺省 `personal` 个人版，可用 `enterprise` / `enterprise-auto`，其它取值报错且不保存；TTY 交互对 tencent 额外询问套餐类型，默认回车 personal）；`store.addProfile` 落盘 `productType`；spec 新增场景「token add 为腾讯云写入默认 productType」并在帮助信息需求补 `--product-type` 说明；`token.test.ts` 新增 4 用例；help/README 补 `--product-type`；端到端冒烟（add 默认 personal → usage 个人版拒绝 exit 1；add `--product-type enterprise-auto` → 真实 TokenHub 成功段 exit 0）