## 1. Store：按 profile 存 models

- [x] 1.1 从 `store.ts` 移除 `model-list.json` 相关 API（路径、读写、`ensurePlatformModels`、`syncPlatformModels`、平台扇出与多凭据轮询）。新增 `syncProfileModels(name)`：只用该 profile 凭据拉 `{baseUrl}/models`，成功则只更新该 profile 的 `models`。确认源码中不再引用 `model-list.json` / `modelListFilePath`
- [x] 1.2 改写 `addProfile`：始终用正在添加的凭据拉 `/models`，成功后只写入新 profile；失败则不写。用假 `fetch` 与临时配置确认：成功写入的 `models` 与接口一致；失败非 0 且不落盘；已有同平台 profile 时不改写其 `models`、也不复用其列表

## 2. sync-model-list 命令

- [x] 2.1 更新 `runTokenSyncModelList`：支持 `--name` 与 `--platform`；按 design 解析目标列表；逐个调用 `syncProfileModels`；多目标时成功保留、失败点名、整命令非 0。更新 `token.ts` 内嵌用法。用临时配置确认：`--name` 只更新该 profile；`--name`+不匹配 `--platform` 拒绝；`--platform` 只更新该平台；省略标志更新全部；无匹配目标 / 未知名 / 多余参数非 0；部分失败时成功项已写、命令非 0

## 3. 帮助与文档

- [x] 3.1 更新 `printHelp()`、`printTokenUsage()` 与 `README.md`：按 profile 同步、`--name`、`--platform` 为过滤器；去掉 `model-list.json` 与按平台共享目录表述。确认 `agent-cli --help` 含 `--name` 与按 profile `{baseUrl}/models`，且不含平台级 `model-list.json` / `TENCENTCLOUD_SECRET_*`

## 4. 检查

- [x] 4.1 在仓库根执行 `pnpm typecheck`（或等价包级检查）并通过
