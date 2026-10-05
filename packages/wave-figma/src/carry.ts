import { parse, serialize, type DefaultTreeAdapterMap } from "parse5";

/**
 * Keeps Wave ids across conversions. A page converted again from Figma is new
 * HTML, but its elements are the same Figma layers: each element takes the
 * data-wave-id its layer had in the previous version, so comments, answers and
 * the catalogue's usage still point at it. A native control the semantic pass
 * inserted has no layer of its own; it is matched through the layer it sits in (see layerKey).
 * Ids are only carried, never invented: run assignIds afterwards for the rest.
 */

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

const isElement = (n: Node): n is Element => "tagName" in n;
const attr = (el: Element, name: string) => el.attrs.find((a) => a.name === name)?.value;

function* elements(n: Node): Generator<Element> {
  if (isElement(n)) yield n;
  const kids = "childNodes" in n ? n.childNodes : [];
  for (const c of kids) yield* elements(c as Node);
  if (isElement(n) && n.tagName === "template") yield* elements((n as unknown as { content: Node }).content);
}

/**
 * The layer an element stands for: an instance by its own instance id, a layer inside an
 * instance by that instance and its id (every instance of a component shares its layers'
 * ids), any other layer by its Figma id (or the variant it frames). An element Figma has no
 * layer for (a control the semantic pass inserted, an exported SVG, the specimen canvas) is
 * known by the nearest element that has one, its tag, and its place among such siblings.
 */
function instanceOf(el: Element): string | undefined {
  for (let p = el.parentNode as Node | null; p && isElement(p); p = p.parentNode as Node | null) {
    const i = attr(p, "data-figma-instance");
    if (i) return i;
  }
  return undefined;
}

function layerKey(el: Element): string {
  const inst = attr(el, "data-figma-instance");
  if (inst) return `@${inst}`;
  const id = attr(el, "data-figma-id");
  const scope = id ? instanceOf(el) : undefined;
  const own = (id ? (scope ? `@${scope} ${id}` : id) : undefined) ?? (attr(el, "data-figma-variant") ? `variant:${attr(el, "data-figma-variant")}` : attr(el, "data-figma-slot") ? `slot:${attr(el, "data-figma-slot")}` : undefined);
  if (own) return own;
  const parent = el.parentNode as Node | null;
  if (!parent || !isElement(parent)) return el.tagName;
  const unnamed = parent.childNodes.filter((c): c is Element => isElement(c as Node) && (c as Element).tagName === el.tagName && !attr(c as Element, "data-figma-id") && !attr(c as Element, "data-figma-variant") && !attr(c as Element, "data-figma-slot"));
  return `${layerKey(parent)}>${el.tagName}${unnamed.indexOf(el)}`;
}

/** The variant an element is drawn in, its tag and its words (or value): null when it says nothing. */
function wordsKey(el: Element): string | null {
  let variant: string | undefined;
  for (let p: Node | null = el; p && isElement(p); p = p.parentNode as Node | null) {
    variant = attr(p, "data-figma-variant");
    if (variant) break;
  }
  // Its own words only, so a wrapper and the text inside it are told apart.
  let words = "";
  for (const c of el.childNodes) if (c.nodeName === "#text") words += (c as DefaultTreeAdapterMap["textNode"]).value;
  words = (words.trim() || attr(el, "value") || attr(el, "placeholder") || "").replace(/\s+/g, " ").trim();
  return variant && words ? `${variant}|${el.tagName}|${words}` : null;
}

export function carryIds(html: string, previous: string): { html: string; carried: number; vanished: string[] } {
  // A layer drawn more than once (a specimen's state examples repeat their variant) is told
  // apart by its place: the nth element with a key takes the id the nth had.
  const keyed = (root: Node) => {
    const seen = new Map<string, number>();
    return [...elements(root)].map((el) => {
      const k = layerKey(el);
      const n = seen.get(k) ?? 0;
      seen.set(k, n + 1);
      return { el, key: n ? `${k}#${n}` : k };
    });
  };
  const before = new Map<string, string>();
  // A layer's test id goes with it too: tests written against it keep working.
  const testIds = new Map<string, string>();
  const all: string[] = [];
  for (const { el, key } of keyed(parse(previous))) {
    const id = attr(el, "data-wave-id");
    if (id) all.push(id);
    if (id && !before.has(key)) before.set(key, id);
    const tid = attr(el, "data-testid");
    if (tid && !testIds.has(key)) testIds.set(key, tid);
  }
  const doc = parse(html);
  const used = new Set<string>();
  const usedTest = new Set<string>();
  let carried = 0;
  for (const { el, key } of keyed(doc)) {
    const tid = testIds.get(key);
    if (tid && !usedTest.has(tid) && !attr(el, "data-testid")) {
      el.attrs.push({ name: "data-testid", value: tid });
      usedTest.add(tid);
    }
    const id = before.get(key);
    if (!id || used.has(id) || attr(el, "data-wave-id")) continue;
    el.attrs.push({ name: "data-wave-id", value: id });
    used.add(id);
    carried++;
  }
  // A layer Figma now reports under another id (its code gave a variant's layers the default
  // variant's ids before, their own now) keeps its id when, inside the same variant, one
  // element of the same tag says the same words in both versions.
  const byWords = (root: Node, take: (el: Element) => boolean) => {
    const m = new Map<string, Element[]>();
    for (const el of elements(root)) {
      if (!take(el)) continue;
      const k = wordsKey(el);
      if (k) m.set(k, [...(m.get(k) ?? []), el]);
    }
    return m;
  };
  const left = new Set(all.filter((id) => !used.has(id)));
  const oldWords = byWords(parse(previous), (el) => left.has(attr(el, "data-wave-id") ?? ""));
  const newWords = byWords(doc, (el) => !attr(el, "data-wave-id"));
  for (const [k, olds] of oldWords) {
    const news = newWords.get(k);
    if (olds.length !== 1 || news?.length !== 1) continue;
    const id = attr(olds[0], "data-wave-id")!;
    news[0].attrs.push({ name: "data-wave-id", value: id });
    const tid = attr(olds[0], "data-testid");
    if (tid && !usedTest.has(tid) && !attr(news[0], "data-testid")) news[0].attrs.push({ name: "data-testid", value: tid });
    used.add(id);
    carried++;
  }
  const vanished = all.filter((id) => !used.has(id));
  return { html: serialize(doc as unknown as DefaultTreeAdapterMap["parentNode"]), carried, vanished };
}
