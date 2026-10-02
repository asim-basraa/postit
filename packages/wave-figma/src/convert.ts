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

/** One shadow or blur on a node, with the variables it is bound to (EFFECTS script). */
export type FigmaNodeEffect = {
  type: "DROP_SHADOW" | "INNER_SHADOW" | "LAYER_BLUR" | "BACKGROUND_BLUR" | string;
  radius: number;
  radiusVar?: string | null;
  x?: number;
  y?: number;
  spread?: number;
  color?: string;
  colorVar?: string | null;
  spreadVar?: string | null;
  xVar?: string | null;
  yVar?: string | null;
};

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
  /** Shadows by node id, from the EFFECTS script (the reference code loses a shadow's spread). */
  effects?: Record<string, FigmaNodeEffect[]>;
  /** @font-face rules (or a stylesheet link) for the fonts the page uses. */
  fontCss?: string;
  title?: string;
  /** Where it came from, written as a meta tag: figma:<fileKey>/<nodeId>. */
  source?: string;
  /** For a component specimen: its catalogue definition, written in the head. */
  definition?: Record<string, unknown>;
  /**
   * For a component set: the reference code is one component taking the
   * variant as props. Each variant is rendered with its props and placed where
   * Figma places it in the set, so the page compares with Figma's render of the set.
   */
  variants?: { id: string; x: number; y: number; width: number; height: number; variant: Record<string, string> }[];
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
  /** The nodes those assets sit in: export these with EXPORT_SVG and convert again. */
  unresolvedNodes: string[];
  /** Nodes whose shadows were written from Figma's effects. */
  shadows: number;
  instances: number;
  svgs: number;
};

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

/** Figma's temporary asset URLs, as the file name they end in. */
const ASSET_URL = /^https:\/\/www\.figma\.com\/api\/mcp\/asset\/(?:[^/"`]+\/)?([^/"`]+)$/;

/** Runs the reference component (with props, for one variant of a set) and returns its markup. */
export async function renderReference(code: string, assetUrls: Record<string, string> = {}, props: Record<string, unknown> = {}): Promise<{ markup: string; unresolved: string[] }> {
  const unresolved: string[] = [];
  const resolve = (name: string, file: string) => {
    const url = assetUrls[file];
    if (!url) unresolved.push(file);
    return `const ${name} = ${JSON.stringify(url ?? `figma-asset:${file}`)};`;
  };
  const src = code
    .replace(/const (\w+) = `\$\{assetPathPrefix\}\/([^`]+)`;/g, (_m, name: string, file: string) => resolve(name, file))
    .replace(/const (\w+) = "(https:\/\/www\.figma\.com\/api\/mcp\/asset\/[^"]+)";/g, (m, name: string, url: string) => {
      const file = ASSET_URL.exec(url)?.[1];
      return file ? resolve(name, file) : m;
    });
  // Sucrase is plain JavaScript, so the bundled CLI needs nothing native installed.
  const js = transform(src, { transforms: ["jsx", "typescript", "imports"], jsxPragma: "__h", jsxFragmentPragma: "__F", production: true }).code;
  const module = { exports: {} as Record<string, unknown> };
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function("module", "exports", "__h", "__F", js)(module, module.exports, React.createElement, React.Fragment);
  const Component = (module.exports.default ?? Object.values(module.exports)[0]) as React.ComponentType;
  if (typeof Component !== "function") throw new Error("The reference code has no component to render.");
  // React 19 adds a <link rel="preload"> for each image it renders; a static page does not want them.
  const markup = renderToStaticMarkup(React.createElement(Component, props)).replace(/<link rel="preload"[^>]*>/g, "");
  return { markup, unresolved };
}

