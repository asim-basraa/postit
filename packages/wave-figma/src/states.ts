import { parse, parseFragment, serializeOuter, type DefaultTreeAdapterMap } from "parse5";

/**
 * Error messages drawn in Figma, as Wave's error states.
 *
 * A component draws its error message as a layer that only its Error variant shows, with
 * the words in a text property (the Text field's Helper). Each instance on a screen sets
 * that property to its own message, even while the instance shows its Default state. The
 * converter puts that message on the screen as the field's hidden error state, drawn as
 * the specimen's Error variant draws it, so Wave and the prototype have it without anything
 * being added to the design that Figma does not already hold.
 */

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

/** The error part of one variant: the text property that holds its words, and its markup in the Error variant. */
export type ErrorPart = { prop: string; html: string };

type Comp = {
  name: string;
  properties?: Record<string, { type: string; default: unknown; options?: string[] | null }>;
  variants: { id: string; variant: Record<string, string> }[];
};

const isEl = (n: Node): n is Element => "tagName" in n;
const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value ?? null;
const textOf = (n: Node): string => (isEl(n) ? n.childNodes.map(textOf).join("") : n.nodeName === "#text" ? (n as DefaultTreeAdapterMap["textNode"]).value : "");

const shownText = (n: Node): string => (isEl(n) ? (n.attrs.some((a) => a.name === "hidden") ? "" : n.childNodes.map(shownText).join("")) : textOf(n));

function* walk(n: Node): Generator<Element> {
  if (isEl(n)) yield n;
  for (const c of "childNodes" in n ? n.childNodes : []) yield* walk(c as Node);
}

/** Each drawn variant's root element on the specimen pages, by variant node id. */
function examples(pages: string[]): Map<string, Element> {
  const out = new Map<string, Element>();
  for (const html of pages) {
    for (const el of walk(parse(html) as unknown as Node)) {
      const v = attr(el, "data-figma-variant");
      const root = v ? el.childNodes.find(isEl) : undefined;
      if (v && root) out.set(v, root);
    }
  }
  return out;
}

/**
 * For every variant of every component that has an Error state: the layer its Error
 * variant shows and it does not, found by the text property's default words. The Error
 * variant is the one with the same other properties, or the closest.
 */
export function errorParts(components: Comp[], pages: string[]): Record<string, ErrorPart> {
  const out: Record<string, ErrorPart> = {};
  const byVariant = examples(pages);
  for (const comp of components) {
    const props = Object.entries(comp.properties ?? {});
    const stateKey = props.find(([k, p]) => /^state$/i.test(k) && p.type === "VARIANT")?.[0];
    if (!stateKey) continue;
    const isError = (v: { variant: Record<string, string> }) => /^error$/i.test(v.variant[stateKey] ?? "");
    const errors = comp.variants.filter(isError);
    const texts = props.filter(([, p]) => p.type === "TEXT" && typeof p.default === "string" && p.default.trim());
    if (!errors.length || !texts.length) continue;
    for (const v of comp.variants) {
      if (isError(v)) continue;
      const same = (e: (typeof errors)[number]) => Object.entries(v.variant).filter(([k, x]) => k !== stateKey && e.variant[k] === x).length;
      const e = [...errors].sort((a, b) => same(b) - same(a))[0];
      const shown = byVariant.get(e.id);
      const base = byVariant.get(v.id);
      if (!shown || !base) continue;
      for (const [prop, p] of texts) {
        const words = String(p.default).trim();
        // What the variant shows: its hidden parts (error parts already drawn) do not count.
        if (shownText(base).includes(words)) continue;
        const leaf = [...walk(shown)].find((el) => textOf(el).trim() === words && !el.childNodes.some((c) => isEl(c) && textOf(c).trim() === words));
        if (leaf) {
          out[v.id] = { prop, html: serializeOuter(leaf) };
          break;
        }
      }
    }
  }
  return out;
}

/**
 * The error part for an instance: its message in the Error variant's markup, hidden, marked
 * as the error state of the instance (resolved to its field by `linkStates` once ids exist).
 * Null when the instance leaves the words blank.
 */
export function errorElement(part: ErrorPart, words: string, instance: string): Element | null {
  if (!words.trim()) return null;
  const el = parseFragment(part.html).childNodes.find(isEl);
  if (!el) return null;
  // The words go in the innermost element that held the default text.
  let leaf: Element = el;
  for (;;) {
    const next = leaf.childNodes.find((c) => isEl(c) && textOf(c).trim()) as Element | undefined;
    if (!next) break;
    leaf = next;
  }
  leaf.childNodes = [{ nodeName: "#text", value: words, parentNode: leaf } as unknown as DefaultTreeAdapterMap["textNode"]];
  // The specimen's own ids and text keys stay on the specimen: on the screen they would collide.
  for (const x of walk(el)) x.attrs = x.attrs.filter((a) => !["data-wave-id", "data-figma-id", "data-figma-text"].includes(a.name));
  el.attrs.push({ name: "hidden", value: "" }, { name: "data-wave-state", value: "error" }, { name: "data-figma-state-of", value: instance });
  return el;
}

/**
 * A specimen draws its error part in every variant (hidden but in Error), so an instance on a
 * screen, which carries its own, has the same structure as its catalogue example.
 */
export function withErrorParts(html: string, parts: Record<string, ErrorPart>, defaults: Record<string, string>): { html: string; added: number } {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const inserts: { at: number; text: string }[] = [];
  for (const el of walk(doc as unknown as Node)) {
    const v = attr(el, "data-figma-variant");
    const part = v ? parts[v] : undefined;
    const root = part ? el.childNodes.find(isEl) : undefined;
    const end = root?.sourceCodeLocation?.endTag?.startOffset;
    if (!part || !root || end === undefined) continue;
    const msg = errorElement(part, defaults[part.prop] ?? "", v!);
    if (msg) inserts.push({ at: end, text: serializeOuter(msg) });
  }
  let out = html;
  for (const i of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, i.at) + i.text + out.slice(i.at);
  return { html: out, added: inserts.length };
}

const CONTROL = /<(input|select|textarea)\b/;

/**
 * After ids: each error part points at its field (the instance's input, select or textarea,
 * or the instance itself when it has none) with data-wave-state-of.
 */
export function linkStates(html: string): { html: string; linked: number; unresolved: string[] } {
  const doc = parse(html, { sourceCodeLocationInfo: true });
  const all = [...walk(doc as unknown as Node)];
  const edits: { from: number; to: number; text: string }[] = [];
  const unresolved: string[] = [];
  for (const el of all) {
    const of = attr(el, "data-figma-state-of");
    if (!of) continue;
    // An instance on a screen, or a variant's example on a specimen.
    const root = all.find((x) => attr(x, "data-figma-instance") === of) ?? all.find((x) => attr(x, "data-figma-variant") === of)?.childNodes.find(isEl);
    const field = root ? [...walk(root)].find((x) => CONTROL.test(`<${x.tagName}`) && x !== el) ?? root : null;
    const id = field ? attr(field, "data-wave-id") : null;
    const loc = el.sourceCodeLocation?.attrs?.["data-figma-state-of"];
    if (!id || !loc) {
      unresolved.push(of);
      continue;
    }
    edits.push({ from: loc.startOffset, to: loc.endOffset, text: `data-wave-state-of="${id}"` });
  }
  let out = html;
  for (const e of edits.sort((a, b) => b.from - a.from)) out = out.slice(0, e.from) + e.text + out.slice(e.to);
  return { html: out, linked: edits.length, unresolved };
}
