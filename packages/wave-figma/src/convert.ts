import { transform } from "sucrase";
import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { normaliseLength, parseTokens, slugify, type TokenSet } from "@wave/spec";
import { tailwindStylesheet } from "./tailwind-css";
import { errorElement, type ErrorPart } from "./states";

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
  /** The node's effect style, when its effects are one: it is the design system's shadow token. */
  style?: string | null;
};

/** A component instance: its component, its variant properties (Type, State) and its text and boolean properties. */
export type InstanceInfo = { component: string; variant?: Record<string, string>; props?: Record<string, string | boolean>; /** The State property's default value (Unchecked, Upcoming): the base look, written with no data-wave-state. */ baseState?: string; /** The variant's design-system id (DS.primaryButton). */ ds?: string; /** Every value of its set's State property. */ states?: string[] };

/**
 * Names that mean chosen and not chosen, as the entry gate requires them and the prototype
 * reads them (wave-prototype's runtime). A chosen state is always written, even when it is
 * the component's default look, so a prototype can tell which instance is the chosen one.
 */
export const CHOSEN_STATE = /^(selected|checked|on|active|current)$/i;
export const UNCHOSEN_STATE = /^(default|unchecked|unselected|off|inactive)$/i;

/** The data-wave-state a variant's State value is written as, or null for the base look. */
export function writtenState(state: string | null | undefined, baseState?: string): string | null {
  if (!state) return null;
  if (CHOSEN_STATE.test(state)) return state.toLowerCase();
  if (/^default$/i.test(state) || state === baseState) return null;
  return state.toLowerCase();
}

/** Whether a component is a choice: its State has a chosen and a not-chosen value. */
export const isChoice = (states: string[] | undefined) => !!states && states.some((s) => CHOSEN_STATE.test(s)) && states.some((s) => UNCHOSEN_STATE.test(s));

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
  /** Stroke weight by Figma node id, for frames whose stroke Figma leaves out of their auto layout. */
  strokesOutOfLayout?: Record<string, number>;
  /** Asset URLs by the file name the reference code uses (`bde91.svg`). */
  assetUrls?: Record<string, string>;
  /** Component instances by node id. */
  instances?: Record<string, InstanceInfo>;
  /**
   * The design system's components by variant node id (from each specimen's
   * COMPONENT data): a screen's reference code renders an instance through its
   * component, so the instance carries the variant's id.
   */
  components?: Record<string, InstanceInfo>;
  /**
   * The frame's instances in Figma's order, with their main component (the
   * NODE_MAP script). The k-th instance of a variant is the k-th element
   * carrying that variant's id, which gives every element its instance id
   * (data-figma-instance).
   */
  figmaInstances?: { id: string; main: string }[];
  /** Figma's prototype links (NODE_MAP), and the screen slug of each frame they lead to, by frame node id (or name). */
  links?: { from: string; to: string | null; toName?: string | null; url: string | null; navigation?: string | null }[];
  screens?: Record<string, string>;
  /** Shadows by node id, from the EFFECTS script (the reference code loses a shadow's spread). */
  effects?: Record<string, FigmaNodeEffect[]>;
  /** The BINDINGS script's lines (id|height|size/control-input|48): variables the reference code wrote as plain values. */
  bindings?: string;
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
  /**
   * The component set's auto layout (COMPONENT script): the specimen page lays its variants out
   * the same way, with the set's gap and padding variables, so no position is a pixel value.
   */
  canvas?: { direction: "HORIZONTAL" | "VERTICAL"; gap?: CanvasSpace; padding?: { top?: CanvasSpace; right?: CanvasSpace; bottom?: CanvasSpace; left?: CanvasSpace } };
  /**
   * Each variant's root classes on its specimen page, by variant node id. An instance on a
   * screen carries exactly these; whatever else Figma's code puts on the instance's root (how
   * it sits in its parent) goes on a wrapper around it.
   */
  specimenRoots?: Record<string, string>;
  /** Each variant's root tag on its specimen page, as Figma's code wrote it, by variant node id. */
  specimenTags?: Record<string, string>;
  /**
   * Each variant's error part (`errorParts`), by variant node id: an instance whose component
   * shows a message only in its Error state gets its own words as its hidden error state.
   */
  errorParts?: Record<string, ErrorPart>;
};

