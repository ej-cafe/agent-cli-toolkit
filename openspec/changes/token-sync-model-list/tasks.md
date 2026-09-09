## 1. 模型目录存储

- [ ] 1.1 在 `getConfigDir()` 下实现 `model-list.json` 的读写（按 `aliyun`/`tencent` 分键，原子写入），以及按平台用内置目录覆盖该键并更新同平台全部 profile 的 `models`。用临时 `XDG_CONFIG_HOME`：先写一份含 `tencent` 的 JSON 再 sync `aliyun`，确认 `aliyun` 为内置列表且 `tencent` 未改
- [ ] 1.2 将 `addProfile` 改为经 `ensurePlatformModels` 取列表：目录缺失或为空时写入内置目录；已有非空列表则原样使用。用临时配置确认：无文件时 add 会创建 `model-list.json` 且 profile.`models` 与之相同；预先写入自定义非空 `aliyun` 后再 add，profile 使用该自定义列表且 JSON 未被覆盖

## 2. sync-model-list 命令

- [ ] 2.1 实现 `token sync-model-list [--platform]` 并接到 `runTokenCommand`。用临时配置确认：`--platform aliyun` 只写阿里云键；无标志时两键都写；已有 `aliyun` profile 的 `models` 被更新、`tencent` profile 不变
- [ ] 2.2 拒绝未知 `--platform` 与多余位置参数：`--platform aws` 与 `sync-model-list extra` 均非 0、不写 `model-list.json`、不改 profile

## 3. 文档与检查

- [ ] 3.1 更新 `printHelp()`、`printTokenUsage()` 与 `README.md`，列出 `sync-model-list` 及 `--platform`；确认 `agent-cli --help` 仍含 add/delete/list/use 与 `--model`，并出现 `sync-model-list`
- [ ] 3.2 在仓库根目录运行 typecheck 与 build，确认两者都通过
