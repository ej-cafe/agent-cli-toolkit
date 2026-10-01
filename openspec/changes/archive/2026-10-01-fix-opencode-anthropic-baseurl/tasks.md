## 1. 实现核对与补齐

- [x] 1.1 核对 `packages/token-config/src/apply/opencode.ts` 的 `anthropicSdkBaseUrl()` 与 `applyOpenCode()` 满足规格三条规则（anthropic 包补 `/v1`、已带 `/v1` 不重复追加、非 anthropic 包原样写入），验证：`node --import tsx --test packages/token-config/test/apply.test.ts` 通过
- [x] 1.2 补一条断言覆盖「已有 provider 的 `npm` 为 `custom-npm` 时 `options.baseURL` 原样写入、不补 `/v1`」（`apply.test.ts` 中既有的 npm 保留用例上补断言即可），验证：该用例通过
- [x] 1.3 同步 `docker/scripts/assert-config.mjs` 的 A 路径期望值为「Claude 兼容地址按 anthropic 包补 `/v1`」，验证：`node --check docker/scripts/assert-config.mjs` 通过，且 A 流程断言段全过（`assert-config.mjs` 见 `docker/README.md`）

## 2. 回归

- [x] 2.1 验证 `pnpm build`、`pnpm typecheck`、`pnpm test` 全部通过（`test` 需 0 fail）
- [x] 2.2 端到端复核：按 `docker/README.md` 各跑一次 A、B 两个 compose 服务，验证四家工具「写入 + 真跑」均成功、opencode 不再出现 `HTTP 404`（需真实凭据与网络）

## 3. 归档

- [x] 3.1 确认 `docker/README.md` 与新规格口径一致（A 路径 `baseURL` 需自带 `/v1` 的说明、无残留「已知缺陷未修复」表述），验证：通读该节无冲突
- [x] 3.2 归档本 change，把 delta 同步进 `openspec/specs/token-config/spec.md`，验证：主规格 `更新 OpenCode 的 provider` 含 `/v1` 规则与 `npm` 取值规则，且 `openspec validate fix-opencode-anthropic-baseurl` 与 `openspec validate token-config --type spec` 均通过（不用 `--strict`：本项目中文规格一律用「必须」，`--strict` 的 RFC 2119 英文关键词警告是既有全量现象）
