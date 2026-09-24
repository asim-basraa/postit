/**
 * Design tokens in the W3C DTCG format, flattened for lookup.
 *
 * A flow keeps one JSON page of tokens. Two questions are asked of it: what
 * token does this CSS variable name (`--color-blue-500` is `color.blue.500`),
 * and what token has this value (for a style written as a literal). Values are
 * normalised first so `#fff`, `#FFFFFF` and `rgb(255, 255, 255)` are one colour,
 * and `1rem` and `16px` are one size.
 */

export type Token = {
  /** Dotted path, e.g. color.blue.500 */
  path: string;
  type: string | null;
  /** The resolved value, as CSS text. */
  value: string;
  /** Where it pointed, when the value was an alias. */
  alias: string | null;
  description: string | null;
  /** The custom property it is expected to be published as. */
  cssVar: string;
  /** Comparable form of the value, or null when it has none. */
  normalised: string | null;
};

export type TokenSet = {
  tokens: Token[];
  byPath: Map<string, Token>;
  byVar: Map<string, Token>;
  byValue: Map<string, Token[]>;
  problems: string[];
};

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

function isObject(v: unknown): v is Record<string, Json> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Whether a document looks like DTCG: at least one object carrying $value. */
export function isDtcg(doc: unknown): boolean {
  if (!isObject(doc)) return false;
  const stack: unknown[] = [doc];
  let seen = 0;
  while (stack.length && seen < 5000) {
    const next = stack.pop();
    seen++;
    if (!isObject(next)) continue;
    if ("$value" in next) return true;
    for (const [k, v] of Object.entries(next)) if (!k.startsWith("$")) stack.push(v);
  }
  return false;
}

export function cssVarFor(path: string): string {
  return `--${path.replace(/\./g, "-")}`;
}

