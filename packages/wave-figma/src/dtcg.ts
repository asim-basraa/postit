/**
 * A W3C DTCG token file from a Figma file's variables, text styles and effect
 * styles. Figma is the source of truth: values are written as Figma holds
 * them, aliases stay aliases, and anything that has to be interpreted (a
 * percentage opacity, a variable declared twice) is reported in `notes`.
 */

export type FigmaTextStyle = {
  name: string;
  family: string;
  style: string;
  size: number;
  lineHeight: { unit: string; value?: number };
  letterSpacing: { unit: string; value: number };
  bindings: Record<string, string | null>;
};

export type FigmaEffect = {
  name: string;
  type: string;
  color: string | null;
  x: number;
  y: number;
  radius: number;
  spread: number;
  bindings: Record<string, string | null>;
};

export type FigmaStyles = { text: FigmaTextStyle[]; effects: FigmaEffect[] };

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
type Token = { $type: string; $value: Json; $description?: string };

const r4 = (n: number) => +(+n).toFixed(4);
/** px to rem without losing Figma's value: 1.5px is 0.09375rem, not 0.0938rem. */
const rem = (px: number) => ({ value: +(+px / 16).toFixed(8), unit: "rem" });
const ref = (name: string) => `{${name.split("/").join(".")}}`;

/** The DTCG type a Figma variable becomes, from its resolved type and name. */
export function tokenTypeFor(name: string, figmaType: string): string {
  if (figmaType === "C") return "color";
  if (figmaType === "B") return "boolean";
  if (figmaType === "S") return /easing|bezier/i.test(name) ? "cubicBezier" : /font|family/i.test(name) ? "fontFamily" : "string";
  if (/font\/weight|font-weight|(^|\/)weight(\/|$)/i.test(name)) return "fontWeight";
  if (/(^|\/)(duration|delay|stagger)(\/|$)/i.test(name)) return "duration";
  if (/(^|\/)(scale|opacity|ratio|z-?index)(\/|$)/i.test(name)) return "number";
  return "dimension";
}

/** Strips a brand prefix from a style name: "Keel/h1" is "h1", "Keel/shadow/focus-ring" is "shadow/focus-ring". */
function styleName(name: string): string {
  const parts = name.split("/");
  return parts.length > 1 ? parts.slice(1).join("/") : name;
}

