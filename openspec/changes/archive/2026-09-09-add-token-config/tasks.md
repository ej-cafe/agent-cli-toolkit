## 1. 包脚手架

- [x] 1.1 新增 `packages/token-config`（`package.json`、`tsconfig.json`、`src/index.ts`），风格对齐 `packages/core`（ESM、对 `@agent-cli-toolkit/core` 使用 `workspace:`、相对导入带 `.js`），并确认仓库根目录 `pnpm install` 成功
- [x] 1.2 把该包接入根 `tsconfig.json` 的 references，以及 `packages/commands` 的 `package.json` 与 `tsconfig` 引用；在尚未实现处理器前确认 `pnpm typecheck` 仍通过

## 2. Profile 存储

- [x] 2.1 实现 `token-profile.json` 在 `getConfigDir()` 下的读写，结构为 `{ profiles: { [name]: { platform, token, baseUrl, claudeBaseUrl?, models } } }`，采用临时文件再 rename 的原子写入，首次写入时创建文件；用临时 `XDG_CONFIG_HOME` 添加一套 profile 并读回文件来确认
- [x] 2.2 实现阿里云、腾讯云内置模型目录（`id` + `name`，内容见 design.md），并在添加时按 `platform` 写入 `models`；分别添加两套平台 profile，确认 `models` 含对应目录且非空
- [x] 2.3 实现添加（拒绝未知平台、空必填字段、重名）和按名删除（名称不存在则失败，其它 profile 保留）；用 CLI 或针对 store 的小脚本验证这些错误路径

## 3. 应用适配器

- [x] 3.1 实现 Claude 兼容地址辅助函数（`claudeBaseUrl` 非空则用之，否则用 `baseUrl`），以及 Claude Code 适配器：仅合并写入 `~/.claude/settings.json` 的 `env.ANTHROPIC_AUTH_TOKEN` / `env.ANTHROPIC_BASE_URL`；用临时 `HOME` 确认 `hooks` 和其它 `env` 键被保留
- [x] 3.2 实现 OpenCode 适配器：在 XDG OpenCode 配置中合并写入 `provider.bailian` / `provider.tencent` 的 `options.apiKey` / `options.baseURL`，并按 profile.`models` upsert `models`（保留已有条目的其它字段）；仅在新建 provider 时把 `npm` 设为 `@ai-sdk/anthropic`；用临时 `XDG_CONFIG_HOME` 确认新模型键出现、已有 `options` 仍在、其它 provider 仍在

## 4. CLI 命令

- [x] 4.1 实现 `agent-cli token add` 与 `token delete`（标志见规格），由 `packages/commands` 的 `run()` 分发；用临时配置目录验证成功与失败路径符合规格
- [x] 4.2 实现 `agent-cli token use <name>`：支持 `--all`、可重复 `--tool`、拒绝未知工具、profile 不存在则中止；两者都未传时用 `readline` 多选；确认 `--all` 更新两个工具文件、`--tool claude-code` 不改 OpenCode、空选择以非 0 退出且不写文件
- [x] 4.3 更新 `printHelp()`（中文说明、英文标志、提醒 `--token` 可能进入 shell 历史）；确认 `pnpm exec agent-cli --help` 列出 `token add`、`token delete`、`token use`、`--all` 和 `--tool`

## 5. 文档与检查

- [x] 5.1 更新 `README.md`：补充 `token` 命令与配置文件位置（中文，不要写入密钥），并确认文档中的调用方式与 `--help` 一致
- [x] 5.2 在仓库根目录运行 `pnpm typecheck` 和 `pnpm build`，确认两者都通过
