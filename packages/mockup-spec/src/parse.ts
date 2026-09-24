import { parse, type DefaultTreeAdapterMap } from "parse5";
import {
  ATTR_PREFIX,
  FORM_TAGS,
  ID_ATTR,
  INTERACTIVE_TAGS,
  KNOWN_ATTRS,
  META,
  ORIGIN_ATTR,
  RESOURCES_SCRIPT_ID,
  RESOURCES_SCRIPT_TYPE,
} from "./vocabulary";
import { parseDestination, type Destination } from "./destination";

export type Element = DefaultTreeAdapterMap["element"];
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
  /** From `<script type="application/pi+json" id="pi-resources">`. */
  resources: Record<string, ResourceDoc>;
  /** The document's own `<title>`. */
  documentTitle: string | null;
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
  /** Every data-pi-* attribute on the element, raw, keyed by the attribute without its prefix. */
  attrs: Record<string, string>;
  /** Other attributes worth knowing: type, href, role, aria-label, placeholder. */
  html: Record<string, string>;
  formControl: boolean;
  interactive: boolean;
  /** Document order among nodes. */
  order: number;
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
    resources: {},
    documentTitle: null,
  };

  const nodes: SpecNode[] = [];
  const unidentifiedInteractive: { tag: string; text: string }[] = [];
  const css: string[] = [];
  const idCounts = new Map<string, number>();
  const slugCounts = new Map<string, number>();

  // Identified ancestors of the element being visited, maintained by a stack
  // keyed on the parse5 parent chain.
  const ancestry = new Map<Element, string[]>();

  const metaNames = Object.entries(META) as [keyof typeof META, string][];

  for (const el of walk(doc)) {
    const parentEl = el.parentNode && isElement(el.parentNode) ? el.parentNode : null;
    const inherited = parentEl ? (ancestry.get(parentEl) ?? []) : [];
    const id = attrOf(el, ID_ATTR);
    ancestry.set(el, id ? [...inherited, id] : inherited);

    if (el.tagName === "meta") {
      const name = attrOf(el, "name");
      const content = attrOf(el, "content");
      for (const [key, metaName] of metaNames) {
        if (name === metaName) screen[key] = content;
      }
      continue;
    }

    if (el.tagName === "title" && screen.documentTitle === null) {
      screen.documentTitle = collapse(textContent(el)) || null;
      continue;
    }

    if (el.tagName === "script") {
      if (attrOf(el, "id") === RESOURCES_SCRIPT_ID || attrOf(el, "type") === RESOURCES_SCRIPT_TYPE) {
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
            message: "The pi-resources block is not valid JSON, so its descriptions were ignored.",
          });
        }
      }
      continue;
    }

    if (el.tagName === "style") {
      css.push(rawText(el));
      continue;
    }

    const style = attrOf(el, "style");
    if (style) css.push(`x{${style}}`);

    const specAttrs: Record<string, string> = {};
    for (const attr of el.attrs) {
      if (attr.name.startsWith(ATTR_PREFIX)) {
        specAttrs[attr.name.slice(ATTR_PREFIX.length)] = attr.value;
      }
    }

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
      const extra = Object.keys(specAttrs).filter((k) => `${ATTR_PREFIX}${k}` !== ID_ATTR);
      if (extra.length > 0) {
        findings.push({
          code: "attr-without-id",
          severity: "warn",
          message: `A <${tag}> carries ${extra.map((k) => ATTR_PREFIX + k).join(", ")} but no ${ID_ATTR}, so nothing can point at it.`,
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
      if (!KNOWN_ATTRS.has(ATTR_PREFIX + key)) {
        findings.push({
          code: "unknown-attr",
          severity: "info",
          message: `${ATTR_PREFIX}${key} is not in the vocabulary. It is kept, but nothing reads it.`,
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
          message: `${ATTR_PREFIX}${key}="${raw}" is not a destination. Use screen:, node:, modal:, back or url:.`,
          pid: id,
        });
      }
    }

    if (specAttrs.origin === "postit") {
      findings.push({
        code: "created-in-postit",
        severity: "info",
        message: `${id} was created in Post-it for a word-level binding. Keep the id and remove ${ORIGIN_ATTR} to adopt it.`,
        pid: id,
      });
    }

    const html: Record<string, string> = {};
    for (const name of ["type", "href", "role", "aria-label", "placeholder", "name", "alt"]) {
      const value = attrOf(el, name);
      if (value !== null) html[name] = value;
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
      formControl,
      interactive,
      order: nodes.length,
    });
  }

  if (screen.spec === null) {
    findings.unshift({
      code: "missing-spec",
      severity: "info",
      message: `No <meta name="${META.spec}"> in the head, so this is read as an ordinary HTML page with whatever ids it happens to carry.`,
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

  return { screen, nodes, findings, unidentifiedInteractive, css };
}

/** Finds the element carrying an id, with its source location. */
export function findElement(html: string, pid: string): Element | null {
  const doc = parseDocument(html);
  for (const el of walk(doc)) {
    if (attrOf(el, ID_ATTR) === pid) return el;
  }
  return null;
}