export function buildDtcg(
  listing: string,
  styles: FigmaStyles,
  options: { description?: string } = {},
): { doc: Record<string, Json>; notes: string[]; count: number } {
  const doc: Record<string, Json> = {};
  if (options.description) doc.$description = options.description;
  const notes: string[] = [];
  let count = 0;
  const put = (path: string, tok: Token) => {
    let o = doc as Record<string, Json>;
    const p = path.split("/");
    for (const k of p.slice(0, -1)) {
      if (o[k] === undefined) o[k] = {};
      o = o[k] as Record<string, Json>;
    }
    const last = p[p.length - 1];
    if (o[last] !== undefined) {
      notes.push(`${path}: a second token with this name was skipped.`);
      return;
    }
    o[last] = tok as unknown as Json;
    count++;
  };

  const seen = new Set<string>();
  for (const line of listing.split("\n")) {
    if (!line.trim()) continue;
    const [, name, figmaType, val, a4, a5] = line.split("|");
    const alias = a4 && !a4.startsWith("# ") ? a4 : null;
    const desc = [a4, a5].find((x) => x && x.startsWith("# "))?.slice(2).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
    if (seen.has(name)) {
      notes.push(`${name}: declared in two collections; kept once.`);
      continue;
    }
    seen.add(name);
    const type = tokenTypeFor(name, figmaType);
    // A text variable that is not a font family (prototype state, a word) is not a design
    // value, and DTCG has no type for it: it stays in Figma.
    if (type === "string") {
      notes.push(`${name}: a text variable, not a design value (prototype state or wording); left out of the tokens.`);
      continue;
    }
    let value: Json;
    if (alias && alias !== name) value = ref(alias);
    else if (type === "color" || type === "fontFamily" || type === "string") value = val;
    else if (type === "boolean") value = val === "true";
    else if (type === "dimension") value = rem(+val);
    else if (type === "duration") value = { value: r4(+val), unit: "ms" };
    else if (type === "cubicBezier") value = (val.match(/-?[\d.]+/g) ?? []).map(Number);
    else if (type === "number" && /opacity/i.test(name) && +val > 1) {
      value = r4(+val / 100);
      notes.push(`${name}: Figma holds ${val} (a percentage); written as ${value}.`);
    } else value = r4(+val);
    const tok: Token = { $type: type, $value: value };
    if (desc) tok.$description = desc;
    put(name, tok);
  }

  for (const s of styles.text) {
    const b = s.bindings;
    const lineHeight =
      b.lineHeight ? ref(b.lineHeight) : s.lineHeight.unit === "PIXELS" ? rem(s.lineHeight.value ?? 0) : s.lineHeight.unit === "PERCENT" ? r4((s.lineHeight.value ?? 0) / 100) : 1.2;
    const letterSpacing = b.letterSpacing
      ? ref(b.letterSpacing)
      : s.letterSpacing.unit === "PIXELS"
        ? rem(s.letterSpacing.value)
        : rem((s.letterSpacing.value / 100) * s.size);
    put(`typography/${styleName(s.name)}`, {
      $type: "typography",
      $description: `Figma text style ${s.name}.`,
      $value: {
        fontFamily: b.fontFamily ? ref(b.fontFamily) : s.family,
        fontWeight: b.fontWeight ? ref(b.fontWeight) : weightOf(s.style),
        fontSize: b.fontSize ? ref(b.fontSize) : rem(s.size),
        lineHeight,
        letterSpacing,
      } as Json,
    });
    for (const k of ["fontFamily", "fontWeight", "fontSize", "lineHeight", "letterSpacing"]) {
      if (!b[k]) notes.push(`Text style ${s.name}: ${k} is not bound to a variable; written as Figma draws it.`);
    }
  }

  for (const e of styles.effects) {
    const name = styleName(e.name);
    if (e.type === "BACKGROUND_BLUR" || e.type === "LAYER_BLUR") {
      if (e.bindings.radius) notes.push(`${e.name}: blur bound to ${e.bindings.radius}; that variable is the token.`);
      else put(name, { $type: "dimension", $description: `Figma effect style ${e.name}.`, $value: rem(e.radius) as Json });
      continue;
    }
    const zero = { value: 0, unit: "rem" };
    put(name.startsWith("shadow/") ? name : `shadow/${name}`, {
      $type: "shadow",
      $description: `Figma effect style ${e.name}.`,
      $value: {
        color: e.bindings.color ? ref(e.bindings.color) : e.color,
        offsetX: e.bindings.offsetX ? ref(e.bindings.offsetX) : e.x ? rem(e.x) : zero,
        offsetY: e.bindings.offsetY ? ref(e.bindings.offsetY) : e.y ? rem(e.y) : zero,
        blur: e.bindings.radius ? ref(e.bindings.radius) : e.radius ? rem(e.radius) : zero,
        spread: e.bindings.spread ? ref(e.bindings.spread) : e.spread ? rem(e.spread) : zero,
        ...(e.type === "INNER_SHADOW" ? { inset: true } : {}),
      } as Json,
    });
  }

  return { doc, notes, count };
}

/** A Figma font style name as a CSS weight. */
export function weightOf(style: string): number {
  const s = style.toLowerCase().replace(/[\s_-]/g, "");
  const table: [RegExp, number][] = [
    [/thin|hairline/, 100],
    [/extralight|ultralight/, 200],
    [/light/, 300],
    [/medium/, 500],
    [/semibold|demibold/, 600],
    [/extrabold|ultrabold/, 800],
    [/bold/, 700],
    [/black|heavy/, 900],
  ];
  for (const [re, w] of table) if (re.test(s)) return w;
  return 400;
}
