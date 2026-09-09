## Why

用户需要在阿里云、腾讯云的多套 token / baseUrl 之间切换，并写进 Claude Code、OpenCode 的本地配置。当前 `agent-cli` 只有外壳与空配置目录，无法保存或应用这些凭据。

## What Changes

- 新增 token profile 的 **添加**、**删除** 命令。
- 在全局配置目录写入 `token-profile.json`，保存多套命名配置（含平台内置的支持模型列表）。
- 新增切换命令：`--all` 同步全部已对接工具，或在命令行选择 Claude Code / OpenCode。
- 切换 Claude Code 时，只更新 `~/.claude/settings.json` 的 `env` 中相关变量，其余字段保持不变。
- 切换 OpenCode 时，更新 `~/.config/opencode/opencode.json` 中对应 provider 的 `options.apiKey`、`options.baseURL` 以及 `models`（阿里云 `bailian`，腾讯云 `tencent`）。
- 更新 `agent-cli --help`，列出新命令。

非目标：其它云平台、其它 agent 工具、加密存储、密钥入库、新增 CLI 框架或测试工具链。

## Capabilities

### New Capabilities

- `token-config`: 维护云平台 token profile，并切换到 Claude Code / OpenCode 的本地配置

### Modified Capabilities

- （无。`openspec/specs/` 尚无既有能力规格。）

## Impact

- 对外 CLI 新增 `token` 子命令（add / delete / use），属新公共接口。
- 命令实现按领域放入 `packages/*`（现有解析在 `packages/commands`）；`apps/cli` 仍只做入口与配置目录。
- 读写用户主目录下的 Claude Code、OpenCode 配置文件；不改仓库内业务代码以外的密钥文件。
- 不新增运行时依赖或 CLI 框架；交互选择用 Node 内置 `readline`。
- 无既有调用方，无破坏性变更。
