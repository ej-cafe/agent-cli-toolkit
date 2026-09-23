## 1. Unsupported usage copy

- [x] 1.1 更新 `tencent.ts` / `glm.ts` 的失败文案为「{中文名} 暂不支持 API 形式余额查询，请前往控制台查询。网址：{url}」（腾讯云 → TokenHub 控制台；智谱 GLM → bigmodel.cn/coding-plan/personal/usage）；`usage` 测试断言 stderr 含中文名与网址，且不发起 HTTP
- [x] 1.2 更新 `packages/commands` 帮助与 README 中「暂不支持」简述（指向控制台，可不贴完整 URL）；帮助相关测试通过

## 2. Verify

- [x] 2.1 根目录 `pnpm test` 与 `pnpm typecheck` 通过
