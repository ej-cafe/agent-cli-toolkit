## Context

动机见 `proposal.md`。`apps/cli` 只负责启动进程并确保配置目录存在。`packages/commands` 用 `node:util` 的 `parseArgs` 解析参数，目前只处理 `--help` / `--version`。`packages/core` 已提供 `getConfigDir()` / `ensureConfigDir()`。仓库里没有测试框架或 CLI 框架。需求见 `specs/token-config/spec.md`。

## Goals / Non-Goals

**目标：**

- `apps/cli` 保持薄外壳；token 领域逻辑放进新建的 `packages/*` 包，由 `packages/commands` 分发。
- 合并写入用户 JSON 配置，使无关字段（Claude 的 `hooks`、OpenCode 模型条目上的额外 options）得以保留。
- 不新增运行时依赖（不用 Commander、Inquirer）。

**非目标：**

- 加密 `token-profile.json` 或使用系统钥匙串。
- 把已有 OpenCode provider id（例如 `bailian-token-plan`）迁移为 `bailian`。
- 内置官方默认云平台 baseUrl（调用方始终传入 `--base-url`）。
- 引入测试运行器。

## Decisions

### 1. 新建包 `@agent-cli-toolkit/token-config`

把存储、应用适配器和命令处理放在 `packages/token-config`。`packages/commands` 把 `token …` 路由到该包，并继续负责 help/version。

**原因：** AGENTS.md 要求按命令或领域分包；`apps/cli` 只做入口。token 读写不应放进 `core`（那里只负责通用配置目录）。

**备选：** 直接把逻辑堆进 `packages/commands`。否决：这是独立领域（凭据 + 第三方配置文件），后续还可能增加工具。

### 2. 用现有 `parseArgs` 做子命令路由

`run()` 查看位置参数：`token add | delete | use`。各处理器再用 `parseArgs` 解析自己的标志（`--name`、`--platform`、`--token`、`--base-url`、`--claude-base-url`、`--all`、可重复的 `--tool`）。未知的 `token` 动词打印用法并以非 0 退出。

**原因：** 不引入新 CLI 框架（AGENTS.md：先问）。项目已在用 `parseArgs`。

**备选：** Commander / yargs。否决：保持零新依赖。

### 3. `token-profile.json` 结构

```json
{
  "profiles": {
    "<name>": {
      "platform": "aliyun",
      "token": "…",
      "baseUrl": "https://…",
      "claudeBaseUrl": "https://…",
      "models": [
        { "id": "qwen3.8-max", "name": "qwen3.8-max" }
      ]
    }
  }
}
```

用户未传 `--claude-base-url` 时省略 `claudeBaseUrl`。名称作为对象键（不在对象内再存一份）。`models` 在 `token add` 时按 `platform` 从内置目录复制，不提供单独的模型增删命令。通过 `getConfigDir()` 读写；首次添加时创建文件；先写临时文件再 `rename`，避免崩溃留下截断 JSON。

内置目录为首版快照（文本/编程类模型 ID），来源：

