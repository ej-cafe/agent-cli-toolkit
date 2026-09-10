## Context

动机见 `proposal.md`。行为见本变更 `specs/token-config/spec.md`。

`modelsForSync` 原先：`aliyun` → `catalog.ts`，`tencent` → TokenHub。本变更改为两平台都只打 `{baseUrl}/models`。`addProfile` 在写入前调用 `ensurePlatformModels`，此时新 profile 尚未落盘。无新依赖。

## Goals / Non-Goals

**目标：**

- `/models` 拉取与平台无关：`aliyun` 与 `tencent` 走同一实现。`--platform` 只筛选要同步的平台；省略时对全部已支持平台各跑一遍，不得跳过任一平台的 `/models`。
- 删除腾讯云 TokenHub 客户端与环境变量鉴权；腾讯云只从 `{baseUrl}/models` 取列表。
- `token add` 自动同步时把正在添加的凭据传进去。
- `aliyun` 与 `tencent` 在 `/models` 失败后都中止该平台写入，无内置回退。

**非目标：**

- 新增 `aliyun` / `tencent` 以外的平台类型。
- 给 `sync-model-list` 增加 `--base-url` / `--token` 标志。
- 使用 `claudeBaseUrl` 去请求 `/models`。
- 分页或过滤 `/models` 结果。
- 把内置模型表接回同步路径。

## Decisions

### 1. 请求形状

`GET` `{trimTrailingSlash(baseUrl)}/models`，头：`Authorization: Bearer <token>`、`Accept: application/json`。用可注入的 `fetch` 便于测试。HTTP 非 2xx、抛错、JSON 无法解析、没有 `data` 数组或数组为空 → 视为这次尝试失败，试下一组凭据。

解析：根对象的 `data` 必须是数组；每项 `id` 为非空字符串；`name` 若为非空字符串则用之，否则用 `id`。忽略无 `id` 的项；若过滤后仍为空则失败。

**原因：** 与用户说的 `baseUrl + /models` 及 OpenAI 兼容列表一致。

**备选：** 调 Anthropic `/v1/models`。否决：规格用 OpenAI `baseUrl`，不是 Claude 地址。

### 2. 凭据顺序与腾讯无回退

`/models` 是共享函数，入参只有 `baseUrl`/`token`。`syncPlatformModels(platform, extra?: { baseUrl, token })`：

1. 若有 `extra`，先试它。
2. 再按名称排序遍历该平台已保存 profile，跳过与已试过的 `(baseUrl, token)` 相同的项。
3. 任一成功即写入并返回。
4. 全失败：`fail`，不写该平台键、不改 profile。不得调用 TokenHub，不得用内置目录。

`runTokenSyncModelList` 保持现有循环：有 `--platform` 则一项，否则 `["aliyun", "tencent"]`。全量同步时若腾讯失败，已成功写入的 `aliyun` 可保留（与现有循环一致），但不得写 `tencent`。

`addProfile` 调用 `ensurePlatformModels(platform, { baseUrl, token })`。`sync-model-list` 不传 `extra`。

删除 `tencent-models.ts` 与 `catalog.ts` 及其引用；帮助与 README 去掉 `TENCENTCLOUD_*` 与内置目录说明。

**原因：** 用户要求去掉腾讯原先加载逻辑；网关 `/models` 已覆盖可用模型。

**备选：** `/models` 失败后再打 TokenHub。否决：本变更要移除该路径。

### 3. 失败即中止该平台

`/models` 失败不写该平台键。错误信息带上平台 id 与原因（HTTP 状态、超时、无法解析）。

**原因：** 内置表会过期；网关 `/models` 才是当前可用模型。

## Risks / Trade-offs

- **无腾讯 profile 时 `sync-model-list --platform tencent` 必然失败** → 缓解：先 `token add` 或保证已有该平台 profile；帮助说明腾讯云依赖 `{baseUrl}/models`。
- **网关 `/models` 返回非 token plan 全集** → 缓解：规格按接口结果写入。
- **全量同步时腾讯失败但阿里云已写入** → 缓解：与现有循环相同；错误信息指向腾讯云 `/models`。

## Migration Plan

删除 TokenHub 后，本机已有的 `TENCENTCLOUD_*` 不再被读取。下次腾讯同步必须能访问 profile 的 `{baseUrl}/models`。回滚 CLI 会重新引入 TokenHub，已用 `/models` 写入的 `model-list.json` 仍可留在配置目录。
