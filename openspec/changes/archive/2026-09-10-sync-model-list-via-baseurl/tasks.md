## 1. `/models` 拉取

- [x] 1.1 新增 OpenAI 兼容列表请求：`GET {trimTrailingSlash(baseUrl)}/models`，`Authorization: Bearer <token>`、`Accept: application/json`。解析根对象 `data` 数组，每项非空 `id`，`name` 为空则用 `id`；HTTP 非 2xx、抛错、无法解析或过滤后为空则返回失败。提供可注入 `fetch`。用假响应确认：成功映射 `id`/`name`；401 与空 `data` 视为失败且不抛到调用方

## 2. 同步与 add 接入

- [x] 2.1 扩展 `syncPlatformModels` / `ensurePlatformModels`：先试可选 `extra` 凭据，再按名称排序试该平台已保存 profile（跳过重复 `(baseUrl, token)`）；任一 `/models` 成功则写入该平台键并更新该平台全部 profile。`aliyun` 与 `tencent` 共用同一拉取。用临时配置确认：`--platform aliyun` 与 `--platform tencent` 各自写入接口列表；未传 `--platform` 时两平台都打 `/models` 并写入各自接口列表
- [x] 2.2 `/models` 全失败时该平台以非 0 结束、不写对应键、不改 profile。删除 `tencent-models.ts`、`catalog.ts` 及其引用。两平台都没有内置回退。用假 `fetch` 确认：无凭据或 `/models` 失败时非 0、不写文件，且不读取 `TENCENTCLOUD_*`
- [x] 2.3 `addProfile` 在目录缺失时把正在添加的 `baseUrl`/`token` 传给 `ensurePlatformModels`。用临时配置确认：`aliyun` 与 `tencent` 在 `/models` 成功时都用接口列表写入 JSON 与 profile；`/models` 失败则不写 profile；已有非空目录时仍不覆盖、不请求 `/models`

## 3. 帮助与文档

- [x] 3.1 更新 `printHelp()`、`printTokenUsage()` 与 `README.md`：说明指定 `--platform` 或省略全量同步时每个平台都请求 `{baseUrl}/models`，没有内置目录；去掉 `TENCENTCLOUD_*`。确认 `agent-cli --help` 含 `sync-model-list` 与 `{baseUrl}/models`，且不含 `TENCENTCLOUD_SECRET_ID`
