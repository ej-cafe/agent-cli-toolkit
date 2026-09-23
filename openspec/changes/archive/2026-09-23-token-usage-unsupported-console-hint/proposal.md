## Why

`token usage` 对暂不支持 API 查询的平台（当前为 `tencent`、`glm`）只提示「暂不支持…」，用户不知道去哪查余额。需要给出中文平台名与控制台网址，便于自行查询。

## What Changes

- 不支持 API 余额查询的平台，stderr 文案统一为：  
  `{中文平台名} 暂不支持 API 形式余额查询，请前往控制台查询。网址：{控制台 URL}`
- 当前映射（规划约定）：
  - `tencent` → 腾讯云，`https://console.cloud.tencent.com/tokenhub`
  - `glm` → 智谱 GLM，`https://bigmodel.cn/coding-plan/personal/usage`
- 仍不发起外部请求；退出码与「套失败」语义不变。
- 帮助 / README 中「tencent / glm 暂不支持」可改为简述上述提示（含导向控制台），不必贴出完整两行 URL。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: `token usage` 对不支持平台的失败文案；相关场景与帮助措辞。

## Impact

- 代码：`packages/token-config/src/platforms/tencent.ts`、`glm.ts`（及测试）；可选 `help.ts` / README。
- 无新依赖；不影响已支持 usage 的 `aliyun` / `deepseek` / `kimi`。
