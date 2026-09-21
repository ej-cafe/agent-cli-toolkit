## 1. Usage 按 profile 编排

- [x] 1.1 重写 `usage.ts`：移除 usage 的 `--platform`（传入则拒绝）；可选 `--name`；无 name 时按名排序查全部 profile 并分别输出；按 platform 分派 deepseek/kimi HTTP、aliyun `bl`（多套缓存一次）、tencent 失败；尽力而为 exit 码；无 profile 时提示并 0。确认：单 deepseek / 多套分别展示 / `--name` / 拒 `--platform` / 部分失败仍 0 / 空 profile

## 2. 文档

- [x] 2.1 更新 help、`token` 用法与 README：usage 按 profile、`--name`、无 `--platform`。确认 `pnpm build`、`pnpm typecheck` 与 `--help` 文案
