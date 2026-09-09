## 1. OpenCode 适配器

- [x] 1.1 将 `applyOpenCode` 改为接收 profile `name`，以该 name 为 `provider` 键并写入显示名 `name`；删除 `openCodeProviderId`。用临时 `XDG_CONFIG_HOME` 应用名为 `work` 的 profile，确认写入 `provider.work`（含显示名、apiKey、baseURL、models）且不出现 `provider.bailian`
- [x] 1.2 在 `token use` 中把 profile 名称传给 `applyOpenCode`；用临时配置确认：已有 `provider.bailian` 时应用 `work` 不改 `bailian`；再应用另一套 `office` 时 `provider.work` 仍在

## 2. 文档与检查

- [x] 2.1 更新 `README.md` 中 OpenCode provider 的说明（按 profile 名称，不再写 `bailian` / `tencent` 作为写入目标），并确认文档未写入真实密钥
- [x] 2.2 在仓库根目录运行 typecheck 与 build，确认两者都通过
