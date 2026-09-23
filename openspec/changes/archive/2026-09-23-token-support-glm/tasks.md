## 1. Platform registration

- [x] 1.1 在 `types.ts` 把 `Platform` 加上 `glm`，并导出 Coding Plan 默认 `baseUrl` / `claudeBaseUrl` 常量；用类型检查确认引用处可编译
- [x] 1.2 新增 `platforms/glm.ts`（预设 + usage 暂不支持，文案对齐 tencent 模式），注册到 `registry.ts` 末尾（别名 `5`、`glm`）；`pnpm --filter @agent-cli-toolkit/token-config exec` 相关 registry 测试通过且 id 列表含 `glm`

## 2. Commands and docs

- [x] 2.1 扩展 add / sync / store 校验与交互菜单以接受 `glm`；补 add 省略 URL、显式覆盖、models 失败不写入的测试，以及 sync `--platform glm` 过滤测试
- [x] 2.2 usage 对 `glm` profile 失败且说明暂不支持、不发起 HTTP；补对应 usage 测试
- [x] 2.3 更新 `token` 子命令 hint、`packages/commands` 帮助与 README（平台列表、GLM Coding Plan 预设、可覆盖）；帮助相关测试断言含 `glm` 与预设说明

## 3. Verify

- [x] 3.1 根目录 `pnpm test` 与 `pnpm typecheck` 通过
