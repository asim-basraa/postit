import { parse, type DefaultTreeAdapterMap } from "parse5";
import {
  CURRENT,
  FORM_TAGS,
  ID_ATTR,
  INTERACTIVE_TAGS,
  KNOWN_KEYS,
  LEGACY,
  LEGACY_ID_ATTR,
  META_KEYS,
  TOOL_ORIGINS,
  splitAttr,
  type PrefixName,
} from "./vocabulary";
import { parseDestination, type Destination } from "./destination";

export type Element = DefaultTreeAdapterMap["element"];
export type DomElement = Element;
type ChildNode = DefaultTreeAdapterMap["childNode"];
type ParentNode = DefaultTreeAdapterMap["parentNode"];

export type ResourceDoc = {
  type?: string;
  source?: string;
  description?: string;
};

export type ScreenMeta = {
  spec: string | null;
  screen: string | null;
  flow: string | null;
  route: string | null;
  title: string | null;
  tokens: string | null;
  /** Who can open the screen: public, signed-in, role:x. */
  access: string | null;
  /** How people arrive: link, email, push, a screen. */
  entry: string | null;
  /** Widths designed for, space separated, e.g. "375 768 1440". */
  viewports: string | null;
  /** Page-view analytics event. */
  track: string | null;
  /** Answers the designer waived at screen level, as JSON {field: reason}. */
  waived: string | null;
  /** On a catalogue specimen page: the component it defines. */
  component: string | null;
  /** The project the screen belongs to, when it says. */
  project: string | null;
  /** The document's lang attribute. */
  lang: string | null;
  /** Whether a <meta name="viewport"> is present. */
  hasViewportMeta: boolean;
  /** From `<script type="application/wave+json" id="wave-resources">`. */
  resources: Record<string, ResourceDoc>;
  /** The document's own `<title>`. */
  documentTitle: string | null;
  /** Which prefix the file uses: wave, the legacy pi, or none yet. */
  prefix: PrefixName | null;
};

export type SpecNode = {
  id: string;
  slug: string | null;
  tag: string;
  /** Nearest identified ancestor, or null at the top. */
  parent: string | null;
  /** Identified ancestors, outermost first. */
  ancestors: string[];
  /** Collapsed text content, trimmed and capped. */
  text: string;
  /** Every data-wave-* (or legacy data-pi-*) attribute on the element, raw, keyed without its prefix. */
  attrs: Record<string, string>;
  /** Other attributes worth knowing: type, href, role, aria-*, required, min, max and so on. */
  html: Record<string, string>;
  /** Class names, in order. */
  classes: string[];
  /** The text of the label that names this control, however it is associated. */
  label: string | null;
  /** Hidden in the markup: the hidden attribute, display:none or an is-hidden class. */
  hidden: boolean;
  /** For a select or list box: its options' text. */
  options: string[];
  /** Icon names hinted at by classes or an SVG sprite reference. */
  iconHints: string[];
  /** The largest group of element children sharing one tag and class list. */
  repeatedChildren: number;
  /** Number of element children. */
  childCount: number;
  formControl: boolean;
  interactive: boolean;
  /** Document order among nodes. */
  order: number;
};

/** A file the page loads: an image, a font, an icon. */
export type AssetRef = {
  kind: "img" | "srcset" | "css-url" | "font" | "icon" | "poster" | "source" | "use";
  url: string;
  /** The node it belongs to, when it is on one. */
  pid?: string;
};

/** What the page runs and loads, for the portability checks. */
export type PageFacts = {
  scripts: { src: string | null; length: number; usesStorage: boolean; buildsDom: boolean }[];
  stylesheets: string[];
  iframes: number;
  /** Elements inside <body>, excluding scripts. */
  bodyElements: number;
};

export type Severity = "error" | "warn" | "info";

export type Finding = {
  code: string;
  severity: Severity;
  message: string;
  /** The node it is about, when it is about one. */
  pid?: string;
};

