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
  const prefix = elementPrefix(el);
  const named: Record<string, string | null> = {};
  for (const [rawName, value] of Object.entries(changes)) {
    const key = keyOf(rawName);
    if (!key) return { ok: false, error: `${rawName} is not a spec attribute.` };
    if (key === "id") return { ok: false, error: "The id belongs to the designer and cannot be changed here." };
    named[`${prefix.attr}${key}`] = value;
  }
  return setOnElement(html, el, named);
}

/** Native HTML attributes a spec answer can live in (alt, type, aria-label, min and so on). */
const NATIVE_WRITABLE = new Set([
  "alt", "type", "aria-label", "aria-hidden", "target", "min", "max", "step", "accept", "autocomplete", "lang", "title", "placeholder", "rel",
]);

/** Sets native attributes on the element carrying `pid`. Only a known, harmless set may be written. */
export function setNativeAttributes(html: string, pid: string, changes: Record<string, string | null>): EditResult {
  const el = findElement(html, pid);
  if (!el) return { ok: false, error: `No element carries ${ID_ATTR}="${pid}".` };
  for (const name of Object.keys(changes)) {
    if (!NATIVE_WRITABLE.has(name)) return { ok: false, error: `${name} cannot be written by Wave.` };
  }
  return setOnElement(html, el, changes);
}

/** Sets attributes on the <html> element (its lang). */
export function setDocumentAttribute(html: string, name: "lang", value: string): EditResult {
  const el = [...walk(parseDocument(html))].find((e) => e.tagName === "html");
  if (!el?.sourceCodeLocation?.startTag) return { ok: false, error: "The document has no <html> tag to set it on." };
  return setOnElement(html, el, { [name]: value });
}

function setOnElement(html: string, el: Element, named: Record<string, string | null>): EditResult {
  const loc = el.sourceCodeLocation;
  if (!loc?.startTag) return { ok: false, error: "That element has no location in the source." };

  const splices: Splice[] = [];
  const inserts: string[] = [];

  for (const [name, value] of Object.entries(named)) {

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

/** Which prefix a document mostly uses, so new names match it. */
function documentPrefix(html: string): PrefixSet {
  return /\sdata-wave-|name="wave:/.test(html) || !/\sdata-pi-|name="pi:/.test(html) ? CURRENT : LEGACY;
}

/** Sets a screen-level meta tag (wave:<key>), adding it to the head if absent. */
export function setMeta(html: string, key: string, value: string | null): EditResult {
  const doc = parseDocument(html);
  for (const el of walk(doc)) {
    if (el.tagName !== "meta") continue;
    const name = attrOf(el, "name");
    if (name !== `${CURRENT.meta}${key}` && name !== `${LEGACY.meta}${key}`) continue;
    const loc = el.sourceCodeLocation;
    if (!loc) continue;
    if (value === null) return { ok: true, html: applySplices(html, [{ start: loc.startOffset, end: loc.endOffset, text: "" }]) };
    return setOnElement(html, el, { content: value });
  }
  if (value === null) return { ok: true, html };
  const tag = `<meta name="${documentPrefix(html).meta}${key}" content="${escapeAttr(value)}">`;
  return insertInHead(html, tag);
}

function insertInHead(html: string, text: string): EditResult {
  const doc = parseDocument(html);
  const head = [...walk(doc)].find((e) => e.tagName === "head");
  const loc = head?.sourceCodeLocation;
  if (loc?.endTag) {
    // Keep the indentation of the line the closing tag sits on.
    return { ok: true, html: applySplices(html, [{ start: loc.endTag.startOffset, end: loc.endTag.startOffset, text: `${text}\n` }]) };
  }
  const at = html.search(/<body[\s>]/i);
  if (at >= 0) return { ok: true, html: applySplices(html, [{ start: at, end: at, text: `${text}\n` }]) };
  return { ok: true, html: `${text}\n${html}` };
}

/** Sets one data path's description in the resources block, creating the block if needed. */
export function setResource(
  html: string,
  path: string,
  doc: { type?: string; source?: string; description?: string },
): EditResult {
  const parsedDoc = parseDocument(html);
  for (const el of walk(parsedDoc)) {
    if (el.tagName !== "script") continue;
    const id = attrOf(el, "id");
    const type = attrOf(el, "type");
    if (![CURRENT.resourcesId, LEGACY.resourcesId].includes(id ?? "") && ![CURRENT.resourcesType, LEGACY.resourcesType].includes(type ?? "")) continue;
    const loc = el.sourceCodeLocation;
    if (!loc?.startTag || !loc.endTag) continue;
    let current: Record<string, unknown> = {};
    try {
      current = JSON.parse(html.slice(loc.startTag.endOffset, loc.endTag.startOffset) || "{}");
    } catch {
      return { ok: false, error: "The resources block is not valid JSON; fix it by hand first." };
    }
    current[path] = doc;
    const body = `\n${JSON.stringify(current, null, 2)}\n`;
    return { ok: true, html: applySplices(html, [{ start: loc.startTag.endOffset, end: loc.endTag.startOffset, text: body }]) };
  }
  const p = documentPrefix(html);
  const block = `<script type="${p.resourcesType}" id="${p.resourcesId}">\n${JSON.stringify({ [path]: doc }, null, 2)}\n</script>`;
  return insertInHead(html, block);
}

/** Records a waived answer on an element (pid) or the screen (null), as JSON {field: reason}. */
export function setWaived(html: string, pid: string | null, field: string, reason: string | null): EditResult {
  let current: Record<string, string> = {};
  const read = (raw: string | null | undefined) => {
    try {
      const v = JSON.parse(raw || "{}");
      if (v && typeof v === "object") current = v;
    } catch {
      current = {};
    }
  };
  if (pid) {
    const el = findElement(html, pid);
    if (!el) return { ok: false, error: `No element carries ${ID_ATTR}="${pid}".` };
    read(attrOf(el, `${elementPrefix(el).attr}waived`));
  } else {
    for (const el of walk(parseDocument(html))) {
      const name = attrOf(el, "name");
      if (el.tagName === "meta" && (name === `${CURRENT.meta}waived` || name === `${LEGACY.meta}waived`)) read(attrOf(el, "content"));
    }
  }
  if (reason === null) delete current[field];
  else current[field] = reason;
  const value = Object.keys(current).length ? JSON.stringify(current) : null;
  return pid ? setAttributes(html, pid, { waived: value }) : setMeta(html, "waived", value);
}
