import { attrOf, findElement, isElement, parseDocument, walk, type Element } from "./parse";
import {
  CURRENT,
  ID_ATTR,
  LEGACY,
  LEGACY_ID_ATTR,
  newId,
  splitAttr,
  type PrefixSet,
} from "./vocabulary";

/**
 * Byte-exact edits to a mockup.
 *
 * Every change Wave makes to somebody's HTML goes through here, and each one
 * touches only the characters it has to: the start tag of one element, or the
 * run of text being wrapped. Everything else, formatting and all, stays exactly
 * as the designer wrote it, because a save that reformats a file turns every
 * diff into noise and every later edit by Claude Design into a conflict.
 */

export type EditResult = { ok: true; html: string } | { ok: false; error: string };

type Splice = { start: number; end: number; text: string };

function applySplices(html: string, splices: Splice[]): string {
  let out = html;
  for (const s of [...splices].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, s.start) + s.text + out.slice(s.end);
  }
  return out;
}

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** The prefix an element's id is written with; the current one when it has none. */
export function elementPrefix(el: Element): PrefixSet {
  if (attrOf(el, ID_ATTR) !== null) return CURRENT;
  if (attrOf(el, LEGACY_ID_ATTR) !== null) return LEGACY;
  return CURRENT;
}

/**
 * The key of a spec attribute, given as `bind`, `data-wave-bind` or
 * `data-pi-bind`, or null when it is not one.
 */
function keyOf(name: string): string | null {
  const key = splitAttr(name)?.key ?? name;
  return /^[a-z][a-z0-9-]*$/.test(key) ? key : null;
}

/**
 * Sets or removes spec attributes on the element carrying `pid`.
 *
 * A value of null removes the attribute; an empty string writes it bare (for a
 * flag like data-wave-item). The id itself cannot be changed here: it is the
 * designer's. Attributes are written with the prefix the element already
 * uses, so a file written with the legacy data-pi-* names stays consistent.
 */
export function setAttributes(
  html: string,
  pid: string,
  changes: Record<string, string | null>,
): EditResult {
  const el = findElement(html, pid);
  if (!el) return { ok: false, error: `No element carries ${ID_ATTR}="${pid}".` };
  const loc = el.sourceCodeLocation;
  if (!loc?.startTag) return { ok: false, error: "That element has no location in the source." };
  const prefix = elementPrefix(el);

  const splices: Splice[] = [];
  const inserts: string[] = [];

  for (const [rawName, value] of Object.entries(changes)) {
    const key = keyOf(rawName);
    if (!key) return { ok: false, error: `${rawName} is not a spec attribute.` };
    if (key === "id") return { ok: false, error: "The id belongs to the designer and cannot be changed here." };
    const name = `${prefix.attr}${key}`;

    const attrLoc = loc.attrs?.[name];
    const rendered = value === "" ? name : `${name}="${escapeAttr(value ?? "")}"`;

    if (attrLoc) {
      if (value === null) {
        // Take the whitespace before it too, so removing leaves no gap.
        let start = attrLoc.startOffset;
        while (start > loc.startTag.startOffset && /\s/.test(html[start - 1])) start--;
        splices.push({ start, end: attrLoc.endOffset, text: "" });
      } else {
        splices.push({ start: attrLoc.startOffset, end: attrLoc.endOffset, text: rendered });
      }
    } else if (value !== null) {
      inserts.push(rendered);
    }
  }

  if (inserts.length > 0) {
    // Before the closing > (or />) of the start tag.
    let at = loc.startTag.endOffset - 1;
    if (html[at - 1] === "/") at--;
    while (at > loc.startTag.startOffset && /\s/.test(html[at - 1])) at--;
    splices.push({ start: at, end: at, text: ` ${inserts.join(" ")}` });
  }

  return { ok: true, html: applySplices(html, splices) };
}

