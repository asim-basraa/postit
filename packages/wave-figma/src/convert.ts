import { transform } from "sucrase";
import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { parseTokens, type TokenSet } from "@wave/spec";
import { tailwindStylesheet } from "./tailwind-css";

/**
 * Figma's reference code to a static HTML page, deterministically.
 *
 * `get_design_context` returns a React component styled with Tailwind classes,
 * with Figma variables written as `var(--color\/text\/primary, #111113)`. This
 * renders that component exactly as written, compiles only the classes it
 * uses, points every Figma variable at the project's token (or keeps Figma's
 * value and reports it), turns Figma font names into CSS families, puts in the
 * real SVG of each vector node, and marks component instances for Wave. No
 * markup is rewritten by hand or by a model.
 */

/** A component instance: its component, its variant properties (Type, State) and its text and boolean properties. */
export type InstanceInfo = { component: string; variant?: Record<string, string>; props?: Record<string, string | boolean> };

export type ConvertInput = {
  /** The reference code as get_design_context returned it. */
  code: string;
  /** The frame's size in Figma. */
  width: number;
  height: number;
  /** The project's DTCG token file (text), so Figma variables become token variables. */
  tokens?: string | null;
  /** SVG markup by Figma node id: the node's children are replaced by it. */
  svgByNode?: Record<string, string>;
  /** Asset URLs by the file name the reference code uses (`bde91.svg`). */
  assetUrls?: Record<string, string>;
  /** Component instances by node id. */
  instances?: Record<string, InstanceInfo>;
  /** @font-face rules (or a stylesheet link) for the fonts the page uses. */
  fontCss?: string;
  title?: string;
  /** Where it came from, written as a meta tag: figma:<fileKey>/<nodeId>. */
  source?: string;
};

export type ConvertReport = {
  classes: number;
  /** Figma variable paths that matched a token. */
  mapped: string[];
  /** Figma variables with no token of the same path, and the value used instead. */
  notInTokens: Record<string, string>;
  /** Figma variables whose fallback differs from the token's value. Figma is the truth, so the fallback is used. */
  valueMismatch: { figma: string; figmaValue: string; tokenValue: string }[];
  /** Font families the page uses. */
  families: string[];
  /** Asset references left pointing at Figma's temporary URLs. */
  unresolvedAssets: string[];
  instances: number;
  svgs: number;
};

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

/** Runs the reference component and returns its markup. */
export async function renderReference(code: string, assetUrls: Record<string, string> = {}): Promise<{ markup: string; unresolved: string[] }> {
  const unresolved: string[] = [];
  const src = code.replace(/const (\w+) = `\$\{assetPathPrefix\}\/([^`]+)`;/g, (_m, name: string, file: string) => {
    const url = assetUrls[file];
    if (!url) unresolved.push(file);
    return `const ${name} = ${JSON.stringify(url ?? `figma-asset:${file}`)};`;
  });
  // Sucrase is plain JavaScript, so the bundled CLI needs nothing native installed.
  const js = transform(src, { transforms: ["jsx", "imports"], jsxPragma: "__h", jsxFragmentPragma: "__F", production: true }).code;
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("module", "exports", "__h", "__F", js)(module, module.exports, React.createElement, React.Fragment);
  const Component = (module.exports.default ?? Object.values(module.exports)[0]) as React.ComponentType;
  if (typeof Component !== "function") throw new Error("The reference code has no component to render.");
  return { markup: renderToStaticMarkup(React.createElement(Component)), unresolved };
}

const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value ?? null;
const setAttr = (el: Element, name: string, value: string) => {
  const a = el.attrs.find((x) => x.name === name);
  if (a) a.value = value;
  else el.attrs.push({ name, value });
};

function walk(node: Node, fn: (el: Element) => void) {
  if ("tagName" in node) fn(node as Element);
  if ("childNodes" in node) for (const c of [...(node as Element).childNodes]) walk(c, fn);
}

/** A Figma variable's name for a CSS custom property: `color\/text\/primary` is color/text/primary. */
const VAR = /var\(--((?:[\w-]|\\\/)+),\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/g;
const unescapeName = (s: string) => s.replace(/\\\//g, "/");

function sameValue(a: string, b: string): boolean {
  const n = (s: string) => {
    let v = s.trim().toLowerCase().replace(/\s+/g, "").replace(/["']/g, "");
    if (v === "white") v = "#ffffff";
    if (v === "black") v = "#000000";
    const rgba = /^rgba?\((\d+),(\d+),(\d+)(?:,([\d.]+))?\)$/.exec(v);
    if (rgba) {
      const h = (x: string) => (+x).toString(16).padStart(2, "0");
      const al = rgba[4] === undefined ? "" : Math.round(+rgba[4] * 255).toString(16).padStart(2, "0");
      v = `#${h(rgba[1])}${h(rgba[2])}${h(rgba[3])}${al === "ff" ? "" : al}`;
    }
    if (/^#[0-9a-f]{8}$/.test(v) && v.endsWith("ff")) v = v.slice(0, 7);
    const rem = /^(-?[\d.]+)rem$/.exec(v);
    if (rem) v = `${+(+rem[1] * 16).toFixed(3)}px`;
    const px = /^(-?[\d.]+)px$/.exec(v);
    if (px) v = `${+(+px[1]).toFixed(3)}px`;
    return v;
  };
  const x = n(a), y = n(b);
  if (x === y) return true;
  // Lengths within a hundredth of a pixel are the same length.
  const pa = /^(-?[\d.]+)px$/.exec(x), pb = /^(-?[\d.]+)px$/.exec(y);
  return !!pa && !!pb && Math.abs(+pa[1] - +pb[1]) < 0.01;
}

