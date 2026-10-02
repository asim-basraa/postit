import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/**
 * Tailwind's own stylesheets, which its compiler imports. Read from
 * node_modules here; the bundled CLI replaces this module with the files
 * inlined (scripts/build.mjs), so it needs nothing installed.
 */
export function tailwindStylesheet(id: string): string {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve("tailwindcss/package.json", { paths: [process.cwd(), dirname(new URL(import.meta.url).pathname)] }));
  const file = id === "tailwindcss" ? "index.css" : id.replace(/^tailwindcss\//, "");
  return readFileSync(join(root, file.endsWith(".css") ? file : `${file}.css`), "utf8");
}