/** A spacing of the component set: its value, and the variable it is bound to. */
export type CanvasSpace = { value: number; name?: string | null } | null | undefined;

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
  /** Figma prototype links written as data-wave-to. */
  links?: number;
  /** Instances whose placement went on a wrapper, so the instance itself matches its specimen. */
  slots?: number;
  /** Error messages put on the screen as hidden error states, by instance. */
  errorMessages?: { instance: string; words: string }[];
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

/**
 * A variant's properties as the props the reference component takes. Figma's code types a
 * Yes/No (True/False, On/Off) variant property as a boolean, and when two properties share
 * a name (a "Helper" text and a "Helper" On/Off variant) it numbers the second ("helper1"):
 * the prop is the one whose type fits the value.
 */
export function variantProps(code: string, variant: Record<string, string>): Record<string, string | boolean> {
  const typeOf = (prop: string) => new RegExp(`\\b${prop}\\?:\\s*([^;\\n]+)`).exec(code)?.[1] ?? null;
  return Object.fromEntries(
    Object.entries(variant).map(([k, val]) => {
      const base = propName(k);
      const flag = /^(yes|no|true|false|on|off)$/i.test(String(val));
      const candidates = [base, ...[1, 2, 3, 4].map((n) => `${base}${n}`)].filter((p) => typeOf(p) !== null);
      const fits = (p: string) => {
        const t = typeOf(p)!;
        return flag && /^boolean\b/.test(t) ? true : t.includes(JSON.stringify(String(val)));
      };
      const name = candidates.find(fits) ?? base;
      const bool = /^boolean\b/.test(typeOf(name) ?? "");
      return [name, bool ? /^(yes|true|on)$/i.test(String(val)) : val];
    }),
  );
}

/**
 * A frame whose stroke Figma leaves out of its auto layout ("Include strokes in layout" off):
 * the stroke is drawn inside the frame and takes no room. A CSS border takes room, so the
 * border becomes an outline drawn inside the box. Only a border on all four sides moves.
 */
