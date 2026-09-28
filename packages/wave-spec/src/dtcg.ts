/**
 * Strict validation of a W3C DTCG token file, with Wave's one extra rule:
 * dimensions are written in rem.
 *
 * A project has one token file, and every style value a screen uses must come
 * from it, so the file itself has to be sound: every token typed, every value
 * the right shape for its type, every alias resolving, and nothing in px.
 */

export const DTCG_TYPES = [
  "color",
  "dimension",
  "fontFamily",
  "fontWeight",
  "duration",
  "cubicBezier",
  "number",
  "typography",
  "shadow",
  "border",
  "transition",
  "gradient",
  "strokeStyle",
] as const;
export type DtcgType = (typeof DTCG_TYPES)[number];

export type TokenProblem = { path: string; message: string };

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
const isObj = (v: unknown): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);
const isAlias = (v: unknown) => typeof v === "string" && /^\{[^{}]+\}$/.test(v.trim());

const FONT_WEIGHTS = new Set(["thin", "hairline", "extra-light", "ultra-light", "light", "normal", "regular", "book", "medium", "semi-bold", "demi-bold", "bold", "extra-bold", "ultra-bold", "black", "heavy", "extra-black", "ultra-black"]);

function checkColor(v: Json): string | null {
  if (isAlias(v)) return null;
  if (typeof v === "string") {
    return /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v.trim()) || /^(rgb|rgba|hsl|hsla|oklch|oklab|color)\(/i.test(v.trim())
      ? null
      : `"${v}" is not a colour value.`;
  }
  if (isObj(v) && typeof v.colorSpace === "string" && Array.isArray(v.components)) return null;
  return "A colour must be a hex string or a {colorSpace, components} object.";
}

function checkDimension(v: Json): string | null {
  if (isAlias(v)) return null;
  if (v === 0 || v === "0") return null;
  let unit: string | null = null;
  if (typeof v === "string") {
    const m = /^-?[\d.]+(px|rem)$/.exec(v.trim());
    if (!m) return `"${v}" is not a dimension. Write it as {"value": 1, "unit": "rem"} (or "1rem").`;
    unit = m[1];
  } else if (isObj(v) && typeof v.value === "number" && typeof v.unit === "string") {
    unit = v.unit;
    if (unit !== "px" && unit !== "rem") return `Unit "${unit}" is not allowed in DTCG. Use rem.`;
  } else {
    return 'A dimension must be {"value": <number>, "unit": "rem"}.';
  }
  return unit === "px" ? "Dimensions must be in rem, not px." : null;
}

function checkDuration(v: Json): string | null {
  if (isAlias(v)) return null;
  if (typeof v === "string") return /^[\d.]+(ms|s)$/.test(v.trim()) ? null : `"${v}" is not a duration.`;
  if (isObj(v) && typeof v.value === "number" && (v.unit === "ms" || v.unit === "s")) return null;
  return 'A duration must be {"value": <number>, "unit": "ms"}.';
}

