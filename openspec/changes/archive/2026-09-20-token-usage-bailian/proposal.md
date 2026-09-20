## Why

用户已用 `token-config` 管理阿里云/腾讯云 profile，但查套餐余量仍需离开 CLI、自己记百炼控制台或 `bl` 命令。百炼 Token Plan 余量只能经控制台鉴权查询；先把阿里云百炼这条路径接到 `agent-cli`，避免再记一套工具链。

## What Changes

- 新增 `agent-cli token usage`：查询当前阿里云百炼 Token Plan 套餐余量（订阅级，不绑定某个 profile 的 API Key）。
- 可选 `--platform aliyun`（默认 `aliyun`）；`tencent` 或其它平台必须拒绝并说明暂不支持。
- 依赖本机已安装的 `bl`（bailian-cli），且须已执行 `bl auth login --console`；未安装或未控制台登录时给出明确错误与下一步提示。
- 帮助与 README 补充该命令；不改 `token add` / `use` / `list` 等既有语义。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `token-config`: 新增「查询套餐余量」需求；扩展帮助列出 `token usage`。

## Impact

- 代码：`packages/token-config` 新增 usage 命令与 `bl` 调用封装；`packages/commands` 帮助；根 README。
- 运行时：外部前提 `bl`（PATH 可执行），控制台登录态由 `bl` 管理；不新增 npm 依赖，不把百炼控制台 cookie 写入本仓库配置。
- 非目标：腾讯云 Token Plan / Coding Plan 余量；不实现自有控制台 OAuth（本阶段只封装 `bl`）。