/** Decoded length of a raw source run, and the source offset of each decoded character. */
function decodedOffsets(raw: string): number[] {
  const map: number[] = [];
  let i = 0;
  while (i < raw.length) {
    map.push(i);
    if (raw[i] === "&") {
      const m = /^&(#x[0-9a-f]+|#[0-9]+|[a-z][a-z0-9]*);/i.exec(raw.slice(i));
      if (m) {
        i += m[0].length;
        continue;
      }
    }
    i += 1;
  }
  map.push(raw.length);
  return map;
}

type TextRun = { value: string; start: number; end: number; offset: number };

/** Text nodes under an element, in order, with their decoded offset within its text. */
function textRuns(el: Element): TextRun[] {
  const runs: TextRun[] = [];
  let offset = 0;
  const visit = (node: Element) => {
    for (const child of node.childNodes) {
      if (child.nodeName === "#text" && "value" in child) {
        const loc = child.sourceCodeLocation;
        if (loc) runs.push({ value: child.value, start: loc.startOffset, end: loc.endOffset, offset });
        offset += child.value.length;
      } else if (isElement(child) && child.tagName !== "script" && child.tagName !== "style") {
        visit(child);
      }
    }
  };
  visit(el);
  return runs;
}

/**
 * Wraps characters [start, end) of an element's text in a new node.
 *
 * Offsets are into the element's textContent, which is what a browser reports
 * for a selection. The range has to sit inside one run of text: a selection
 * that crosses into a bold word would need the markup rearranged, and that is
 * the designer's call to make, not ours.
 */
export function wrapText(
  html: string,
  pid: string,
  start: number,
  end: number,
  attrs: Record<string, string>,
  makeId: () => string = () => newId(),
): EditResult & { id?: string } {
  if (!(end > start)) return { ok: false, error: "Select at least one character." };
  const el = findElement(html, pid);
  if (!el) return { ok: false, error: `No element carries ${ID_ATTR}="${pid}".` };

  const run = textRuns(el).find((r) => start >= r.offset && end <= r.offset + r.value.length);
  if (!run) {
    return {
      ok: false,
      error: "The selection crosses other markup. Select words within one run of plain text.",
    };
  }

  const raw = html.slice(run.start, run.end);
  const map = decodedOffsets(raw);
  const from = run.start + map[start - run.offset];
  const to = run.start + map[end - run.offset];

  // The new span uses the same prefix as the element it sits in.
  const prefix = elementPrefix(el);
  const id = makeId();
  const rendered = Object.entries({ id, origin: "wave", ...attrs })
    .map(([k, v]) => `${prefix.attr}${keyOf(k) ?? k}="${escapeAttr(v)}"`)
    .join(" ");

  const out = applySplices(html, [
    { start: to, end: to, text: "</span>" },
    { start: from, end: from, text: `<span ${rendered}>` },
  ]);
  return { ok: true, html: out, id };
}

/** Removes a wrapper element, keeping what is inside it. */
export function unwrap(html: string, pid: string): EditResult {
  const el = findElement(html, pid);
  const loc = el?.sourceCodeLocation;
  if (!el || !loc?.startTag || !loc.endTag) {
    return { ok: false, error: `No wrapper carries an id="${pid}".` };
  }
  return {
    ok: true,
    html: applySplices(html, [
      { start: loc.endTag.startOffset, end: loc.endTag.endOffset, text: "" },
      { start: loc.startTag.startOffset, end: loc.startTag.endOffset, text: "" },
    ]),
  };
}

/** Every id in a document, for checking a fresh one does not collide. */
export function allIds(html: string): Set<string> {
  const ids = new Set<string>();
  for (const el of walk(parseDocument(html))) {
    const id = attrOf(el, ID_ATTR) ?? attrOf(el, LEGACY_ID_ATTR);
    if (id) ids.add(id);
  }
  return ids;
}

/**
 * Rewrites a file from the legacy data-pi-* / pi: names to data-wave-* / wave:.
 *
 * Only the names change: attribute names, meta names, and the resources
 * block's id and type. Every value, and every other byte, stays where it was.
 * Where an element already carries the current name for a key, the legacy
 * duplicate is left alone rather than creating a second attribute of the same
 * name.
 */
export function upgradePrefix(html: string): { ok: true; html: string; changed: number } {
  const splices: Splice[] = [];
  for (const el of walk(parseDocument(html))) {
    const loc = el.sourceCodeLocation;
    if (!loc?.startTag) continue;
    const names = new Set(el.attrs.map((a) => a.name));

    for (const attr of el.attrs) {
      const aloc = loc.attrs?.[attr.name];
      if (!aloc) continue;

      if (attr.name.startsWith(LEGACY.attr)) {
        const renamed = CURRENT.attr + attr.name.slice(LEGACY.attr.length);
        if (names.has(renamed)) continue;
        splices.push({ start: aloc.startOffset, end: aloc.startOffset + attr.name.length, text: renamed });
        if (attr.name === `${LEGACY.attr}origin` && attr.value === "postit") {
          const raw = html.slice(aloc.startOffset, aloc.endOffset);
          const at = raw.indexOf("postit", attr.name.length);
          if (at >= 0) splices.push({ start: aloc.startOffset + at, end: aloc.startOffset + at + 6, text: "wave" });
        }
        continue;
      }

      // Values that carry the old names: meta names, the resources block, and
      // the origin marker the old tool wrote.
      const valueSwap =
        el.tagName === "meta" && attr.name === "name" && attr.value.startsWith(LEGACY.meta)
          ? CURRENT.meta + attr.value.slice(LEGACY.meta.length)
          : el.tagName === "script" && attr.name === "id" && attr.value === LEGACY.resourcesId
            ? CURRENT.resourcesId
            : el.tagName === "script" && attr.name === "type" && attr.value === LEGACY.resourcesType
              ? CURRENT.resourcesType
              : null;
      if (valueSwap === null) continue;
      const raw = html.slice(aloc.startOffset, aloc.endOffset);
      const at = raw.indexOf(attr.value, attr.name.length);
      if (at < 0) continue;
      splices.push({ start: aloc.startOffset + at, end: aloc.startOffset + at + attr.value.length, text: valueSwap });
    }
  }
  return { ok: true, html: applySplices(html, splices), changed: splices.length };
}
