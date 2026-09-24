import { attrOf, findElement, isElement, parseDocument, walk, type Element } from "./parse";
import { ATTR_PREFIX, ID_ATTR, ORIGIN_ATTR, newId } from "./vocabulary";

/**
 * Byte-exact edits to a mockup.
 *
 * Every change Post-it makes to somebody's HTML goes through here, and each one
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

function normaliseName(name: string): string | null {
  const full = name.startsWith(ATTR_PREFIX) ? name : `${ATTR_PREFIX}${name}`;
  if (!/^data-pi-[a-z][a-z0-9-]*$/.test(full)) return null;
  return full;
}

/**
 * Sets or removes spec attributes on the element carrying `pid`.
 *
 * A value of null removes the attribute; an empty string writes it bare (for a
 * flag like data-pi-item). The id itself cannot be changed here: it is the
 * designer's.
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

  const splices: Splice[] = [];
  const inserts: string[] = [];

  for (const [rawName, value] of Object.entries(changes)) {
    const name = normaliseName(rawName);
    if (!name) return { ok: false, error: `${rawName} is not a spec attribute.` };
    if (name === ID_ATTR) return { ok: false, error: "The id belongs to the designer and cannot be changed here." };

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

  const id = makeId();
  const rendered = Object.entries({ [ID_ATTR]: id, [ORIGIN_ATTR]: "postit", ...attrs })
    .map(([k, v]) => {
      const name = k.startsWith(ATTR_PREFIX) ? k : `${ATTR_PREFIX}${k}`;
      return `${name}="${escapeAttr(v)}"`;
    })
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
    return { ok: false, error: `No wrapper carries ${ID_ATTR}="${pid}".` };
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
    const id = attrOf(el, ID_ATTR);
    if (id) ids.add(id);
  }
  return ids;
}
