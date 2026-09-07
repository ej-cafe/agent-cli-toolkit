# agent-cli-toolkit

TypeScript 命令行工具集，运行在 Node.js 上，使用 pnpm monorepo。用于构建与管理 AI 代理应用，规划支持插件扩展与多环境部署。

## 要求

- Node.js >= 20
- pnpm 12（见根目录 `packageManager`）

## 使用

```bash
pnpm install
pnpm build
pnpm exec agent-cli --help
pnpm --filter @agent-cli-toolkit/cli dev
```

对外命令：`agent-cli`。首次运行会创建 `~/.config/agent-cli-toolkit`（若设置了 `XDG_CONFIG_HOME`，则为 `$XDG_CONFIG_HOME/agent-cli-toolkit`），全局配置统一存放于此。

## 参与贡献

1. Fork 本仓库
2. 新建功能分支
3. 提交代码
4. 新建 Pull Request
