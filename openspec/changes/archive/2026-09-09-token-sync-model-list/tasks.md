## 1. 模型目录存储

- [x] 1.1 在 `getConfigDir()` 下实现 `model-list.json` 的读写（按 `aliyun`/`tencent` 分键，原子写入），以及按平台覆盖该键并更新同平台全部 profile 的 `models`（阿里云用内置目录）。用临时 `XDG_CONFIG_HOME`：先写一份含 `tencent` 的 JSON 再 sync `aliyun`，确认 `aliyun` 为内置列表且 `tencent` 未改
- [x] 1.2 实现腾讯云 `DescribeModelList` 客户端（TC3 签名 + `fetch`，`Limit=100` 分页，映射 `ModelId`/`DisplayName`），密钥读 `TENCENTCLOUD_SECRET_ID`/`TENCENTCLOUD_SECRET_KEY`。用注入的假 `fetch` 确认：两页结果合并写入 `tencent` 键；缺密钥、HTTP 失败或空列表时不改 JSON
- [x] 1.3 将 `addProfile` 改为经 `ensurePlatformModels` 取列表：目录缺失或为空时走该平台同步；已有非空列表则原样使用。用临时配置确认：无文件时 add `aliyun` 会创建 JSON 且 profile.`models` 与之相同；预先写入自定义非空 `aliyun` 后再 add，JSON 不被覆盖。用假 `fetch` 确认：无 `tencent` 目录时 add `tencent` 会先请求接口再写入 profile；接口失败则不写 profile

## 2. sync-model-list 命令

- [x] 2.1 实现 `token sync-model-list [--platform]` 并接到 `runTokenCommand`。用临时配置确认：`--platform aliyun` 只写阿里云键；无标志时先写阿里云再（假接口）写腾讯云；已有 `aliyun` profile 的 `models` 被更新、`tencent` profile 在只 sync 阿里云时不变
- [x] 2.2 拒绝未知 `--platform`、多余位置参数、以及腾讯云缺密钥：`--platform aws`、`sync-model-list extra`、未设密钥时 `--platform tencent` 均非 0、不写对应 JSON 键、不改 profile

## 3. 文档与检查

- [x] 3.1 更新 `printHelp()`、`printTokenUsage()` 与 `README.md`，列出 `sync-model-list`、`--platform`，以及腾讯云环境变量；确认 `agent-cli --help` 仍含 add/delete/list/use 与 `--model`，并出现 `sync-model-list` 与 `TENCENTCLOUD_SECRET_ID`
- [x] 3.2 在仓库根目录运行 typecheck 与 build，确认两者都通过
