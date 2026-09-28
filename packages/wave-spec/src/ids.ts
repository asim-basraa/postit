import { attrOf, isElement, parseDocument, textContent, walk, type Element } from "./parse";
import { CURRENT, ID_ATTR, LEGACY, LEGACY_ID_ATTR, newId, splitAttr } from "./vocabulary";
import { escapeAttr } from "./edit";

/**
 * Gives every element that needs an identity a data-wave-id, before any
 * question is asked, so questions and answers stay attached to the same
 * element from the first dry run on. Existing ids are never touched.
 *
 * Only the first of a run of same-shaped siblings is identified: the rest are
 * samples of a list's item template.
 */

const STRUCTURAL = new Set(["section", "header", "footer", "main", "aside", "nav", "article", "form", "dialog", "ul", "ol", "dl", "table", "fieldset", "menu"]);
const CONTROL = new Set(["a", "button", "input", "select", "textarea", "label", "legend", "summary"]);
const CONTENT = new Set(["h1", "h2", "h3", "h4", "h5", "h6", "p", "img", "picture", "svg", "video", "audio", "iframe", "canvas", "figcaption", "blockquote", "time", "progress"]);
const TEXTY = new Set(["span", "strong", "em", "b", "small", "div", "li", "dt", "dd", "td", "th", "i"]);
const SKIP = new Set(["html", "head", "body", "script", "style", "template", "meta", "link", "title", "br", "hr", "option", "optgroup", "source", "track", "wbr", "noscript", "tr", "thead", "tbody", "tfoot"]);

function shape(el: Element): string {
  return `${el.tagName}.${(attrOf(el, "class") ?? "").split(/\s+/).filter(Boolean).sort().join(".")}`;
}

function needsId(el: Element): boolean {
  if (SKIP.has(el.tagName)) return false;
  if (attrOf(el, "type") === "hidden") return false;
  if (el.attrs.some((a) => splitAttr(a.name))) return true;
  if (STRUCTURAL.has(el.tagName) || CONTROL.has(el.tagName) || CONTENT.has(el.tagName)) return true;
  if (attrOf(el, "role") || attrOf(el, "onclick") !== null || attrOf(el, "tabindex") !== null) return true;
  const cls = (attrOf(el, "class") ?? "").toLowerCase();
  if (/card|modal|dialog|toast|banner|badge|pill|chip|avatar|logo|icon|tooltip|skeleton|spinner|empty|error|alert|tabs?\b|menu|dropdown|carousel|chart|map/.test(cls)) return true;
  if (TEXTY.has(el.tagName)) {
    const hasElementKids = el.childNodes.some((c) => isElement(c) && !["br", "wbr"].includes(c.tagName));
    const text = textContent(el).trim();
    if (text && !hasElementKids) return true;
    // A wrapper of repeated children is a list.
    const kids = el.childNodes.filter(isElement);
    const counts = new Map<string, number>();
    for (const k of kids) counts.set(shape(k), (counts.get(shape(k)) ?? 0) + 1);
    if ([...counts.values()].some((n) => n >= 3)) return true;
  }
  return false;
}

export function assignIds(html: string): { html: string; added: number } {
  const doc = parseDocument(html);
  const usesLegacy = /\sdata-pi-id=/.test(html) && !/\sdata-wave-id=/.test(html);
  const attr = usesLegacy ? LEGACY_ID_ATTR : ID_ATTR;
  const taken = new Set<string>();
  const samples = new Set<Element>();
  const firsts = new Set<Element>();
  for (const el of walk(doc)) {
    const id = attrOf(el, ID_ATTR) ?? attrOf(el, LEGACY_ID_ATTR);
    if (id) taken.add(id);
    // Siblings after the first of a same-shaped run are samples.
    const kids = el.childNodes.filter(isElement);
    const seenShape = new Map<string, number>();
    for (const k of kids) {
      const sh = shape(k);
      const n = (seenShape.get(sh) ?? 0) + 1;
      seenShape.set(sh, n);
      const run = kids.filter((x) => shape(x) === sh).length;
      if (n === 1 && run >= 2) firsts.add(k);
      if (n > 1 && run >= 2 && !(attrOf(k, ID_ATTR) ?? attrOf(k, LEGACY_ID_ATTR))) samples.add(k);
    }
  }
  const inSample = (el: Element) => {
    let p: Element | null = el;
    while (p) {
      if (samples.has(p)) return true;
      p = p.parentNode && isElement(p.parentNode) ? p.parentNode : null;
    }
    return false;
  };
  const inSvg = (el: Element) => {
    let p = el.parentNode;
    while (p && isElement(p)) {
      if (p.tagName === "svg") return true;
      p = p.parentNode;
    }
    return false;
  };

  const inserts: { at: number; text: string }[] = [];
  for (const el of walk(doc)) {
    if (attrOf(el, ID_ATTR) ?? attrOf(el, LEGACY_ID_ATTR)) continue;
    if (inSvg(el) || inSample(el) || (!needsId(el) && !(firsts.has(el) && !SKIP.has(el.tagName)))) continue;
    const loc = el.sourceCodeLocation?.startTag;
    if (!loc) continue;
    let id = newId();
    while (taken.has(id)) id = newId();
    taken.add(id);
    // Right after the tag name.
    inserts.push({ at: loc.startOffset + 1 + el.tagName.length, text: ` ${attr}="${escapeAttr(id)}"` });
  }
  let out = html;
  for (const ins of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, ins.at) + ins.text + out.slice(ins.at);
  return { html: out, added: inserts.length };
}

export { CURRENT, LEGACY };
