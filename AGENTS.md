# agent-cli-toolkit

TypeScript CLI，运行在 Node.js 上，用 pnpm workspace 组织。用于构建与管理 AI 代理应用；规划支持插件扩展与多环境部署。

本文件给编码代理。人类说明写在 README。只记录代理无法从代码直接发现的约定。

## 技术栈

- 语言：TypeScript（`strict`，ESM，`module` / `moduleResolution` 为 `NodeNext`）
- 运行时：Node.js（版本见根目录 `engines.node`）
- 包管理：只用 pnpm，禁止 npm / yarn
- 工作区：`apps/*` 放可运行应用，`packages/*` 放库；包之间用 `workspace:` 协议
- `apps/cli` 只做运行外壳（进程入口、全局配置目录）；命令的解析、调用和实现放在 `packages/*`，按命令或领域分包
- 作用域：`@agent-cli-toolkit/*`；对外命令是 `agent-cli`
- 相对导入必须带 `.js` 扩展名（即使源文件是 `.ts`）

## 命令

在仓库根目录：

```bash
pnpm install
pnpm build
pnpm typecheck
pnpm test
pnpm dev
pnpm exec agent-cli --help
pnpm --filter <package> <script>
```

开发用 `tsx` 跑源码；发布产物在各包 `dist/`。单测用 Node 内置 `node:test`（经 `tsx` 直跑 TS），放在各包 `test/` 目录（`*.test.ts`，不进 `tsc -b` 构建图）；测试间用临时 `XDG_CONFIG_HOME` / 环境变量隔离，不触真实用户配置。

## 工作方式

- 面向用户的文档用中文；代码标识符和 CLI 标志用英文。
- 改完后只更新会过期的命令与边界。不要复述目录树或 README。
- 远程是 Gitee：`git@gitee.com:galaxy-explorer/agent-cli-toolkit.git`，默认分支 `master`。
- 用户没要求就不要 commit / push。不要改 git config、force push 或跳过 hooks。

## 边界

**必须做**

- 改动保持最小，并与已有文件风格一致。
- 有可运行检查时，完成前执行并修到通过。
- 密钥、`.env`、凭据不入库。

**先问**

- 新增运行时依赖，或引入 CLI 框架、测试 / lint / 发布工具链。
- 改变对外 CLI 命令、插件接口或默认分支。

**禁止**

- 把 `package.json` 或源码里已经有的信息抄进本文件。
- 发明尚不存在的脚本命令并当作事实。
- 为了凑文档而生成空目录或占位实现。
