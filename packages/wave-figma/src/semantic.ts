import { parse, parseFragment, serialize, type DefaultTreeAdapterMap } from "parse5";

/**
 * The semantic upgrade: real elements where Figma drew pictures of them.
 *
 * A converted screen draws a text field as a box holding a line of text, a
 * button as a box, a checkbox as a square. The upgrade turns those into a real
 * <input>, <button>, <label> with a hidden checkbox, and so on, without
 * changing a pixel. Every change is recorded on the element it touches, so it
 * can be undone exactly (`revertUpgrade`) and the look lock compares the
 * original with the upgrade undone, then compares the two renders.
 *
 * Operations name elements by their Figma id (data-figma-id), and apply to
 * every element with that id.
 */

export type UpgradeOp =
  /** Swap the tag (div to button, label, a, nav, ul, li, h1...). Attributes may be added: type, href, and the free ones. */
  | { op: "tag"; id: string; tag: string; attrs?: Record<string, string> }
  /** Replace an element holding a line of text with an <input>; its text becomes the placeholder or the value. */
  | { op: "input"; id: string; type?: string; text: "placeholder" | "value"; attrs?: Record<string, string>; filledColor?: string }
  /** Make an element a label holding a hidden native checkbox or radio, so it toggles and is announced. */
  | { op: "control"; id: string; kind: "checkbox" | "radio"; name: string; value?: string; checked?: boolean; attrs?: Record<string, string> }
  /** Attributes that cannot change pixels (aria-*, role, name, autocomplete, inputmode, data-wave-*). */
  | { op: "attrs"; id: string; attrs: Record<string, string> }
  /** A screen meta tag in the head (wave:spec, wave:screen, wave:title, wave:route, wave:viewports...). id is ignored. */
  | { op: "meta"; id?: string; name: string; content: string };

export type UpgradeResult = { html: string; applied: { op: string; id: string; count: number }[]; missing: string[] };

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const STYLE_ID = "wave-upgrade";

/**
 * In the base layer, so every utility class on the element still wins: these
 * only take away what the browser adds to a button, a label or an input.
 */
const UPGRADE_CSS = `<style id="${STYLE_ID}">/* Real elements, styled as Figma drew them (wave-figma upgrade). */
@layer base{
:where([data-wave-tag]){display:block;margin:0;padding:0;border:0 solid;background:none;font:inherit;color:inherit;text-align:inherit;letter-spacing:inherit;text-transform:inherit;text-decoration:inherit;appearance:none;-webkit-appearance:none}
:where(button[data-wave-tag]){cursor:pointer}
:where(ul[data-wave-tag],ol[data-wave-tag]){list-style:none}
:where(input[data-wave-from]){display:block;width:100%;margin:0;padding:0;border:0;background:transparent;font:inherit;color:inherit;letter-spacing:inherit;outline:none;appearance:none;-webkit-appearance:none;box-sizing:border-box}
:where(input[data-wave-from])::placeholder{color:inherit;opacity:1}
}
[data-wave-insert]{position:absolute;width:0;height:0;margin:0;padding:0;border:0;opacity:0;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
</style>
`;

const FREE = /^(data-wave-|aria-|role$|name$|autocomplete$|inputmode$|tabindex$|title$|lang$|for$|id$)/;

const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value ?? null;
const setAttr = (el: Element, name: string, value: string) => {
  const a = el.attrs.find((x) => x.name === name);
  if (a) a.value = value;
  else el.attrs.push({ name, value });
};
const isElement = (n: Node): n is Element => "tagName" in n;

function walk(node: Node, fn: (el: Element) => void) {
  if (isElement(node)) fn(node);
  if ("childNodes" in node) for (const c of [...(node as Element).childNodes]) walk(c, fn);
}

function textOf(el: Element): string {
  let s = "";
  const go = (n: Node) => {
    if (n.nodeName === "#text") s += (n as DefaultTreeAdapterMap["textNode"]).value;
    else if ("childNodes" in n) for (const c of (n as Element).childNodes) go(c);
  };
  go(el);
  return s.replace(/\s+/g, " ").trim();
}

function element(tag: string, attrs: Record<string, string>, parent: Element): Element {
  const frag = parseFragment(`<${tag}>`) as unknown as Element;
  const el = frag.childNodes[0] as Element;
  el.attrs = Object.entries(attrs).map(([name, value]) => ({ name, value }));
  el.parentNode = parent;
  return el;
}

function checkAttrs(attrs: Record<string, string> | undefined, extra: RegExp | null, where: string) {
  for (const k of Object.keys(attrs ?? {})) {
    if (!FREE.test(k) && !(extra && extra.test(k))) throw new Error(`${where}: the attribute "${k}" could change how it looks; only aria-*, role, name, autocomplete, inputmode, data-wave-* and the like may be added.`);
  }
}

const TAGS = new Set(["button", "label", "a", "nav", "header", "footer", "main", "section", "article", "aside", "form", "fieldset", "legend", "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6", "p", "span", "div", "dl", "dt", "dd", "strong", "em", "small"]);

