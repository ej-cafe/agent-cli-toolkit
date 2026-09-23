## Context

See proposal.md — Why。`tencent` / `glm` 的 `queryUsage` / `formatUsage` 目前直接 `fail("暂不支持…\n")`；`usage.ts` 把错误写成 `{profile}: {message}`。

## Goals / Non-Goals

**Goals:**

- 统一不支持平台的失败文案模板与中文名、控制台 URL。
- 更新相关测试与帮助简述。

**Non-Goals:**

- 不实现任何余额 HTTP 查询。
- 不改支持 usage 的平台行为。
- 不因 URL 变更引入配置文件或运行时覆盖。

## Decisions

1. **文案模板（固定字符串）**  
   `{中文名} 暂不支持 API 形式余额查询，请前往控制台查询。网址：{url}`  
   各平台在模块内常量持有，避免运行时拼装出错。

2. **映射**  
   | id | 中文名 | URL |
   |----|--------|-----|
   | `tencent` | 腾讯云 | `https://console.cloud.tencent.com/tokenhub` |
   | `glm` | 智谱 GLM | `https://bigmodel.cn/coding-plan/personal/usage` |

3. **帮助**  
   简述「腾讯云 / 智谱 GLM 暂不支持 API 余额查询，请前往控制台」，不必在 help 里贴完整 URL（详细 URL 只出现在 usage 失败 stderr）。

## Risks / Trade-offs

- [控制台 URL 日后变更] → 常量集中，改一处即可；本变更不接远程配置。  
- [国际站 glm 用户看到中国站 Coding Plan 用量页] → 与中国站 Coding Plan 默认一致；国际站可后续再拆 URL。

## Migration Plan

纯文案变更，无数据迁移。
