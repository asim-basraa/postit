import { parse, type DefaultTreeAdapterMap } from "parse5";

/**
 * The look lock: the semantic pass may add meaning to a converted screen, never
 * change how it looks. Two checks prove it. This one compares the two
 * documents and lists every change other than attributes that cannot affect
 * rendering (data-wave-*, aria-*, role and a few more). The other is a pixel
 * comparison of the two renders (compareImages), which must be identical.
 */

export type LockChange = { path: string; kind: "tag" | "text" | "attribute" | "children" | "style"; before: string; after: string };

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];
type Text = DefaultTreeAdapterMap["textNode"];

const FREE = [/^data-wave-/, /^data-pi-/, /^aria-/, /^role$/, /^id$/, /^for$/, /^name$/, /^autocomplete$/, /^inputmode$/, /^tabindex$/, /^lang$/, /^title$/, /^data-figma-/];

/** Whether an attribute may change without touching pixels. */
export function isFreeAttribute(name: string): boolean {
  return FREE.some((re) => re.test(name));
}

const isElement = (n: Node): n is Element => "tagName" in n;
const isText = (n: Node): n is Text => n.nodeName === "#text";

function meaningful(children: Node[]): Node[] {
  return children.filter((c) => isElement(c) || (isText(c) && c.value.trim() !== ""));
}

function label(el: Element, index: number): string {
  const id = el.attrs.find((a) => a.name === "data-figma-id")?.value;
  return `${el.tagName}${id ? `[${id}]` : `:${index}`}`;
}

export function compareDocuments(before: string, after: string, options: { allowAttribute?: (name: string) => boolean } = {}): LockChange[] {
  const allow = options.allowAttribute ?? isFreeAttribute;
  const changes: LockChange[] = [];
  const visit = (a: Node, b: Node, path: string) => {
    if (isText(a) || isText(b)) {
      const ta = isText(a) ? a.value.replace(/\s+/g, " ").trim() : "";
      const tb = isText(b) ? b.value.replace(/\s+/g, " ").trim() : "";
      if (ta !== tb || isText(a) !== isText(b)) changes.push({ path, kind: "text", before: ta, after: tb });
      return;
    }
    if (!isElement(a) || !isElement(b)) {
      if ("childNodes" in a && "childNodes" in b) {
        const ca = meaningful((a as Element).childNodes);
        const cb = meaningful((b as Element).childNodes);
        for (let i = 0; i < Math.max(ca.length, cb.length); i++) {
          if (!ca[i] || !cb[i]) {
            changes.push({ path, kind: "children", before: String(ca.length), after: String(cb.length) });
            break;
          }
          visit(ca[i], cb[i], path);
        }
      }
      return;
    }
    if (a.tagName !== b.tagName) {
      changes.push({ path, kind: "tag", before: a.tagName, after: b.tagName });
      return;
    }
    if (a.tagName === "style" || a.tagName === "script") {
      const ta = a.childNodes.map((c) => (isText(c) ? c.value : "")).join("");
      const tb = b.childNodes.map((c) => (isText(c) ? c.value : "")).join("");
      // Scripts may be added by Wave later; styles may not change.
      if (a.tagName === "style" && ta !== tb) changes.push({ path, kind: "style", before: `${ta.length} chars`, after: `${tb.length} chars` });
      return;
    }
    const names = new Set([...a.attrs.map((x) => x.name), ...b.attrs.map((x) => x.name)]);
    for (const n of names) {
      if (allow(n)) continue;
      const va = a.attrs.find((x) => x.name === n)?.value;
      const vb = b.attrs.find((x) => x.name === n)?.value;
      if (va !== vb) changes.push({ path, kind: "attribute", before: va === undefined ? `(no ${n})` : `${n}="${va}"`, after: vb === undefined ? `(no ${n})` : `${n}="${vb}"` });
    }
    // Wave's own head entries (wave: meta tags, the resources script) never render.
    const invisible = (c: Node) =>
      isElement(c) && (c.tagName === "script" || (c.tagName === "meta" && /^(wave|pi):/.test(c.attrs.find((x) => x.name === "name")?.value ?? "")));
    const ca = meaningful(a.childNodes).filter((c) => !invisible(c));
    const cb = meaningful(b.childNodes).filter((c) => !invisible(c));
    if (ca.length !== cb.length) {
      changes.push({ path, kind: "children", before: String(ca.length), after: String(cb.length) });
      return;
    }
    ca.forEach((c, i) => visit(c, cb[i], isElement(c) ? `${path}/${label(c, i)}` : path));
  };
  visit(parse(before) as unknown as Node, parse(after) as unknown as Node, "");
  return changes;
}