- 阿里云百炼 Token Plan：[控制台模型说明](https://bailian.console.aliyun.com/cn-beijing?tab=doc#/doc/?type=model&url=3046858) 与 [个人版概述](https://help.aliyun.com/zh/model-studio/token-plan-personal-overview)（`qwen3.8-max`、`qwen3.8-flash`、`qwen3.7-max`、`qwen3.7-plus`、`qwen3.6-flash`、`deepseek-v4-pro`、`deepseek-v4-pro-0813`、`deepseek-v4-flash-0731`、`glm-5.2`）。不纳入图片/视频/语音模型。
- 腾讯云 TokenHub Token Plan：[个人版套餐概览](https://cloud.tencent.com/document/product/1823/130060)。同一 API Key 可用于通用与 Hy 两套套餐，故合并两者的主 Model ID：`tc-code-latest`、`deepseek-v4-flash-202605`、`deepseek-v4-pro-202606`、`minimax-m2.7`、`minimax-m3`、`glm-5`、`glm-5.1`、`glm-5.2`、`glm-5.3`、`glm-5.3-flash`、`hy4-preview`、`kimi-k2.7-code`、`kimi-k3`、`hy3`。每行多个 ID 时只存文档表格中的主 ID。

**原因：** 名称唯一、不必扫数组，符合「命名 profile」的用法。模型列表跟凭据一起存，切换时才能写进 OpenCode。

**备选：** profile 数组。否决：查重和按名删除更麻烦。

### 4. 应用适配器与 Claude 地址辅助函数

共享辅助：Claude 兼容地址 = 非空的 `claudeBaseUrl`，否则 `baseUrl`。

- Claude Code：`join(homedir(), ".claude", "settings.json")`，不用 XDG。解析对象（文件缺失则为 `{}`），确保 `env` 是对象，写入 `ANTHROPIC_AUTH_TOKEN` 与 `ANTHROPIC_BASE_URL` 后写回。不得改 `ANTHROPIC_MODEL` 或其它键（Claude Code 只接受单个默认模型，列表只维护在 profile / OpenCode）。
- OpenCode：`join(xdgConfigHome || join(homedir(), ".config"), "opencode", "opencode.json")`。确保 `provider` 是对象；确保 `provider[id]` 与 `provider[id].options` 是对象；写入 `apiKey` 和 `baseURL`。按 profile.`models` upsert `provider[id].models`：键为 `id`，写入/更新 `name`；已有条目的其它字段保留。不删除 OpenCode 中多出来的、不在 profile 里的模型键。provider id：`aliyun` → `bailian`，`tencent` → `tencent`。仅当新建且尚无 `npm` 时，把 `npm` 设为 `@ai-sdk/anthropic`。

JSON 用 2 空格缩进，贴近常见用户文件。

**原因：** 规格要求模型列表存在 profile 中，并落到 OpenCode 供切换。合并写入避免冲掉用户已配的 thinking / 模态字段。

**备选：** 整份覆盖 `models`。否决：会丢掉用户在 OpenCode 里加的额外 options。

### 5. 不用提示库的交互选工具

若 `use` 既没有 `--all` 也没有 `--tool`，打印带编号的 `claude-code` / `opencode`，用 `node:readline` 读一行。接受空格或逗号分隔的编号或 id。空输入、Ctrl-C 或没有有效选择 → 非 0 退出、不写文件。`--all` 与 `--tool` 同时出现时按 `--all` 处理。

**原因：** 规格要求提示；Node 20 的 `readline` 足够。

**备选：** Inquirer 多选。否决（新依赖）。

### 6. 错误与帮助

沿用 `apps/cli`：stderr 信息带 `toolkitName` 前缀，非 0 退出。根级 `--help` 列出 `token add` / `token delete` / `token use` 及 use 的标志（帮助正文中文，标志英文）。`--token` 仍为标志（规格要求）；帮助中应提醒该值可能出现在 shell 历史里。

在根 `tsconfig.json` 的 project references 以及 `packages/commands` 中登记新包（`commands` 依赖 `token-config`；`token-config` 依赖 `core`）。

## Risks / Trade-offs

- **写坏用户 JSON** → 缓解：解析、合并、原子 rename；绝不对字符串做正则替换。解析失败则中止该工具并保留原文件。
- **token 出现在 argv / 进程列表** → 缓解：规格要求用标志；在帮助中警告。首版不从 env 文件导入。
- **已有 OpenCode provider 名为 `bailian-token-plan` 时不会被更新** → 缓解：按约定写入 `bailian`。用户可能需要把 OpenCode 的当前 provider 切到 `bailian`。
- **云平台模型目录会变，内置快照会过期** → 缓解：目录集中在 `packages/token-config` 的常量中，后续只改该表；不在运行时抓取官网。
- **从零创建 OpenCode/Claude 文件时可能缺少工具自己的其它字段** → 缓解：凭据与模型 `name` 按规格写入，其余留给工具自己。
- **`--all` 时若 OpenCode 文件不存在仍会创建** → 缓解：符合规格「按需创建」；在帮助中说明。

## Migration Plan

全新 CLI 命令，无存量数据要迁。回滚即对本变更做 `git revert`；用户本机的 `token-profile.json` 和工具配置不在仓库内，不会随回滚还原。

没有会改变规格或本方案的未决问题。
