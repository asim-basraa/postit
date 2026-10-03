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
 * The layer an element stands for: its own Figma id (or the variant it frames). An element
 * Figma has no layer for (a control the semantic pass inserted, an exported SVG, the
 * specimen canvas) is known by the nearest element that has one, its tag, and its place
 * among such siblings.
 */
function layerKey(el: Element): string {
  const own = attr(el, "data-figma-id") ?? (attr(el, "data-figma-variant") ? `variant:${attr(el, "data-figma-variant")}` : undefined);
  if (own) return own;
  const parent = el.parentNode as Node | null;
  if (!parent || !isElement(parent)) return el.tagName;
  const unnamed = parent.childNodes.filter((c): c is Element => isElement(c as Node) && (c as Element).tagName === el.tagName && !attr(c as Element, "data-figma-id") && !attr(c as Element, "data-figma-variant"));
  return `${layerKey(parent)}>${el.tagName}${unnamed.indexOf(el)}`;
}

export function carryIds(html: string, previous: string): { html: string; carried: number; vanished: string[] } {
  const before = new Map<string, string>();
  for (const el of elements(parse(previous))) {
    const key = layerKey(el), id = attr(el, "data-wave-id");
    if (id && !before.has(key)) before.set(key, id);
  }
  const doc = parse(html);
  const used = new Set<string>();
  let carried = 0;
  for (const el of elements(doc)) {
    const id = before.get(layerKey(el));
    if (!id || used.has(id) || attr(el, "data-wave-id")) continue;
    el.attrs.push({ name: "data-wave-id", value: id });
    used.add(id);
    carried++;
  }
  const vanished = [...before.values()].filter((id) => !used.has(id));
  return { html: serialize(doc as unknown as DefaultTreeAdapterMap["parentNode"]), carried, vanished };
}
