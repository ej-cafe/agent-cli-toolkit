## 1. usage 命令

- [x] 1.1 新增 `commands/usage.ts`（及必要时薄封装调用 `bl`）：解析可选 `--platform`（默认 `aliyun`），拒绝 `tencent`/未知平台与多余参数；`execFile` 调用 `bl usage token-plan --output json`；缺 `bl`、无 console 登录、解析失败时 `fail` 并提示 `bl auth login --console`。用 PATH 去掉 `bl`、以及未登录的 `bl` 夹具确认非 0；有 mock/`--dry-run` 不可用时至少确认拒绝 `tencent` 与多余参数

- [x] 1.2 在 `runTokenCommand` 注册 `usage` 子命令；确认 `agent-cli token usage --help` 路径或未知子命令不会吞掉该 verb

## 2. 文档与检查

- [x] 2.1 更新 `printTokenUsage()`、`printHelp()` 与 README：列出 `token usage`，说明默认/`--platform aliyun`、仅百炼、依赖 `bl auth login --console`。确认 build 后 `--help` 出现 `usage`

- [x] 2.2 在仓库根目录运行 `pnpm typecheck` 与 `pnpm build`，确认两者都通过