export type ParsedMockup = {
  screen: ScreenMeta;
  nodes: SpecNode[];
  findings: Finding[];
  /** Interactive or form elements carrying no id, for the completeness checks. */
  unidentifiedInteractive: { tag: string; text: string }[];
  /** Declarations with literal values, for the off-token check. */
  css: string[];
  assets: AssetRef[];
  facts: PageFacts;
};

const TEXT_CAP = 160;

export function isElement(node: ChildNode | ParentNode): node is Element {
  return "tagName" in node;
}

export function attrOf(el: Element, name: string): string | null {
  const found = el.attrs.find((a) => a.name === name);
  return found ? found.value : null;
}

/** Text as a browser's textContent would give it, for the elements we care about. */
export function textContent(node: ChildNode | ParentNode): string {
  if ("value" in node && node.nodeName === "#text") return node.value;
  if (isElement(node) && (node.tagName === "script" || node.tagName === "style")) return "";
  const children =
    "childNodes" in node
      ? node.childNodes
      : isElement(node) && node.tagName === "template"
        ? []
        : [];
  let out = "";
  for (const child of children as ChildNode[]) out += textContent(child);
  return out;
}

function collapse(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TEXT_CAP ? `${flat.slice(0, TEXT_CAP - 1)}…` : flat;
}

/** The raw text inside a script or style element. */
function rawText(el: Element): string {
  let out = "";
  for (const child of el.childNodes) if (child.nodeName === "#text" && "value" in child) out += child.value;
  return out;
}

/** parse5 with source offsets, which is what makes byte-exact edits possible. */
export function parseDocument(html: string) {
  return parse(html, { sourceCodeLocationInfo: true });
}

/** Every element in document order. */
export function* walk(node: ParentNode): Generator<Element> {
  const children = ("childNodes" in node ? node.childNodes : []) as ChildNode[];
  for (const child of children) {
    if (!isElement(child)) continue;
    yield child;
    // A <template>'s content is a fragment of its own.
    const content = (child as unknown as { content?: ParentNode }).content;
    if (child.tagName === "template" && content) yield* walk(content);
    yield* walk(child);
  }
}

/**
 * Reads a mockup: its screen meta, its nodes, and what is wrong with it.
 *
 * `previous` is the node list of the revision before, so ids that vanished can
 * be reported. It is optional because the first revision has nothing before it.
 */