/** A Figma property name as the prop the reference component takes: "Show icon" is showIcon. */
export function propName(figma: string): string {
  const words = figma.replace(/#.*$/, "").trim().split(/[^A-Za-z0-9]+/).filter(Boolean);
  return words.map((w, i) => (i === 0 ? w.charAt(0).toLowerCase() + w.slice(1) : w.charAt(0).toUpperCase() + w.slice(1))).join("");
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

/** A Figma variable reference the variable mapping below understands. */
const figmaVar = (name: string | null | undefined, fallback: string) => (name ? `var(--${name.replace(/\//g, "\\/")},${fallback})` : fallback);

/** The width of a node's stroke from its border classes (all sides), in px; 0 when it has none. */
export function strokeWidth(classes: string): number {
  const c = ` ${classes} `;
  const m = /\sborder-\[length:var\(--[^,()]+,([\d.]+)px\)\]\s/.exec(c) ?? /\sborder-\[([\d.]+)px\]\s/.exec(c);
  if (m) return +m[1];
  const n = /\sborder-(\d+)\s/.exec(c);
  if (n) return +n[1];
  return /\sborder\s/.test(c) ? 1 : 0;
}

/** Figma's shadows on a node as a CSS box-shadow. Blurs are left to the reference code. */
export function boxShadow(effects: FigmaNodeEffect[], stroke = 0): string | null {
  const parts = effects
    .filter((e) => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW")
    .map((e) =>
      [
        e.type === "INNER_SHADOW" ? "inset" : "",
        figmaVar(e.xVar, `${e.x ?? 0}px`),
        figmaVar(e.yVar, `${e.y ?? 0}px`),
        figmaVar(e.radiusVar, `${e.radius ?? 0}px`),
        // Figma draws an inside stroke over an inner shadow; CSS draws the inset shadow inside the border.
        e.type === "INNER_SHADOW" && stroke ? `calc(${figmaVar(e.spreadVar, `${e.spread ?? 0}px`)} - ${stroke}px)` : figmaVar(e.spreadVar, `${e.spread ?? 0}px`),
        figmaVar(e.colorVar, e.color ?? "transparent"),
      ]
        .filter(Boolean)
        .join(" "),
    );
  return parts.length ? parts.join(",") : null;
}

export async function convertFigma(input: ConvertInput): Promise<{ html: string; report: ConvertReport }> {
  let markup: string;
  let unresolved: string[];
  if (input.variants?.length) {
    const parts: string[] = [];
    unresolved = [];
    for (const v of input.variants) {
      const props = Object.fromEntries(Object.entries(v.variant).map(([k, val]) => [propName(k), val]));
      const r = await renderReference(input.code, input.assetUrls, props);
      unresolved.push(...r.unresolved);
      // Figma's size for the variant is the truth: text measures a fraction of a pixel differently in a browser.
      const sized = r.markup.replace(/^<(\w+)([^>]*?)(\sstyle="[^"]*")?>/, (_m, tag: string, attrs: string, style?: string) => {
        const s = style ? style.slice(8, -1) : "";
        return `<${tag}${attrs} style="${s}${s && !s.endsWith(";") ? ";" : ""}width:${v.width}px;height:${v.height}px;box-sizing:border-box">`;
      });
      parts.push(`<div data-figma-variant="${v.id}" style="position:absolute;left:${v.x}px;top:${v.y}px;width:${v.width}px;height:${v.height}px">${sized}</div>`);
    }
    unresolved = [...new Set(unresolved)];
    markup = `<div style="position:relative;width:${input.width}px;height:${input.height}px">${parts.join("")}</div>`;
  } else {
    ({ markup, unresolved } = await renderReference(input.code, input.assetUrls));
  }
  const doc = parseFragment(markup);
  // A component's root carries its node id as id="node-28_155".
  walk(doc as unknown as Node, (el) => {
    const id = attr(el, "id");
    const m = id ? /^node-(\d+)_(\d+)$/.exec(id) : null;
    if (m && !attr(el, "data-node-id")) {
      el.attrs = el.attrs.filter((a) => a.name !== "id");
      el.attrs.push({ name: "data-node-id", value: `${m[1]}:${m[2]}` });
    }
  });
  // React 19 adds a <link rel="preload"> for each image it renders; a static page does not want them.
  const dropPreloads = (n: Node) => {
    if (!("childNodes" in n)) return;
    const el = n as Element;
    el.childNodes = el.childNodes.filter((c) => !("tagName" in c && c.tagName === "link" && attr(c as Element, "rel") === "preload"));
    for (const c of el.childNodes) dropPreloads(c);
  };
  dropPreloads(doc as unknown as Node);

  // Instances, real SVGs, provenance.
  let instances = 0;
  let svgs = 0;
  const shadowRules: string[] = [];
  walk(doc as unknown as Node, (el) => {
    const id = attr(el, "data-node-id");
    if (!id) return;
    const fx = input.effects?.[id];
    const shadow = fx ? boxShadow(fx, strokeWidth(attr(el, "class") ?? "")) : null;
    if (shadow) {
      // Figma draws an inner shadow above the fills; the reference code puts it on a last overlay child.
      const inner = fx!.some((e) => e.type === "INNER_SHADOW");
      const overlay = inner
        ? (el.childNodes.filter((c) => "tagName" in c) as Element[]).reverse().find((c) => /(^|\s)shadow-\[inset/.test(attr(c, "class") ?? ""))
        : undefined;
      const target = overlay ?? el;
      setAttr(target, "data-figma-effect", id);
      const filter = /(^|\s)drop-shadow-\[/.test(attr(target, "class") ?? "") ? "filter:none;" : "";
      shadowRules.push(`[data-figma-effect="${id}"]{${filter}box-shadow:${shadow}}`);
    }
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
  // After the utilities, and outside their layer, so these win.
  if (shadowRules.length) css += "\n" + shadowRules.join("\n");

  // Figma variables to the project's tokens.
  const set: TokenSet | null = input.tokens ? parseTokens(input.tokens) : null;
  // Only assets the page still points at: one replaced by its node's SVG is resolved.
  const stillUsed = unresolved.filter((f) => body.includes(`figma-asset:${f}`));
  const unresolvedNodes = new Set<string>();
  const findAssets = (n: Node, owner: string | null) => {
    if (!("childNodes" in n)) return;
    const el = n as Element;
    const here = ("tagName" in el ? attr(el, "data-figma-id") : null) ?? owner;
    if ("tagName" in el && el.tagName === "img" && (attr(el, "src") ?? "").startsWith("figma-asset:") && here) unresolvedNodes.add(here);
    for (const c of el.childNodes) findAssets(c, here);
  };
  findAssets(doc as unknown as Node, null);
  const report: ConvertReport = { classes: candidates.size, mapped: [], notInTokens: {}, valueMismatch: [], families: [], unresolvedAssets: stillUsed, unresolvedNodes: [...unresolvedNodes], instances, svgs, shadows: shadowRules.length };
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
    // Figma keeps opacity as a percentage (70); the token holds the fraction (0.7).
    if (/^\d+(\.\d+)?$/.test(value) && /^0?\.\d+$|^1$|^0$/.test(String(tok.value).trim()) && Math.abs(+value - +tok.value * 100) < 1e-6) {
      used.set(tok.cssVar, tok.value);
      if (!report.mapped.includes(figma)) report.mapped.push(figma);
      return `calc(var(${tok.cssVar}) * 100)`;
    }
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
${input.source ? `<meta name="figma-source" content="${escapeHtml(input.source)}">\n` : ""}${input.definition ? `<script type="application/wave-component+json" id="wave-component">${JSON.stringify(input.definition).replace(/</g, "\\u003c")}</script>\n` : ""}${input.fontCss ? (input.fontCss.trim().startsWith("<") ? input.fontCss : `<style>${input.fontCss}</style>`) + "\n" : ""}<style>
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
