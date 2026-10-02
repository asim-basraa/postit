// Spike: Figma MCP reference code (React + Tailwind) -> static HTML + CSS, deterministically.
// usage: node convert.mjs <in.jsx> <tokens.json> <out.html> <assetMap.json>
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import * as esbuild from "esbuild";
import { compile } from "tailwindcss";

const [, , inFile, tokensFile, outFile, assetMapFile] = process.argv;
const require = createRequire(import.meta.url);
let src = readFileSync(inFile, "utf8");

// 1. Assets: temporary Figma URLs -> the copies we hold.
const assetMap = assetMapFile ? JSON.parse(readFileSync(assetMapFile, "utf8")) : {};
src = src.replace(/const (\w+) = `\$\{assetPathPrefix\}\/([^`]+)`;/g, (_m, name, file) => `const ${name} = ${JSON.stringify(assetMap[file] ?? file)};`);

// 2. Render the JSX exactly as Figma wrote it.
const js = (await esbuild.transform(src, { loader: "jsx", jsx: "automatic", format: "esm" })).code;
const dir = mkdtempSync(join(tmpdir(), "wf-"));
const mod = join(dirname(inFile), `.render-${Date.now()}.mjs`);
writeFileSync(mod, js);
const React = await import("react");
const { renderToStaticMarkup } = await import("react-dom/server");
const Component = (await import(pathToFileURL(mod).href)).default;
let body = renderToStaticMarkup(React.createElement(Component));

// 3. Compile the Tailwind classes that occur, nothing else.
const candidates = new Set();
for (const m of body.matchAll(/class="([^"]*)"/g)) for (const c of m[1].replace(/&#x27;/g, "'").replace(/&amp;/g, "&").split(/\s+/)) if (c) candidates.add(c);
const tw = dirname(require.resolve("tailwindcss/package.json"));
const compiler = await compile(`@import "tailwindcss";`, {
  base: tw,
  loadStylesheet: async (id, base) => {
    const p = id === "tailwindcss" ? join(tw, "index.css") : id.startsWith("tailwindcss/") ? join(tw, id.slice(12)) : join(base, id);
    return { path: p, base: dirname(p), content: readFileSync(p, "utf8") };
  },
});
let css = compiler.build([...candidates]);

// 4. Tokens: Figma variable path -> DTCG path -> CSS custom property.
const tokens = JSON.parse(readFileSync(tokensFile, "utf8"));
const flat = new Map();
(function walk(o, path, type) {
  for (const [k, v] of Object.entries(o)) {
    if (k.startsWith("$")) continue;
    const t = v.$type ?? type;
    if (v && typeof v === "object" && "$value" in v) flat.set([...path, k].join("."), { value: v.$value, type: t });
    else if (v && typeof v === "object") walk(v, [...path, k], t);
  }
})(tokens, [], null);
const toCss = (value, type) => {
  if (value && typeof value === "object" && "unit" in value) return `${value.value}${value.unit}`;
  if (Array.isArray(value)) return type === "cubicBezier" ? `cubic-bezier(${value.join(",")})` : value.map((f) => (/\s/.test(f) ? `"${f}"` : f)).join(", ");
  return String(value);
};
const report = { mapped: {}, notInDtcg: {}, valueMismatch: [], hardcoded: [] };
const unescape = (s) => s.replace(/\\\//g, "/");
const usedVars = new Map();
// Figma writes var(--a\/b\/c,fallback). Match both the escaped and the plain form.
const VAR = /var\(--((?:[\w-]|\\\/)+),\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
css = css.replace(VAR, (_m, rawName, fallback) => {
  const figma = unescape(rawName);
  const dtcg = figma.replace(/\//g, ".");
  const tok = flat.get(dtcg);
  if (!tok) {
    report.notInDtcg[figma] = fallback.trim();
    return fallback.trim();
  }
  const name = `--${dtcg.replace(/\./g, "-")}`;
  usedVars.set(name, toCss(tok.value, tok.type));
  report.mapped[figma] = dtcg;
  const fv = fallback.trim().toLowerCase();
  const tv = toCss(tok.value, tok.type).toLowerCase();
  const px = (s) => (/^-?[\d.]+rem$/.test(s) ? parseFloat(s) * 16 + "px" : s);
  const norm = (s) => s.replace(/^white$/, "#ffffff").replace(/rgba\(255,\s*255,\s*255,\s*0\.92\)/, "#ffffffeb");
  if (norm(px(tv)) !== norm(fv) && !(fv === "9999px")) report.valueMismatch.push({ figma, figmaValue: fallback.trim(), dtcgValue: toCss(tok.value, tok.type) });
  return `var(${name})`;
});

// 5. Figma font names ('Geist:SemiBold', 'Geist_Mono:Medium') -> CSS families.
css = css.replace(/'([A-Za-z_ ]+):[A-Za-z ]+'/g, (_m, fam) => `"${fam.replace(/_/g, " ")}"`);
const families = [...new Set([...readFileSync(inFile, "utf8").matchAll(/'([A-Za-z_ ]+):[A-Za-z]+'/g)].map((m) => m[1].replace(/_/g, " ")))];

// 6. Raw values Figma did not bind to a variable (the token promise).
for (const m of readFileSync(inFile, "utf8").matchAll(/(rounded|bg|border|text|gap|p[xytrbl]?|m[xytrbl]?|tracking|leading)-\[(-?[\d.]+px|#[0-9a-f]{3,8})\]/gi)) report.hardcoded.push(m[0]);
report.hardcoded = [...new Set(report.hardcoded)];

const root = `:root{${[...usedVars].map(([k, v]) => `${k}:${v}`).join(";")}}`;
const fontsHref = process.env.FONTS_CSS ?? `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;500;600`).join("&")}&display=block`;
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="${fontsHref}">
<style>${root}
html,body{margin:0;width:100%;height:100%}
${css}</style></head>
<body>${body}</body></html>`;
writeFileSync(outFile, html);
writeFileSync(outFile.replace(/\.html$/, ".report.json"), JSON.stringify({ families, ...report }, null, 1));
console.log(JSON.stringify({ bytes: html.length, classes: candidates.size, mapped: Object.keys(report.mapped).length, notInDtcg: Object.keys(report.notInDtcg).length, valueMismatch: report.valueMismatch.length, hardcoded: report.hardcoded.length, families }));