export function applyUpgrade(html: string, ops: UpgradeOp[]): UpgradeResult {
  const doc = parse(html) as unknown as Element;
  const byId = new Map<string, Element[]>();
  walk(doc, (el) => {
    // An op names elements by Figma id (every element with it) or instance id (that one instance).
    for (const id of [attr(el, "data-figma-id"), attr(el, "data-figma-instance")]) if (id) byId.set(id, [...(byId.get(id) ?? []), el]);
    const slot = attr(el, "data-figma-slot");
    if (slot) byId.set(`slot:${slot}`, [el]);
  });
  const applied: UpgradeResult["applied"] = [];
  const missing: string[] = [];
  /**
   * "28:204" is every element with that Figma id; "@28:1015" the one instance;
   * "@28:1015 28:204" the 28:204 inside that instance (an instance's inner
   * elements share their ids with every other instance of the component);
   * "slot:28:988" the wrapper that places that instance in its parent (an <li>
   * goes there, so the instance stays exactly its specimen); "28:156 svg" the
   * drawn SVGs inside 28:156 (any tag name works so, for elements with no Figma id).
   */
  const resolve = (spec: string): Element[] => {
    const [scope, inner] = spec.trim().split(/\s+/);
    const outer = byId.get(scope.replace(/^@/, "")) ?? [];
    if (!inner) return outer;
    const found: Element[] = [];
    // "28:156 svg", "@28:1096 input": elements by tag inside, for those with no Figma id of their own
    // (drawn SVGs, the inputs the upgrade inserts).
    const byTag = /^[a-z]+$/.test(inner);
    for (const o of outer) walk(o, (el) => {
      if (el !== o && (byTag ? el.tagName === inner : attr(el, "data-figma-id") === inner || attr(el, "data-figma-instance") === inner)) found.push(el);
    });
    return found;
  };
  const metas: string[] = [];
  for (const op of ops) {
    if (op.op === "meta") {
      if (!/^wave:[a-z-]+$/.test(op.name)) throw new Error(`meta: only wave:* meta tags are added, not ${op.name}.`);
      metas.push(`<meta name="${op.name}" content="${op.content.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`);
      applied.push({ op: "meta", id: op.name, count: 1 });
      continue;
    }
    const els = resolve(op.id);
    if (!els.length) {
      missing.push(op.id);
      continue;
    }
    for (const el of els) {
      switch (op.op) {
        case "attrs":
          checkAttrs(op.attrs, null, `attrs ${op.id}`);
          for (const [k, v] of Object.entries(op.attrs)) setAttr(el, k, v);
          break;
        case "tag": {
          if (!TAGS.has(op.tag)) throw new Error(`tag ${op.id}: <${op.tag}> is not one the upgrade makes.`);
          checkAttrs(op.attrs, /^(type|href|target|rel|disabled)$/, `tag ${op.id}`);
          if (!attr(el, "data-wave-tag")) setAttr(el, "data-wave-tag", el.tagName);
          el.tagName = op.tag;
          el.nodeName = op.tag;
          if (op.tag === "button" && !op.attrs?.type) setAttr(el, "type", "button");
          for (const [k, v] of Object.entries(op.attrs ?? {})) setAttr(el, k, v);
          break;
        }
        case "input": {
          checkAttrs(op.attrs, /^(type|required|maxlength|minlength|pattern|min|max|step|readonly|disabled)$/, `input ${op.id}`);
          if (el.childNodes.some((c) => isElement(c))) throw new Error(`input ${op.id}: the element holds more than a line of text.`);
          const text = textOf(el);
          setAttr(el, "data-wave-from", el.tagName);
          setAttr(el, "data-wave-text", op.text);
          el.tagName = "input";
          el.nodeName = "input";
          el.childNodes = [];
          setAttr(el, "type", op.type ?? "text");
          setAttr(el, op.text, text);
          for (const [k, v] of Object.entries(op.attrs ?? {})) setAttr(el, k, v);
          if (op.filledColor) setAttr(el, "data-wave-filled-color", op.filledColor);
          break;
        }
        case "control": {
          checkAttrs(op.attrs, /^(disabled|required)$/, `control ${op.id}`);
          if (!attr(el, "data-wave-tag")) setAttr(el, "data-wave-tag", el.tagName);
          el.tagName = "label";
          el.nodeName = "label";
          const input = element("input", { type: op.kind, name: op.name, "data-wave-insert": "", ...(op.value ? { value: op.value } : {}), ...(op.checked ? { checked: "" } : {}), ...(op.attrs ?? {}) }, el);
          el.childNodes.unshift(input);
          break;
        }
      }
    }
    applied.push({ op: op.op, id: op.id, count: els.length });
  }
  let out = serialize(doc as unknown as DefaultTreeAdapterMap["parentNode"]);
  out = out.replace(new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?</style>\\n?`), "");
  // Typed text takes the filled colour Figma gives the field; the placeholder keeps the empty one.
  const filled = [...out.matchAll(/data-figma-id="([^"]+)"[^>]*data-wave-filled-color="([^"]+)"|data-wave-filled-color="([^"]+)"[^>]*data-figma-id="([^"]+)"/g)].map((m) => [m[1] ?? m[4], m[2] ?? m[3]]);
  const filledCss = filled.map(([id, c]) => `input[data-figma-id="${id}"]:not(:placeholder-shown){color:${c}}`).join("\n");
  const css = filledCss ? UPGRADE_CSS.replace("</style>", `${filledCss}\n</style>`) : UPGRADE_CSS;
  // A meta tag set again replaces the old one.
  for (const m of metas) {
    const name = /name="([^"]+)"/.exec(m)![1];
    out = out.replace(new RegExp(`<meta name="${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"[^>]*>\\n?`), "");
  }
  out = out.replace("</head>", `${metas.map((m) => m + "\n").join("")}${css}</head>`);
  return { html: out, applied, missing };
}

/** The upgrade undone: original tags, text back in place, inserted inputs and the upgrade's styles removed. */
export function revertUpgrade(html: string): string {
  const doc = parse(html) as unknown as Element;
  walk(doc, (el) => {
    const from = attr(el, "data-wave-from");
    if (from && el.tagName === "input") {
      const which = attr(el, "data-wave-text") ?? "placeholder";
      const text = attr(el, which) ?? "";
      el.tagName = from;
      el.nodeName = from;
      el.attrs = el.attrs.filter((a) => !["type", "placeholder", "value", "required", "maxlength", "minlength", "pattern", "min", "max", "step", "readonly", "disabled"].includes(a.name) && !a.name.startsWith("data-wave-"));
      el.childNodes = [{ nodeName: "#text", value: text, parentNode: el } as unknown as Node] as Element["childNodes"];
    }
    const tag = attr(el, "data-wave-tag");
    if (tag) {
      el.tagName = tag;
      el.nodeName = tag;
      el.attrs = el.attrs.filter((a) => !["type", "href", "target", "rel", "disabled"].includes(a.name));
    }
    el.childNodes = el.childNodes.filter((c) => !(isElement(c) && attr(c, "data-wave-insert") !== null));
    if (el.tagName === "head") el.childNodes = el.childNodes.filter((c) => !(isElement(c) && c.tagName === "style" && attr(c, "id") === STYLE_ID));
  });
  return serialize(doc as unknown as DefaultTreeAdapterMap["parentNode"]);
}

export type OutlineRow = { depth: number; tag: string; id: string | null; instance: string | null; component: string | null; ds: string | null; state: string | null; text: string; attrs: string[] };

/**
 * A screen's elements in a few lines each, for deciding the semantic upgrade:
 * every instance of a design-system component, every element holding text,
 * and every element with Wave attributes, with the ids an upgrade plan names.
 */
export function outline(html: string): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (n: Node, depth: number) => {
    if (!("childNodes" in n)) return;
    const el = n as Element;
    let next = depth;
    if (isElement(el) && el.tagName !== "head" && el.tagName !== "style" && el.tagName !== "script" && el.tagName !== "svg") {
      const own = el.childNodes.filter((c) => c.nodeName === "#text").map((c) => (c as DefaultTreeAdapterMap["textNode"]).value).join("").replace(/\s+/g, " ").trim();
      const component = attr(el, "data-wave-component");
      const wave = el.attrs.filter((a) => a.name.startsWith("data-wave-") && !["data-wave-id", "data-wave-component", "data-wave-ds", "data-wave-state", "data-wave-variant"].includes(a.name)).map((a) => `${a.name.slice(10)}=${a.value}`);
      const inputText = el.tagName === "input" ? attr(el, "placeholder") ?? attr(el, "value") ?? "" : "";
      if (component || own || wave.length || el.tagName === "input" || attr(el, "data-figma-instance")) {
        rows.push({ depth, tag: el.tagName, id: attr(el, "data-figma-id"), instance: attr(el, "data-figma-instance"), component, ds: attr(el, "data-wave-ds"), state: attr(el, "data-wave-state"), text: (own || inputText).slice(0, 60), attrs: wave });
        next = depth + 1;
      }
    }
    if (isElement(el) && el.tagName === "svg") return;
    for (const c of el.childNodes) visit(c, next);
  };
  visit(parse(html) as unknown as Node, 0);
  return rows;
}

/** The outline as text, one element a line. */
export function outlineText(rows: OutlineRow[]): string {
  return rows
    .map((r) => `${"  ".repeat(r.depth)}${r.tag}${r.id ? ` #${r.id}` : ""}${r.instance ? ` @${r.instance}` : ""}${r.component ? ` [${r.component}${r.ds ? ` ${r.ds}` : ""}${r.state ? ` ${r.state}` : ""}]` : ""}${r.text ? ` "${r.text}"` : ""}${r.attrs.length ? ` {${r.attrs.join(" ")}}` : ""}`)
    .join("\n");
}
