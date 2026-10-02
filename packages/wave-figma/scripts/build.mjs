// Bundles the wave-figma CLI into one file that runs with plain Node 20+,
// with Tailwind's stylesheets inlined, so an engineer downloads it from Post-it
// and needs nothing installed except Playwright (for rendering).
//
//   node packages/wave-figma/scripts/build.mjs [out]
//
// Default out: packages/wave-figma/dist/wave-figma.mjs. Post-it's build copies
// it to public/wave/wave-figma.mjs.
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const require = createRequire(import.meta.url);
const tw = dirname(require.resolve("tailwindcss/package.json"));
const sheets = Object.fromEntries(["index.css", "theme.css", "preflight.css", "utilities.css"].map((f) => [f, readFileSync(join(tw, f), "utf8")]));
const out = process.argv[2] ?? here("../dist/wave-figma.mjs");

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
  plugins: [
    {
      name: "inline-tailwind",
      setup(b) {
        b.onResolve({ filter: /tailwind-css$/ }, () => ({ path: "tailwind-css", namespace: "inline" }));
        b.onLoad({ filter: /.*/, namespace: "inline" }, () => ({
          loader: "js",
          contents: `const sheets = ${JSON.stringify(sheets)};
export function tailwindStylesheet(id) {
  const file = id === "tailwindcss" ? "index.css" : id.replace(/^tailwindcss\\//, "");
  const s = sheets[file.endsWith(".css") ? file : file + ".css"];
  if (s === undefined) throw new Error("No Tailwind stylesheet " + id);
  return s;
}`,
        }));
      },
    },
  ],
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, result.outputFiles[0].contents, { mode: 0o755 });
console.log(`${out}: ${(result.outputFiles[0].contents.length / 1024).toFixed(0)} KB`);