export function parseMockup(
  html: string,
  previous?: { nodes: Pick<SpecNode, "id" | "slug" | "text">[] },
): ParsedMockup {
  const doc = parseDocument(html);
  const findings: Finding[] = [];

  const screen: ScreenMeta = {
    spec: null,
    screen: null,
    flow: null,
    route: null,
    title: null,
    tokens: null,
    access: null,
    entry: null,
    viewports: null,
    track: null,
    waived: null,
    component: null,
    project: null,
    lang: null,
    hasViewportMeta: false,
    resources: {},
    documentTitle: null,
    prefix: null,
  };
  const assets: AssetRef[] = [];
  const facts: PageFacts = { scripts: [], stylesheets: [], iframes: 0, bodyElements: 0 };

  // First pass: text by HTML id (for aria-labelledby) and label text by the
  // control it names (for <label for>).
  const textById = new Map<string, string>();
  const labelFor = new Map<string, string>();
  for (const el of walk(doc)) {
    const htmlId = attrOf(el, "id");
    if (htmlId) textById.set(htmlId, collapse(textContent(el)));
    if (el.tagName === "label") {
      const target = attrOf(el, "for");
      if (target) labelFor.set(target, collapse(textContent(el)));
    }
  }
  const used = { wave: 0, pi: 0 };

  const nodes: SpecNode[] = [];
  const unidentifiedInteractive: { tag: string; text: string }[] = [];
  const css: string[] = [];
  const idCounts = new Map<string, number>();
  const slugCounts = new Map<string, number>();

  // Identified ancestors of the element being visited, maintained by a stack
  // keyed on the parse5 parent chain.
  const ancestry = new Map<Element, string[]>();


  for (const el of walk(doc)) {
    const parentEl = el.parentNode && isElement(el.parentNode) ? el.parentNode : null;
    const inherited = parentEl ? (ancestry.get(parentEl) ?? []) : [];
    const waveId = attrOf(el, ID_ATTR);
    const id = waveId ?? attrOf(el, LEGACY_ID_ATTR);
    ancestry.set(el, id ? [...inherited, id] : inherited);

    if (el.tagName === "html") screen.lang = attrOf(el, "lang");
    if (inBody(el)) facts.bodyElements += el.tagName === "script" || el.tagName === "style" || el.tagName === "template" ? 0 : 1;
    collectAssets(el, id ?? inherited[inherited.length - 1], assets);
    if (el.tagName === "iframe") facts.iframes++;
    if (el.tagName === "link" && /(^|\s)stylesheet(\s|$)/i.test(attrOf(el, "rel") ?? "")) {
      const href = attrOf(el, "href");
      if (href) facts.stylesheets.push(href);
    }

    if (el.tagName === "meta") {
      const name = attrOf(el, "name");
      const content = attrOf(el, "content");
      if (name === "viewport") screen.hasViewportMeta = true;
      for (const prefix of [LEGACY, CURRENT]) {
        if (!name?.startsWith(prefix.meta)) continue;
        const key = name.slice(prefix.meta.length) as (typeof META_KEYS)[number];
        if (!META_KEYS.includes(key)) continue;
        // The current name wins over the legacy one if a file has both.
        if (prefix === CURRENT || screen[key] === null) screen[key] = content;
        used[prefix.name]++;
      }
      continue;
    }

    if (el.tagName === "title" && screen.documentTitle === null) {
      screen.documentTitle = collapse(textContent(el)) || null;
      continue;
    }

    if (el.tagName === "script") {
      const scriptId = attrOf(el, "id");
      const scriptType = attrOf(el, "type");
      const resourcesPrefix = [CURRENT, LEGACY].find((p) => scriptId === p.resourcesId || scriptType === p.resourcesType);
      if (!resourcesPrefix && !/json/i.test(scriptType ?? "")) {
        const code = rawText(el);
        facts.scripts.push({
          src: attrOf(el, "src"),
          length: code.length,
          usesStorage: /\b(localStorage|sessionStorage|indexedDB)\b|document\.cookie/.test(code),
          buildsDom: /createElement\(|\.innerHTML\s*=|createRoot\(|ReactDOM|\.appendChild\(|\bh\(\s*["']/.test(code),
        });
      }
      if (resourcesPrefix) {
        used[resourcesPrefix.name]++;
        try {
          const parsed = JSON.parse(rawText(el) || "{}");
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            for (const [key, value] of Object.entries(parsed)) {
              if (value && typeof value === "object") screen.resources[key] = value as ResourceDoc;
              else if (typeof value === "string") screen.resources[key] = { description: value };
            }
          }
        } catch {
          findings.push({
            code: "bad-resources",
            severity: "warn",
            message: `The ${resourcesPrefix.resourcesId} block is not valid JSON, so its descriptions were ignored.`,
          });
        }
      }
      continue;
    }

    if (el.tagName === "style") {
      const text = rawText(el);
      // A specimen page's own layout (rows, headings) is not the component's
      // style, so it is not checked against the tokens.
      if (attrOf(el, "data-wave-scaffold") === null) css.push(text);
      collectCssAssets(text, undefined, assets);
      continue;
    }

    const style = attrOf(el, "style");
    if (style) {
      css.push(`x{${style}}`);
      collectCssAssets(`x{${style}}`, id ?? inherited[inherited.length - 1], assets);
    }

    // Legacy names first, so a current name on the same element wins.
    const specAttrs: Record<string, string> = {};
    const elPrefix = waveId !== null ? CURRENT : id !== null ? LEGACY : null;
    for (const pass of [LEGACY, CURRENT]) {
      for (const attr of el.attrs) {
        const split = splitAttr(attr.name);
        if (!split || split.prefix !== pass) continue;
        specAttrs[split.key] = attr.value;
        used[pass.name]++;
      }
    }
    const P = (elPrefix ?? CURRENT).attr;

    const tag = el.tagName;
    const role = attrOf(el, "role");
    const formControl =
      FORM_TAGS.has(tag) || specAttrs.role === "input" || role === "textbox" || role === "combobox";
    const interactive =
      !formControl &&
      (INTERACTIVE_TAGS.has(tag) ||
        role === "button" ||
        role === "link" ||
        attrOf(el, "onclick") !== null ||
        /button|link/i.test(specAttrs.component ?? ""));

    if (!id) {
      const extra = Object.keys(specAttrs).filter((k) => k !== "id");
      if (extra.length > 0) {
        findings.push({
          code: "attr-without-id",
          severity: "warn",
          message: `A <${tag}> carries ${extra.map((k) => P + k).join(", ")} but no ${P}id, so nothing can point at it.`,
        });
      }
      if ((interactive || formControl) && !(tag === "input" && attrOf(el, "type") === "hidden")) {
        unidentifiedInteractive.push({ tag, text: collapse(textContent(el) || attrOf(el, "placeholder") || "") });
      }
      continue;
    }

    idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
    const slug = specAttrs.slug?.trim() || null;
    if (slug) slugCounts.set(slug, (slugCounts.get(slug) ?? 0) + 1);

    for (const key of Object.keys(specAttrs)) {
      if (!KNOWN_KEYS.has(key)) {
        findings.push({
          code: "unknown-attr",
          severity: "info",
          message: `${P}${key} is not in the vocabulary. It is kept, but nothing reads it.`,
          pid: id,
        });
      }
    }

    for (const key of ["to", "to-failure"] as const) {
      const raw = specAttrs[key];
      if (raw === undefined) continue;
      const dest: Destination = parseDestination(raw);
      if (dest.kind === "invalid") {
        findings.push({
          code: "bad-destination",
          severity: "warn",
          message: `${P}${key}="${raw}" is not a destination. Use screen:, node:, modal:, back or url:.`,
          pid: id,
        });
      }
    }

    if (specAttrs.origin !== undefined && TOOL_ORIGINS.has(specAttrs.origin)) {
      findings.push({
        code: "created-in-postit",
        severity: "info",
        message: `${id} was created in review for a word-level binding. Keep the id and remove ${P}origin to adopt it.`,
        pid: id,
      });
    }

    const html: Record<string, string> = {};
    for (const name of NATIVE_ATTRS) {
      const value = attrOf(el, name);
      if (value !== null) html[name] = value;
    }
    const classes = (attrOf(el, "class") ?? "").split(/\s+/).filter(Boolean);
    const children = el.childNodes.filter(isElement);
    const groups = new Map<string, number>();
    for (const c of children) {
      if (c.tagName === "script" || c.tagName === "style" || c.tagName === "template") continue;
      const k = `${c.tagName}.${(attrOf(c, "class") ?? "").split(/\s+/).filter(Boolean).sort().join(".")}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
    }

    nodes.push({
      id,
      slug,
      tag,
      parent: inherited.length ? inherited[inherited.length - 1] : null,
      ancestors: inherited,
      text: collapse(textContent(el) || attrOf(el, "placeholder") || attrOf(el, "alt") || attrOf(el, "value") || ""),
      attrs: specAttrs,
      html,
      classes,
      label: labelOf(el, textById, labelFor),
      hidden:
        attrOf(el, "hidden") !== null ||
        /display\s*:\s*none|visibility\s*:\s*hidden/i.test(style ?? "") ||
        classes.some((c) => /^(is-)?hidden$|^d-none$/.test(c)),
      options: el.tagName === "select" || role === "listbox" ? optionsOf(el) : [],
      iconHints: iconHints(el, classes),
      repeatedChildren: Math.max(0, ...groups.values()),
      childCount: children.length,
      formControl,
      interactive,
      order: nodes.length,
    });
  }

  screen.prefix = used.wave > 0 ? "wave" : used.pi > 0 ? "pi" : null;
  if (used.pi > 0) {
    findings.unshift({
      code: used.wave > 0 ? "mixed-prefix" : "legacy-prefix",
      severity: "info",
      message:
        used.wave > 0
          ? "This file mixes data-wave-* and the older data-pi-* names. Both are read; upgrade it so it uses data-wave-* throughout."
          : "This file uses the older data-pi-* and pi: names. They still work; upgrade it to data-wave-* and wave: when convenient.",
    });
  }

  if (screen.spec === null) {
    findings.unshift({
      code: "missing-spec",
      severity: "info",
      message: `No <meta name="${CURRENT.meta}spec"> in the head, so this is read as an ordinary HTML page with whatever ids it happens to carry.`,
    });
  }

  for (const [id, count] of idCounts) {
    if (count > 1) {
      findings.push({
        code: "duplicate-id",
        severity: "error",
        message: `${id} is used ${count} times. Comments and bindings on it will land on the first.`,
        pid: id,
      });
    }
  }

  for (const [slug, count] of slugCounts) {
    if (count > 1) {
      const first = nodes.find((n) => n.slug === slug);
      findings.push({
        code: "duplicate-slug",
        severity: "warn",
        message: `The slug ${slug} is used ${count} times on this screen, so an address using it is ambiguous.`,
        pid: first?.id,
      });
    }
  }

  // Repeaters need exactly one item template among their descendants.
  for (const node of nodes) {
    if (node.attrs.repeat === undefined) continue;
    const items = nodes.filter((n) => n.attrs.item !== undefined && n.ancestors.includes(node.id));
    if (items.length === 0) {
      findings.push({
        code: "repeater-no-item",
        severity: "warn",
        message: `${node.slug ?? node.id} repeats over ${node.attrs.repeat} but no child is marked data-pi-item.`,
        pid: node.id,
      });
    } else if (items.length > 1) {
      findings.push({
        code: "repeater-multi-item",
        severity: "warn",
        message: `${node.slug ?? node.id} has ${items.length} children marked data-pi-item. Mark exactly one.`,
        pid: node.id,
      });
    }
  }

  if (previous) {
    const now = new Set(nodes.map((n) => n.id));
    for (const old of previous.nodes) {
      if (!now.has(old.id)) {
        findings.push({
          code: "vanished-id",
          severity: "warn",
          message: `${old.id} (${old.slug ?? (old.text || "no slug")}) was in the previous version and is gone. Anything anchored to it is orphaned.`,
          pid: old.id,
        });
      }
    }
  }

  return { screen, nodes, findings, unidentifiedInteractive, css, assets, facts };
}

const NATIVE_ATTRS = [
  "type", "href", "role", "aria-label", "aria-labelledby", "aria-hidden", "aria-required", "aria-current",
  "placeholder", "name", "alt", "title", "required", "disabled", "checked", "selected", "value", "min", "max",
  "step", "maxlength", "minlength", "pattern", "accept", "multiple", "autocomplete", "target", "for", "src",
  "id", "lang", "contenteditable",
];

function inBody(el: Element): boolean {
  let p = el.parentNode;
  while (p && isElement(p)) {
    if (p.tagName === "body") return true;
    p = p.parentNode;
  }
  return false;
}

/** The label naming a form control: aria-label, aria-labelledby, <label for>, or a wrapping <label>. */
function labelOf(el: Element, textById: Map<string, string>, labelFor: Map<string, string>): string | null {
  const aria = attrOf(el, "aria-label");
  if (aria) return aria;
  const by = attrOf(el, "aria-labelledby");
  if (by) {
    const text = by.split(/\s+/).map((i) => textById.get(i) ?? "").join(" ").trim();
    if (text) return text;
  }
  const htmlId = attrOf(el, "id");
  if (htmlId && labelFor.has(htmlId)) return labelFor.get(htmlId) || null;
  let p = el.parentNode;
  while (p && isElement(p)) {
    if (p.tagName === "label") return collapse(textContent(p)) || null;
    if (p.tagName === "fieldset") {
      const legend = p.childNodes.find((c) => isElement(c) && c.tagName === "legend");
      if (legend && FORM_TAGS.has(el.tagName) === false) return collapse(textContent(legend)) || null;
    }
    p = p.parentNode;
  }
  if (el.tagName === "fieldset") {
    const legend = el.childNodes.find((c) => isElement(c) && c.tagName === "legend");
    if (legend) return collapse(textContent(legend)) || null;
  }
  return null;
}

function optionsOf(el: Element): string[] {
  const out: string[] = [];
  for (const d of walk(el)) {
    if (d.tagName === "option" || attrOf(d, "role") === "option") out.push(collapse(textContent(d)));
  }
  return out.slice(0, 200);
}

const ICON_CLASS = /^(?:icon|ico|lucide|fa|fas|far|mdi|ph|bi|ri|ti|material-symbols|material-icons)[-_]([a-z0-9-]+)$/i;

function iconHints(el: Element, classes: string[]): string[] {
  const out: string[] = [];
  for (const c of classes) {
    const m = ICON_CLASS.exec(c);
    if (m && !/^(solid|regular|outline|filled|sm|lg|xs|xl|\d+x)$/i.test(m[1])) out.push(c.toLowerCase());
  }
  if (classes.some((c) => /^material-(icons|symbols)/.test(c))) {
    const t = collapse(textContent(el));
    if (t && !t.includes(" ")) out.push(`material:${t}`);
  }
  for (const d of walk(el)) {
    if (d.tagName !== "use") continue;
    const href = attrOf(d, "href") ?? attrOf(d, "xlink:href");
    if (href) out.push(href.replace(/^#/, ""));
  }
  return [...new Set(out)];
}

const URL_IN_CSS = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

function collectCssAssets(css: string, pid: string | undefined, out: AssetRef[]) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const fontFaces = clean.match(/@font-face\s*\{[^}]*\}/g) ?? [];
  const inFont = new Set<string>();
  for (const block of fontFaces) {
    let m: RegExpExecArray | null;
    const re = new RegExp(URL_IN_CSS.source, "g");
    while ((m = re.exec(block))) {
      inFont.add(m[2]);
      out.push({ kind: "font", url: m[2].trim(), pid });
    }
  }
  let m: RegExpExecArray | null;
  const re = new RegExp(URL_IN_CSS.source, "g");
  while ((m = re.exec(clean))) {
    const url = m[2].trim();
    if (inFont.has(m[2]) || url.startsWith("#")) continue;
    out.push({ kind: "css-url", url, pid });
  }
}

function collectAssets(el: Element, pid: string | undefined, out: AssetRef[]) {
  const push = (kind: AssetRef["kind"], url: string | null) => {
    const u = url?.trim();
    if (u) out.push({ kind, url: u, pid });
  };
  const srcset = (value: string | null) => {
    for (const part of (value ?? "").split(",")) push("srcset", part.trim().split(/\s+/)[0] ?? null);
  };
  switch (el.tagName) {
    case "img":
      push("img", attrOf(el, "src"));
      srcset(attrOf(el, "srcset"));
      break;
    case "source":
      push("source", attrOf(el, "src"));
      srcset(attrOf(el, "srcset"));
      break;
    case "video":
      push("poster", attrOf(el, "poster"));
      push("source", attrOf(el, "src"));
      break;
    case "audio":
      push("source", attrOf(el, "src"));
      break;
    case "image":
      push("img", attrOf(el, "href") ?? attrOf(el, "xlink:href"));
      break;
    case "use": {
      const href = attrOf(el, "href") ?? attrOf(el, "xlink:href");
      if (href && !href.startsWith("#")) push("use", href.split("#")[0]);
      break;
    }
    case "link":
      if (/icon/i.test(attrOf(el, "rel") ?? "")) push("icon", attrOf(el, "href"));
      break;
  }
}

/** Finds the element carrying an id, with its source location. */
export function findElement(html: string, pid: string): Element | null {
  const doc = parseDocument(html);
  for (const el of walk(doc)) {
    if ((attrOf(el, ID_ATTR) ?? attrOf(el, LEGACY_ID_ATTR)) === pid) return el;
  }
  return null;
}
