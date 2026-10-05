// Bundles the wave-test CLI into one file that runs with plain Node 20+, so an
// engineer (or CI) downloads it from Post-it and needs nothing installed
// except Playwright with Chromium.
//
//   node packages/wave-test/scripts/build.mjs [out]
//
// Default out: packages/wave-test/dist/wave-test.mjs. Post-it's build copies
// it to public/wave/wave-test.mjs.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const out = process.argv[2] ?? here("../dist/wave-test.mjs");

const result = await build({
  entryPoints: [here("../src/bin.ts")],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: ["node20"],
  external: ["playwright"],
  legalComments: "none",
  minify: true,
  define: { "process.env.NODE_ENV": '"production"' },
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, result.outputFiles[0].contents, { mode: 0o755 });
console.log(`${out}: ${(result.outputFiles[0].contents.length / 1024).toFixed(0)} KB`);