export async function convertFigma(input: ConvertInput): Promise<{ html: string; report: ConvertReport }> {
  const { markup, unresolved } = await renderReference(input.code, input.assetUrls);
  const doc = parseFragment(markup);
  // React 19 hoists a <link rel="preload"> for each image it renders; a static page does not want them.
  doc.childNodes = doc.childNodes.filter((n) => !("tagName" in n && n.tagName === "link" && attr(n as Element, "rel") === "preload"));

  // Instances, real SVGs, provenance.
  let instances = 0;
  let svgs = 0;
  walk(doc as unknown as Node, (el) => {
    const id = attr(el, "data-node-id");
    if (!id) return;
    const inst = input.instances?.[id];
    if (inst) {
      setAttr(el, "data-wave-component", inst.component);
      const props = inst.variant ?? {};
      const stateKey = Object.keys(props).find((k) => /^state$/i.test(k));
      const state = stateKey ? props[stateKey] : null;
      const variant = Object.entries(props)
        .filter(([k]) => k !== stateKey)
        .map(([, v]) => String(v).toLowerCase().replace(/\s+/g, "-"))
        .join("-");
      if (variant) setAttr(el, "data-wave-variant", variant);
      if (state && !/^default$/i.test(state)) setAttr(el, "data-wave-state", state.toLowerCase());
      instances++;
    }
    const svg = input.svgByNode?.[id];
    if (svg) {
      const frag = parseFragment(svg.trim());
      el.childNodes = frag.childNodes.filter((c) => "tagName" in c) as Element["childNodes"];
      for (const c of el.childNodes) (c as Element).parentNode = el;
      svgs++;
    }
  });
  walk(doc as unknown as Node, (el) => {
    const id = attr(el, "data-node-id");
    if (id) {
      el.attrs = el.attrs.filter((a) => a.name !== "data-node-id");
      el.attrs.push({ name: "data-figma-id", value: id });
    }
    const name = attr(el, "data-name");
    if (name !== null) {
      el.attrs = el.attrs.filter((a) => a.name !== "data-name");
      el.attrs.push({ name: "data-figma-name", value: name });
    }
  });
  const body = serialize(doc as unknown as DefaultTreeAdapterMap["parentNode"]);

  // Only the classes the markup uses.
  const candidates = new Set<string>();
  walk(doc as unknown as Node, (el) => {
    for (const c of (attr(el, "class") ?? "").split(/\s+/)) if (c) candidates.add(c);
  });
  const compiler = await compile(`@import "tailwindcss";`, {
    base: "/",
    loadStylesheet: async (id: string) => ({ path: id, base: "/", content: tailwindStylesheet(id) }),
  });
  let css = compiler.build([...candidates]);

  // Figma variables to the project's tokens.
  const set: TokenSet | null = input.tokens ? parseTokens(input.tokens) : null;
  // Only assets the page still points at: one replaced by its node's SVG is resolved.
  const stillUsed = unresolved.filter((f) => body.includes(`figma-asset:${f}`));
  const report: ConvertReport = { classes: candidates.size, mapped: [], notInTokens: {}, valueMismatch: [], families: [], unresolvedAssets: stillUsed, instances, svgs };
  const used = new Map<string, string>();
  const families = new Set<string>();
  css = css.replace(VAR, (whole, rawName: string, fallback: string) => {
    const figma = unescapeName(rawName);
    if (!figma.includes("/")) return whole; // Tailwind's own variables
    const path = figma.replace(/\//g, ".");
    const tok = set?.byPath.get(path);
    let value = fallback.trim();
    // Figma names a font with its style ('Geist:SemiBold'); the family token holds the family alone.
    const font = /^'([^':]+):[^']*'$/.exec(value);
    if (font) {
      families.add(font[1].replace(/_/g, " "));
      value = `"${font[1].replace(/_/g, " ")}"`;
    }
    if (!tok) {
      report.notInTokens[figma] = value;
      return value;
    }
    if (!report.mapped.includes(figma)) report.mapped.push(figma);
    if (!sameValue(value, tok.value) && !(path.endsWith("full") && /9999/.test(value))) {
      if (!report.valueMismatch.some((m) => m.figma === figma)) report.valueMismatch.push({ figma, figmaValue: value, tokenValue: tok.value });
      return value;
    }
    used.set(tok.cssVar, tok.value);
    return `var(${tok.cssVar})`;
  });

  // Figma font names ('Geist:SemiBold', 'Geist_Mono:Medium') left in the CSS, to CSS families.
  css = css.replace(/'([A-Za-z0-9_ ]+):[A-Za-z0-9 ]+'/g, (_m, fam: string) => {
    const f = fam.replace(/_/g, " ");
    families.add(f);
    return `"${f}"`;
  });
  report.families = [...families];

  const root = used.size ? `:root{${[...used].map(([k, v]) => `${k}:${v}`).join(";")}}\n` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title ?? "Screen")}</title>
${input.source ? `<meta name="figma-source" content="${escapeHtml(input.source)}">\n` : ""}${input.fontCss ? (input.fontCss.trim().startsWith("<") ? input.fontCss : `<style>${input.fontCss}</style>`) + "\n" : ""}<style>
${root}html,body{margin:0}
body{width:${input.width}px;min-height:${input.height}px}
${css}
</style>
</head>
<body>
${body}
</body>
</html>
`;
  return { html, report };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The element ids (data-figma-id) in a converted page, for checks. */
export function figmaIds(html: string): string[] {
  const ids: string[] = [];
  walk(parse(html) as unknown as Node, (el) => {
    const id = attr(el, "data-figma-id");
    if (id) ids.push(id);
  });
  return ids;
}
