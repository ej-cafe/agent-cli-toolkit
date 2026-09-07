# agent-cli-toolkit

A TypeScript CLI toolkit that runs on Node.js and is organized as a pnpm monorepo. It helps developers build and manage AI agent apps, with planned support for plugins and multi-environment deployment.

## Requirements

- Node.js >= 20
- pnpm 12 (see `packageManager` in the repo root)

## Usage

```bash
pnpm install
pnpm build
pnpm exec agent-cli --help
pnpm --filter @agent-cli-toolkit/cli dev
```

The public command is `agent-cli`. The first run creates `~/.config/agent-cli-toolkit` (or `$XDG_CONFIG_HOME/agent-cli-toolkit` when `XDG_CONFIG_HOME` is set). Global configuration is stored there.

## Contributing

1. Fork this repository
2. Create a feature branch
3. Commit your changes
4. Open a Pull Request
