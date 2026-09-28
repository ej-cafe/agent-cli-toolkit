## Why

`token usage` 对腾讯云目前只提示「暂不支持 API 形式余额查询，请前往控制台」，用户查 TokenHub token plan 余量必须离开 CLI。腾讯云 TokenHub 已提供官方 OpenAPI（`tokenhub.tencentcloudapi.com`，版本 `2026-03-22`，可经腾讯云标准 TC3 签名与 SecretId/SecretKey 调用），把这条路径接到 `agent-cli` 即可让 `token usage` 覆盖腾讯云。

## What Changes

- `token usage` 允许 `tencent` profile 查询 TokenHub token plan 余量，不再一律拒绝。
- 查询实现：官方 SDK `tencentcloud-sdk-nodejs-tokenhub`，调用 `DescribeTokenPlanList`（套餐列表 + 每套餐主额度包 `PackageInfo`）。
- 凭据：**读取环境变量** `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`，region 默认 `ap-guangzhou`、可用 `TENCENTCLOUD_REGION` 覆盖；不扩 `token-profile.json` 结构，不读 profile 的 Bearer token。
- 三个环境变量任一缺失/为空时，该 tencent profile 计为失败，stderr 给出可操作的下一步（设置环境变量或前往 TokenHub 控制台），不发起请求。
- 输出沿用现有多平台契约：`--output table|text|raw`，表格列 `套餐`、`状态`、`总额度`、`已用`、`当期额度`、`到期时间`；单位按套餐类型注明（企业版专业套餐为积分 credits，企业版轻享套餐为 token）。
- `glm` 保持不变（仍引导去控制台）；帮助与 README 相应更新，不再把腾讯云列为「暂不支持 API 查询」。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: 「查询套餐余量」需求里 `tencent` 从「一律失败并引导控制台」改为「经腾讯云 OpenAPI 查询套餐余量」；「帮助信息列出 token 命令」需求里 usage 的说明随之更新（腾讯云改为需环境变量凭据，仅有 `glm` 仍需控制台）。

## Impact

- 代码：`packages/token-config` 新增 tencent 平台实现（`platforms/tencent.ts` 与必要的 SDK 调用封装/测试注入缝），不扩 `store.ts` 的 profile 结构；`packages/commands` 帮助；根 README。
- 依赖：新增运行时依赖 `tencentcloud-sdk-nodejs-tokenhub`（官方包，AGENTS.md「新增运行时依赖先问」已确认）。
- 环境：查询腾讯云需要调用方已配置 `TENCENTCLOUD_SECRET_ID` / `TENCENTCLOUD_SECRET_KEY`（必要时 `TENCENTCLOUD_REGION`）；不向配置文件写任何腾讯云密钥。
- 保持不变：`token add` / `sync-model-list` 不读 `TENCENTCLOUD_*`、不调用 TokenHub（与既有规格约束一致）；`glm` 平台行为不变；aliyun（`bl`）/ deepseek / kimi 行为不变。