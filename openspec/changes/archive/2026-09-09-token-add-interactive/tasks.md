## 1. 交互式 add

- [x] 1.1 将 `runTokenAdd` 改为 async：必填标志齐全时不提问并直接写入；缺项且 `stdin.isTTY` 时用一次 `readline` 会话只问缺失字段（platform 接受 `1`/`2` 或 `aliyun`/`tencent`），未给 `--claude-base-url` 时再问可选地址（空行省略）；非 TTY 缺项立即失败。用临时 `XDG_CONFIG_HOME` 确认：全标志添加仍成功且无提示；无标志且非 TTY 立即非 0 且不写文件
- [x] 1.2 在 `runTokenCommand` 中 `await runTokenAdd`；在交互式终端用临时配置目录跑无标志 `token add` 并回答有效值，确认 profile 写入且 `claudeBaseUrl` 在空回答时被省略；再跑 `--name`+`--platform` 部分标志，确认不再询问这两项

## 2. 帮助与文档

- [x] 2.1 更新 `printHelp()` 与 `printTokenUsage()`，说明 `token add` 可省略标志并在交互式终端问答补齐；确认 `agent-cli --help` 仍列出 add/delete/list/use，并提到问答用法
- [x] 2.2 更新 `README.md` 中 `token add` 的调用说明（中文），与 `--help` 一致，并确认文档未写入真实密钥

## 3. 检查

- [x] 3.1 在仓库根目录运行 typecheck 与 build，确认两者都通过