export function strokeOutOfLayout(classes: string, weight: number): string {
  const list = classes.split(/\s+/).filter(Boolean);
  const sided = list.some((c) => /^border-[trblxyse]-/.test(c) || /^border-[trblxyse]$/.test(c));
  if (sided || !list.some((c) => /^border(-|$)/.test(c))) return classes;
  const out = list.map((c) => (c === "border" ? "outline" : /^border-(\[|solid$|dashed$|dotted$)/.test(c) ? c.replace(/^border-/, "outline-") : c));
  // The outline sits inside by its own width: the border width's token when there is one.
  const width = /^border-\[length:(.+)\]$/.exec(list.find((c) => c.startsWith("border-[length:")) ?? "")?.[1];
  return [...out, width ? `outline-offset-[calc(${width}*-1)]` : `outline-offset-[-${weight}px]`].join(" ");
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

/** Figma's shadows on a node as a CSS box-shadow. Blurs are left to the reference code. */
export function boxShadow(effects: FigmaNodeEffect[]): string | null {
  const parts = effects
    .filter((e) => e.type === "DROP_SHADOW" || e.type === "INNER_SHADOW")
    .map((e) =>
      [
        e.type === "INNER_SHADOW" ? "inset" : "",
        figmaVar(e.xVar, `${e.x ?? 0}px`),
        figmaVar(e.yVar, `${e.y ?? 0}px`),
        figmaVar(e.radiusVar, `${e.radius ?? 0}px`),
        figmaVar(e.spreadVar, `${e.spread ?? 0}px`),
        figmaVar(e.colorVar, e.color ?? "transparent"),
      ]
        .filter(Boolean)
        .join(" "),
    );
  return parts.length ? parts.join(",") : null;
}

/**
 * What Figma's code needs from a reset, and nothing that is a value of its own. Figma draws
 * every text layer (a <p> in its code) in a box snapped up to whole pixels: an 18.2px line
 * is 19px tall, and a 64.2px wide label 65px wide. The browser keeps the fractions, and the
 * difference adds up along a row or down a column. A width or height Figma's code sets wins.
 * The upgrade keeps it on a text layer it turns into a label or an input (data-wave-tag, -from).
 * A text of several lines is a leading-[0] box of one <p> per line: the box is the layer, so it snaps.
 * The pixel is the design system's own 1px token (see pixelToken), so the page holds no length
 * of its own; without one it is 1px, and Wave asks for the token.
 */
const BASE = (px: string) => `@layer base{*,::before,::after{box-sizing:border-box;margin:0;padding:0;border:0 solid}:is(p,[data-wave-tag=p],[data-wave-from=p]):not(.leading-\\[0\\]>*),.leading-\\[0\\]{width:calc-size(fit-content,round(up,size,${px}));height:calc-size(auto,round(up,size,${px}))}img,svg,video,canvas{display:block;vertical-align:middle}img,video{max-width:100%;height:auto}button,input,select,textarea{font:inherit;color:inherit;letter-spacing:inherit;background-color:transparent;border-radius:0}[hidden]{display:none!important}}`;

/** The shadow token an effect style stands for: its name, or its name without leading groups (Keel/shadow/x is shadow/x). */
function shadowToken(set: TokenSet | null, style: string | null | undefined): { cssVar: string; value: string } | null {
  if (!set || !style) return null;
  const parts = style.split("/");
  for (let i = 0; i < parts.length; i++) {
    const t = set.byPath.get(parts.slice(i).join("."));
    if (t && t.type === "shadow") return { cssVar: t.cssVar, value: t.value };
  }
  return null;
}

/** Whether an element sits inside a component instance (its parent chain carries an instance id). */
/** Whether el sits inside an instance of a choice (an option card's own checkbox is the card's look). */
function insideChoice(el: Element, info: (e: Element) => InstanceInfo | undefined): boolean {
  for (let p = el.parentNode as Element | null; p && "tagName" in p; p = p.parentNode as Element | null) {
    if (!attr(p, "data-figma-instance")) continue;
    if (isChoice(info(p)?.states)) return true;
  }
  return false;
}

function insideInstance(el: Element): boolean {
  for (let p = el.parentNode as Element | null; p && "tagName" in p; p = p.parentNode as Element | null) if (attr(p, "data-figma-instance")) return true;
  return false;
}

type Bound = Record<string, { name: string; value: string }>;

function parseBindings(text: string | undefined): Map<string, Bound> {
  const out = new Map<string, Bound>();
  for (const line of (text ?? "").split("\n")) {
    const [id, prop, name, ...rest] = line.trim().split("|");
    if (!id || !prop || !name || !rest.length) continue;
    if (!out.has(id)) out.set(id, {});
    out.get(id)![prop] = { name, value: rest.join("|") };
  }
  return out;
}

const SIZE_CLASS: Record<string, string> = { w: "width", h: "height", "min-w": "minWidth", "max-w": "maxWidth", "min-h": "minHeight", "max-h": "maxHeight" };
const WEIGHT: Record<string, number> = { thin: 100, extralight: 200, light: 300, normal: 400, medium: 500, semibold: 600, bold: 700, extrabold: 800, black: 900 };

/**
 * A layer's plain values as the variables bound to them: Figma's code writes some bound values as
 * they are (h-[48px] for an input bound to size/control-input, text-[13px] for an underlined
 * caption). Only where the value is the variable's.
 */
export function bindVariables(classes: string, bound: Bound): string {
  const same = (prop: string, v: number | string) => {
    const b = bound[prop];
    if (!b) return null;
    const ok = typeof v === "number" ? Math.abs(+b.value - v) < 0.01 : b.value === v;
    return ok ? b.name : null;
  };
  const px = (v: string) => (v === "px" ? 1 : /^\[(-?\d+(?:\.\d+)?)px\]$/.exec(v)?.[1]);
  return classes
    .split(/\s+/)
    .flatMap((c) => {
      const size = /^size-(px|\[[\d.]+px\])$/.exec(c);
      if (size) {
        const v = +px(size[1])!;
        const w = same("width", v), h = same("height", v);
        if (w && h && w === h) return [`size-[${figmaVar(w, `${v}px`)}]`];
        return w || h ? [w ? `w-[${figmaVar(w, `${v}px`)}]` : `w-${size[1]}`, h ? `h-[${figmaVar(h, `${v}px`)}]` : `h-${size[1]}`] : [c];
      }
      const m = /^(min-w|max-w|min-h|max-h|w|h)-(px|\[[\d.]+px\])$/.exec(c);
      if (m) {
        const v = px(m[2]);
        const n = v !== undefined ? same(SIZE_CLASS[m[1]], +v) : null;
        return [n ? `${m[1]}-[${figmaVar(n, `${v}px`)}]` : c];
      }
      const t = /^(text|leading|tracking)-\[(-?\d+(?:\.\d+)?)px\]$/.exec(c);
      if (t) {
        const prop = t[1] === "text" ? "fontSize" : t[1] === "leading" ? "lineHeight" : "letterSpacing";
        const n = same(prop, +t[2]);
        return [n ? `${t[1]}-[${t[1] === "text" ? "length:" : ""}${figmaVar(n, `${t[2]}px`)}]` : c];
      }
      const fam = /^font-\['([^':]+)(:[^']*)?'\]$/.exec(c);
      if (fam) {
        const n = same("fontFamily", fam[1].replace(/_/g, " "));
        return [n ? `font-[family-name:${figmaVar(n, `'${fam[1]}${fam[2] ?? ""}'`)}]` : c];
      }
      const wt = /^font-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)$/.exec(c);
      if (wt) {
        const n = same("fontWeight", WEIGHT[wt[1]]);
        return [n ? `font-[${figmaVar(n, String(WEIGHT[wt[1]]))}]` : c];
      }
      return [c];
    })
    .join(" ");
}

/** The design system's 1px dimension token, the shortest-named when there are several (a primitive such as dimension/1 before size/hairline). */
function pixelToken(set: TokenSet | null): { cssVar: string; value: string } | null {
  const ones = (set?.tokens ?? []).filter((t) => (t.type === "dimension" || t.type === null) && normaliseLength(String(t.value)) === "1px");
  ones.sort((a, b) => a.path.length - b.path.length || a.path.localeCompare(b.path));
  return ones[0] ? { cssVar: ones[0].cssVar, value: ones[0].value } : null;
}

/** A specimen's canvas: the component set's auto layout, its spacing as Figma variables (mapped to tokens with the rest). */
function canvasCss(c: ConvertInput["canvas"]): string {
  if (!c) return "";
  const sp = (x: CanvasSpace) => (x ? figmaVar(x.name, `${x.value}px`) : "0");
  const p = c.padding ?? {};
  return `.wave-canvas{display:flex;flex-direction:${c.direction === "VERTICAL" ? "column" : "row"};align-items:flex-start;width:max-content;gap:${sp(c.gap)};padding:${sp(p.top)} ${sp(p.right)} ${sp(p.bottom)} ${sp(p.left)}}\n`;
}

/** Classes on an instance's root that only say how it sits in its parent. */
export function placementOf(instanceClasses: string, specimenClasses: string): { root: string; slot: string } {
  const spec = specimenClasses.split(/\s+/).filter(Boolean);
  const own = new Set(spec);
  const extra = instanceClasses.split(/\s+/).filter((c) => c && !own.has(c));
  return { root: spec.join(" "), slot: extra.join(" ") };
}

export async function convertFigma(input: ConvertInput): Promise<{ html: string; report: ConvertReport }> {
  let markup: string;
  let unresolved: string[];
  if (input.variants?.length) {
    const parts: string[] = [];
    unresolved = [];
    for (const v of input.variants) {
      const r = await renderReference(input.code, input.assetUrls, variantProps(input.code, v.variant));
      unresolved.push(...r.unresolved);
      parts.push(`<div data-figma-variant="${v.id}">${r.markup}</div>`);
    }
    unresolved = [...new Set(unresolved)];
    markup = `<div class="wave-canvas">${parts.join("")}</div>`;
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

  // Each instance's own id: the k-th instance of a variant is the k-th element carrying the variant's id.
  const mainOf = new Map((input.figmaInstances ?? []).map((i) => [i.id, i.main]));
  if (input.figmaInstances?.length) {
    // Figma's code names an instance by its own id, or (in older files) by its main component's.
    const own = new Set(input.figmaInstances.map((i) => i.id));
    const named = new Set<string>();
    walk(doc as unknown as Node, (el) => {
      const id = attr(el, "data-node-id");
      if (id && own.has(id)) named.add(id);
    });
    const queue = new Map<string, string[]>();
    for (const i of input.figmaInstances) if (!named.has(i.id)) queue.set(i.main, [...(queue.get(i.main) ?? []), i.id]);
    walk(doc as unknown as Node, (el) => {
      const id = attr(el, "data-node-id");
      if (id && named.has(id)) return setAttr(el, "data-figma-instance", id);
      const q = id ? queue.get(id) : undefined;
      if (q?.length) setAttr(el, "data-figma-instance", q.shift()!);
    });
  }
  // Figma's prototype links, as Wave destinations.
  let linked = 0;
  if (input.links?.length) {
    walk(doc as unknown as Node, (el) => {
      const key = attr(el, "data-figma-instance") ?? attr(el, "data-node-id");
      // A variant swap (CHANGE_TO, a segment choosing its value) stays in the component: the prototype shows the choice.
      const link = key ? input.links!.find((l) => l.from === key && l.navigation !== "CHANGE_TO") : undefined;
      if (!link) return;
      // The destination frame by node id, or failing that by name.
      // A screen is named as its Figma frame (the gate checks the name); its slug is that name's.
      const slug = (link.to ? input.screens?.[link.to] : null) ?? (link.toName ? input.screens?.[link.toName] ?? slugify(link.toName) : null);
      if (slug) setAttr(el, "data-wave-to", `screen:${slug}`);
      else if (link.url) setAttr(el, "data-wave-to", `url:${link.url}`);
      else if (link.to) setAttr(el, "data-figma-link", link.toName ?? link.to);
      linked++;
    });
  }

  // Instances, real SVGs, provenance.
  let instances = 0;
  let svgs = 0;
  const shadowRules: string[] = [];
  // The project's tokens, for Figma's variables and effect styles.
  const set: TokenSet | null = input.tokens ? parseTokens(input.tokens) : null;
  const shadowVars = new Map<string, string>();
  const bindings = parseBindings(input.bindings);
  const infoOf = (e: Element): InstanceInfo | undefined => {
    const nid = attr(e, "data-node-id");
    const inst = attr(e, "data-figma-instance");
    const main = inst ? mainOf.get(inst) : undefined;
    return (nid ? input.components?.[nid] : undefined) ?? (main ? input.components?.[main] : undefined) ?? (inst ? input.instances?.[inst] : undefined) ?? (nid ? input.instances?.[nid] : undefined);
  };
  walk(doc as unknown as Node, (el) => {
    const id = attr(el, "data-node-id");
    if (!id) return;
    const bound = bindings.get(id);
    if (bound) setAttr(el, "class", bindVariables(attr(el, "class") ?? "", bound));
    const fx = input.effects?.[id];
    // An effect style is a shadow token: the page uses the token, not the values it holds.
    const styled = fx ? shadowToken(set, fx[0]?.style) : null;
    if (styled) shadowVars.set(styled.cssVar, styled.value);
    const shadow = styled ? `var(${styled.cssVar})` : fx ? boxShadow(fx) : null;
    if (shadow) {
      // Figma draws an inner shadow above the fills; the reference code puts it on a last overlay child.
      const inner = fx!.some((e) => e.type === "INNER_SHADOW");
      const overlay = inner
        ? (el.childNodes.filter((c) => "tagName" in c) as Element[]).reverse().find((c) => /(^|\s)shadow-\[inset/.test(attr(c, "class") ?? ""))
        : undefined;
      const target = overlay ?? el;
      setAttr(target, "data-figma-effect", id);
      // The effect rule draws the shadow; Figma's arbitrary shadow classes (which lose the spread) go.
      setAttr(target, "class", (attr(target, "class") ?? "").split(/\s+/).filter((c) => c && !/^(drop-)?shadow-\[/.test(c)).join(" "));
      shadowRules.push(`[data-figma-effect="${id}"]{box-shadow:${shadow}}`);
    }
    const stroke = input.strokesOutOfLayout?.[id];
    if (stroke) setAttr(el, "class", strokeOutOfLayout(attr(el, "class") ?? "", stroke));
    const own = attr(el, "data-figma-instance");
    // The design system's own record of the variant first (it has the DS id), then Figma's instance data.
    const inst = infoOf(el);
    // An instance inside an instance is its component's: the outer one is the catalogue entry.
    // Except a choice (a segment in a segmented control, an option in a select's menu): the
    // prototype shows which one is chosen, so it needs to know each one is a component.
    if (inst && (!insideInstance(el) || (isChoice(inst.states) && !insideChoice(el, infoOf)))) {
      setAttr(el, "data-wave-component", inst.component);
      const props = inst.variant ?? {};
      const stateKey = Object.keys(props).find((k) => /^state$/i.test(k));
      const state = stateKey ? props[stateKey] : null;
      const variant = Object.entries(props)
        .filter(([k]) => k !== stateKey)
        .map(([, v]) => String(v).toLowerCase().replace(/\s+/g, "-"))
        .join("-");
      if (variant) setAttr(el, "data-wave-variant", variant);
      if (inst.ds) setAttr(el, "data-wave-ds", inst.ds);
      const written = writtenState(state, inst.baseState);
      if (written) setAttr(el, "data-wave-state", written);
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
  // Error messages: the words each instance gives the layer its component shows only in Error.
  const errorMessages: { instance: string; words: string }[] = [];
  if (input.errorParts) {
    walk(doc as unknown as Node, (el) => {
      const own = attr(el, "data-figma-instance");
      if (!own || insideInstance(el)) return;
      const part = input.errorParts![attr(el, "data-figma-id") ?? ""];
      const words = part ? input.instances?.[own]?.props?.[part.prop] : undefined;
      if (!part || typeof words !== "string") return;
      const msg = errorElement(part, words, own);
      if (!msg) return;
      (msg as unknown as { parentNode: Element }).parentNode = el;
      el.childNodes.push(msg as unknown as Element["childNodes"][number]);
      errorMessages.push({ instance: own, words });
    });
  }
  // Figma's code writes an instance with a click interaction as a <button>, with text-left on its
  // words to undo a button's centring. The instance is its component as the specimen draws it:
  // the specimen's tag, without those text-left classes.
  if (input.specimenTags) {
    walk(doc as unknown as Node, (el) => {
      const own = attr(el, "data-figma-instance");
      if (!own || el.tagName !== "button" || insideInstance(el)) return;
      const tag = input.specimenTags![attr(el, "data-figma-id") ?? ""] ?? input.specimenTags![mainOf.get(own) ?? ""];
      if (!tag || tag === "button") return;
      el.tagName = tag;
      el.nodeName = tag;
      walk(el as unknown as Node, (d) => {
        const c = attr(d, "class");
        if (d !== el && c && /(^|\s)text-left(\s|$)/.test(c)) setAttr(d, "class", c.split(/\s+/).filter((x) => x !== "text-left").join(" "));
      });
    });
  }
  // An instance carries exactly its specimen's root classes; how it sits in its parent goes on a wrapper.
  let slots = 0;
  if (input.specimenRoots) {
    const wrap: { el: Element; slot: string }[] = [];
    walk(doc as unknown as Node, (el) => {
      if (!attr(el, "data-figma-instance") || insideInstance(el)) return;
      const spec = input.specimenRoots![attr(el, "data-figma-id") ?? ""] ?? input.specimenRoots![mainOf.get(attr(el, "data-figma-instance")!) ?? ""];
      if (spec === undefined) return;
      const { root, slot } = placementOf(attr(el, "class") ?? "", spec);
      setAttr(el, "class", root);
      if (slot) wrap.push({ el, slot });
    });
    for (const { el, slot } of wrap) {
      const parent = el.parentNode as Element;
      const box = parseFragment(`<div class="${slot.replace(/"/g, "&quot;")}" data-figma-slot="${attr(el, "data-figma-instance")}"></div>`).childNodes[0] as Element;
      parent.childNodes[parent.childNodes.indexOf(el)] = box;
      box.parentNode = parent;
      box.childNodes = [el];
      el.parentNode = box;
      slots++;
    }
  }
  // Fill's 1px minimum (Figma's min-w-px) is a pixel value; 0 lays out the same.
  walk(doc as unknown as Node, (el) => {
    const c = attr(el, "class");
    if (c && /(^|\s)min-[wh]-px(\s|$)/.test(c)) setAttr(el, "class", c.replace(/(^|\s)min-([wh])-px(?=\s|$)/g, "$1min-$2-0"));
  });
  const body = serialize(doc as unknown as DefaultTreeAdapterMap["parentNode"]);

  // Only the classes the markup uses.
  const candidates = new Set<string>();
  walk(doc as unknown as Node, (el) => {
    for (const c of (attr(el, "class") ?? "").split(/\s+/)) if (c) candidates.add(c);
  });
  // Tailwind's theme and utilities, without its base reset: that reset's defaults (line-height
  // 1.5, hr, b, sub, sup...) are pixel and number values the design never chose. BASE below is
  // the part of it Figma's code relies on, with no such values.
  const compiler = await compile(`@layer theme, base, components, utilities;\n@import "tailwindcss/theme.css" layer(theme);\n@import "tailwindcss/utilities.css" layer(utilities);`, {
    base: "/",
    loadStylesheet: async (id: string) => ({ path: id, base: "/", content: tailwindStylesheet(id) }),
  });
  const pixel = pixelToken(set);
  let css = BASE(pixel ? `var(${pixel.cssVar})` : "1px") + "\n" + canvasCss(input.canvas) + compiler.build([...candidates]);
  // After the utilities, and outside their layer, so these win.
  if (shadowRules.length) css += "\n" + shadowRules.join("\n");
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
  const report: ConvertReport = { slots, ...(errorMessages.length ? { errorMessages } : {}), classes: candidates.size, mapped: [], notInTokens: {}, valueMismatch: [], families: [], unresolvedAssets: stillUsed, unresolvedNodes: [...unresolvedNodes], instances, svgs, shadows: shadowRules.length, links: linked };
  const used = new Map<string, string>();
  if (pixel) used.set(pixel.cssVar, pixel.value);
  for (const [k, v] of shadowVars) used.set(k, v);
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
  css = inlineUndefinedVars(css);

  const root = used.size ? `:root{${[...used].map(([k, v]) => `${k}:${v}`).join(";")}}\n` : "";
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(input.title ?? "Screen")}</title>
${!input.definition && input.title ? `<meta name="wave:screen" content="${escapeHtml(slugify(input.title))}">\n` : ""}${input.source ? `<meta name="figma-source" content="${escapeHtml(input.source)}">\n` : ""}${input.definition && typeof input.definition.name === "string" ? `<meta name="wave:component" content="${escapeHtml(input.definition.name)}">\n` : ""}${input.definition ? `<script type="application/wave-component+json" id="wave-component">${JSON.stringify(input.definition).replace(/</g, "\\u003c")}</script>\n` : ""}${input.fontCss ? (input.fontCss.trim().startsWith("<") ? input.fontCss : `<style>${input.fontCss}</style>`) + "\n" : ""}<style>
${root}html,body{margin:0}
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

/**
 * A variable no rule defines, read with a fallback (Tailwind's
 * var(--default-font-feature-settings, normal)), is its fallback: written so,
 * the page says the same and Wave does not ask what the variable is.
 */
export function inlineUndefinedVars(css: string): string {
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  for (const m of css.matchAll(/@property\s+(--[\w-]+)/g)) defined.add(m[1]);
  let prev = "";
  while (prev !== css) {
    prev = css;
    css = css.replace(/var\((--[\w-]+)\s*,\s*([^()]*(?:\([^()]*\)[^()]*)*)\)/g, (whole, name: string, fb: string) => (defined.has(name) ? whole : fb.trim()));
  }
  return css;
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