/** DTCG 2025 structured values, or plain strings and numbers. */
function valueToCss(value: Json, type: string | null): string {
  if (typeof value === "string") return value;
  if (typeof value === "number") return type === "dimension" ? `${value}px` : String(value);
  if (isObject(value)) {
    if ("value" in value && "unit" in value) return `${value.value}${value.unit}`;
    if ("hex" in value && typeof value.hex === "string") return value.hex;
    if ("colorSpace" in value && Array.isArray(value.components)) {
      const c = value.components.map(Number);
      const alpha = typeof value.alpha === "number" ? value.alpha : 1;
      if (value.colorSpace === "srgb") {
        const [r, g, b] = c.map((n) => Math.round(n * 255));
        return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
      }
      return `color(${value.colorSpace} ${c.join(" ")}${alpha === 1 ? "" : ` / ${alpha}`})`;
    }
    if ("offsetX" in value || "blur" in value) {
      const part = (v: Json | undefined) => (v === undefined ? "0" : valueToCss(v, "dimension"));
      return `${part(value.offsetX)} ${part(value.offsetY)} ${part(value.blur)} ${part(value.spread)} ${part(value.color)}`;
    }
    if ("fontFamily" in value || "fontSize" in value) {
      return [value.fontWeight, value.fontSize, value.fontFamily]
        .filter((v) => v !== undefined)
        .map((v) => valueToCss(v as Json, null))
        .join(" ");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return value.map((v) => valueToCss(v, type)).join(", ");
  return String(value);
}

function clamp255(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** A colour, any common form, as `r,g,b,a`; or null. */
export function normaliseColor(input: string): string | null {
  const v = input.trim().toLowerCase();
  let m = /^#([0-9a-f]{3,8})$/.exec(v);
  if (m) {
    let hex = m[1];
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
    if (hex.length !== 6 && hex.length !== 8) return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = hex.length === 8 ? Math.round((parseInt(hex.slice(6, 8), 16) / 255) * 100) / 100 : 1;
    return `${r},${g},${b},${a}`;
  }
  m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/.exec(v);
  if (m) {
    let a = 1;
    if (m[4] !== undefined) a = m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return `${clamp255(+m[1])},${clamp255(+m[2])},${clamp255(+m[3])},${Math.round(a * 100) / 100}`;
  }
  if (v === "white") return "255,255,255,1";
  if (v === "black") return "0,0,0,1";
  return null;
}

/** A length as px, or null. */
export function normaliseLength(input: string, rootPx = 16): string | null {
  const m = /^(-?[\d.]+)(px|rem|em)?$/.exec(input.trim().toLowerCase());
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (Number.isNaN(n)) return null;
  const px = m[2] === "rem" || m[2] === "em" ? n * rootPx : n;
  return `${Math.round(px * 100) / 100}px`;
}

/** The comparable form of any CSS value, if it has one. */
export function normaliseValue(input: string): string | null {
  const color = normaliseColor(input);
  if (color) return `color:${color}`;
  const length = normaliseLength(input);
  if (length && length !== "0px") return `len:${length}`;
  const trimmed = input.trim().toLowerCase().replace(/\s+/g, " ");
  return trimmed ? `raw:${trimmed}` : null;
}

/**
 * Flattens a DTCG document. Aliases (`{color.blue.500}`) are resolved, types
 * inherit from groups, and problems are collected rather than thrown.
 */
export function flattenTokens(doc: unknown): TokenSet {
  const raw: { path: string; type: string | null; value: Json; description: string | null }[] = [];
  const problems: string[] = [];

  const visit = (node: Json, path: string[], inheritedType: string | null) => {
    if (!isObject(node)) return;
    const type = typeof node.$type === "string" ? node.$type : inheritedType;
    if ("$value" in node) {
      raw.push({
        path: path.join("."),
        type,
        value: node.$value as Json,
        description: typeof node.$description === "string" ? node.$description : null,
      });
      return;
    }
    for (const [key, child] of Object.entries(node)) {
      if (key.startsWith("$")) continue;
      visit(child, [...path, key], type);
    }
  };

  if (isObject(doc)) visit(doc as Json, [], null);
  else problems.push("The token file is not a JSON object.");

  const byRawPath = new Map(raw.map((t) => [t.path, t]));

  const resolve = (value: Json, seen: Set<string>): { value: Json; alias: string | null } => {
    if (typeof value === "string") {
      const m = /^\{([^}]+)\}$/.exec(value.trim());
      if (m) {
        const target = byRawPath.get(m[1]);
        if (!target) {
          problems.push(`${value} points at a token that does not exist.`);
          return { value, alias: m[1] };
        }
        if (seen.has(m[1])) {
          problems.push(`${value} is part of an alias loop.`);
          return { value, alias: m[1] };
        }
        return { value: resolve(target.value, new Set([...seen, m[1]])).value, alias: m[1] };
      }
    }
    return { value, alias: null };
  };

  const tokens: Token[] = raw.map((t) => {
    const { value, alias } = resolve(t.value, new Set([t.path]));
    const target = alias ? byRawPath.get(alias) : undefined;
    const type = t.type ?? target?.type ?? null;
    const css = valueToCss(value, type);
    return {
      path: t.path,
      type,
      value: css,
      alias,
      description: t.description,
      cssVar: cssVarFor(t.path),
      normalised: normaliseValue(css),
    };
  });

  const byPath = new Map(tokens.map((t) => [t.path, t]));
  const byVar = new Map(tokens.map((t) => [t.cssVar, t]));
  const byValue = new Map<string, Token[]>();
  for (const t of tokens) {
    if (!t.normalised) continue;
    const list = byValue.get(t.normalised) ?? [];
    list.push(t);
    byValue.set(t.normalised, list);
  }

  return { tokens, byPath, byVar, byValue, problems };
}

export function parseTokens(json: string): TokenSet | null {
  try {
    const doc = JSON.parse(json);
    return isDtcg(doc) ? flattenTokens(doc) : null;
  } catch {
    return null;
  }
}

/** Groups for the inventory view. */
export function tokenGroup(token: Token): "color" | "typography" | "spacing" | "radius" | "shadow" | "other" {
  const t = (token.type ?? "").toLowerCase();
  const p = token.path.toLowerCase();
  if (t === "color" || /(^|\.)colou?rs?(\.|$)/.test(p)) return "color";
  if (t === "shadow" || /shadow|elevation/.test(p)) return "shadow";
  if (/radius|radii|corner/.test(p)) return "radius";
  if (t === "typography" || t === "fontfamily" || t === "fontweight" || /font|type|text|line-?height|letter/.test(p)) return "typography";
  if (t === "dimension" || /space|spacing|size|gap|inset/.test(p)) return "spacing";
  return "other";
}

/** Which token a literal value matches, if any. */
export function matchValue(set: TokenSet, value: string): Token[] {
  const n = normaliseValue(value);
  return n ? (set.byValue.get(n) ?? []) : [];
}