function checkValue(type: string, v: Json): string | null {
  switch (type) {
    case "color":
      return checkColor(v);
    case "dimension":
      return checkDimension(v);
    case "fontFamily":
      if (isAlias(v) || typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"))) return null;
      return "A font family must be a string or a list of strings.";
    case "fontWeight":
      if (isAlias(v)) return null;
      if (typeof v === "number") return v >= 1 && v <= 1000 ? null : "A font weight must be 1 to 1000.";
      if (typeof v === "string" && FONT_WEIGHTS.has(v.toLowerCase())) return null;
      return `"${String(v)}" is not a font weight.`;
    case "duration":
      return checkDuration(v);
    case "cubicBezier":
      if (isAlias(v)) return null;
      return Array.isArray(v) && v.length === 4 && v.every((x) => typeof x === "number") ? null : "A cubic Bézier must be four numbers.";
    case "number":
      return isAlias(v) || typeof v === "number" ? null : "A number token must be a number.";
    case "typography":
      if (isAlias(v)) return null;
      if (!isObj(v)) return "Typography must be an object.";
      for (const k of ["fontFamily", "fontSize", "fontWeight", "lineHeight"]) if (!(k in v)) return `Typography needs ${k}.`;
      return checkDimension(v.fontSize) ?? checkValue("fontWeight", v.fontWeight) ?? null;
    case "shadow": {
      if (isAlias(v)) return null;
      const list = Array.isArray(v) ? v : [v];
      for (const s of list) {
        if (!isObj(s)) return "A shadow must be an object or a list of them.";
        for (const k of ["color", "offsetX", "offsetY", "blur"]) if (!(k in s)) return `A shadow needs ${k}.`;
        const e = checkColor(s.color) ?? checkDimension(s.offsetX) ?? checkDimension(s.offsetY) ?? checkDimension(s.blur) ?? (s.spread !== undefined ? checkDimension(s.spread) : null);
        if (e) return e;
      }
      return null;
    }
    case "border":
      if (isAlias(v)) return null;
      if (!isObj(v) || !("color" in v) || !("width" in v) || !("style" in v)) return "A border needs color, width and style.";
      return checkColor(v.color) ?? checkDimension(v.width);
    case "transition":
      if (isAlias(v)) return null;
      if (!isObj(v) || !("duration" in v) || !("timingFunction" in v)) return "A transition needs duration and timingFunction.";
      return checkDuration(v.duration);
    case "gradient":
      if (isAlias(v)) return null;
      return Array.isArray(v) && v.every((s) => isObj(s) && "color" in s && "position" in s) ? null : "A gradient must be a list of {color, position}.";
    case "strokeStyle":
      return null;
    default:
      return `"${type}" is not a DTCG type.`;
  }
}

export type TokenReport = {
  problems: TokenProblem[];
  /** How many tokens of each type, after aliases resolve. */
  typeCounts: Partial<Record<DtcgType, number>>;
  count: number;
};

/** Every problem with a token file, against DTCG and Wave's rem rule. */
export function validateTokenDocument(json: string): TokenReport {
  let doc: unknown;
  try {
    doc = JSON.parse(json);
  } catch (e) {
    return { problems: [{ path: "", message: `The token file is not valid JSON: ${(e as Error).message}` }], typeCounts: {}, count: 0 };
  }
  if (!isObj(doc)) return { problems: [{ path: "", message: "The token file must be a JSON object." }], typeCounts: {}, count: 0 };

  const problems: TokenProblem[] = [];
  const tokens: { path: string; type: string | null; value: Json }[] = [];

  const visit = (node: Json, path: string[], inherited: string | null) => {
    if (!isObj(node)) return;
    const type = typeof node.$type === "string" ? node.$type : inherited;
    if (typeof node.$type === "string" && !(DTCG_TYPES as readonly string[]).includes(node.$type)) {
      problems.push({ path: path.join("."), message: `"${node.$type}" is not a DTCG type.` });
    }
    if ("$value" in node) {
      tokens.push({ path: path.join("."), type, value: node.$value as Json });
      return;
    }
    for (const [k, child] of Object.entries(node)) {
      if (k.startsWith("$")) continue;
      if (/[{}.]/.test(k)) problems.push({ path: [...path, k].join("."), message: `The name "${k}" cannot contain {, } or a dot.` });
      visit(child, [...path, k], type);
    }
  };
  visit(doc as Json, [], null);

  if (tokens.length === 0) problems.push({ path: "", message: "The file has no tokens (nothing with $value)." });

  const byPath = new Map(tokens.map((t) => [t.path, t]));
  const typeOf = (t: { path: string; type: string | null; value: Json }, seen = new Set<string>()): string | null => {
    if (t.type) return t.type;
    if (isAlias(t.value)) {
      const target = byPath.get(String(t.value).trim().slice(1, -1));
      if (target && !seen.has(target.path)) return typeOf(target, new Set([...seen, t.path]));
    }
    return null;
  };

  const typeCounts: Partial<Record<DtcgType, number>> = {};
  for (const t of tokens) {
    if (isAlias(t.value)) {
      const target = String(t.value).trim().slice(1, -1);
      if (!byPath.has(target)) problems.push({ path: t.path, message: `${t.value} points at a token that does not exist.` });
    }
    const type = typeOf(t);
    if (!type) {
      problems.push({ path: t.path, message: "No $type on the token or any group above it." });
      continue;
    }
    if ((DTCG_TYPES as readonly string[]).includes(type)) typeCounts[type as DtcgType] = (typeCounts[type as DtcgType] ?? 0) + 1;
    const e = checkValue(type, t.value);
    if (e) problems.push({ path: t.path, message: e });
  }

  // Alias loops.
  for (const t of tokens) {
    const seen = new Set<string>([t.path]);
    let cur: Json = t.value;
    while (isAlias(cur)) {
      const next = String(cur).trim().slice(1, -1);
      if (seen.has(next)) {
        problems.push({ path: t.path, message: "Part of an alias loop." });
        break;
      }
      seen.add(next);
      cur = byPath.get(next)?.value ?? null;
    }
  }

  return { problems, typeCounts, count: tokens.length };
}
