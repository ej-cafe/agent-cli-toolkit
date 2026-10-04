import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [resolve(root, "apps/cli/src/main.ts")],
  outfile: resolve(root, "dist/main.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  legalComments: "none",
  banner: {
    js: [
      "import { createRequire as __createRequire } from 'node:module';",
      "const require = __createRequire(import.meta.url);",
    ].join("\n"),
  },
  logLevel: "info",
});
