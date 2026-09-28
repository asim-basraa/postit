import { cssVarFor, matchValue, normaliseColor, normaliseLength, type Token, type TokenSet } from "./tokens";
import type { DtcgType } from "./dtcg";

/**
 * Style values that should come from a token and do not.
 *
 * Wave's rule: anything DTCG can express is a token. Colours, rem and px
 * sizes of every kind, font families and weights, shadows, durations, easing
 * and plain numbers such as opacity and z-index must be var(--token). Values
 * DTCG has no type for (0, auto, percentages, fr, viewport units, keywords)
 * are exempt.
 */

export type StyleIssue = {
  /** Stable key for waiving: style:<property>:<value>, var:<name>, category:<type> or redefined:<var>. */
  key: string;
  kind: "literal" | "unknown-var" | "missing-category" | "redefined" | "no-tokens";
  property: string;
  value: string;
  selector: string;
  category: DtcgType | null;
  message: string;
  suggestion: string | null;
};

type Rule = { selector: string; decls: { property: string; value: string }[] };

/** CSS rules, flattened out of @media and friends; @font-face and @keyframes are skipped. */
export function cssRules(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const walk = (text: string) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open < 0) break;
      const prelude = text.slice(i, open).trim().split(/[;}]/).pop()!.trim();
      let depth = 1;
      let j = open + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (/^@(media|supports|container|layer|document)\b/i.test(prelude)) walk(body);
      else if (!/^@/.test(prelude)) {
        const decls: Rule["decls"] = [];
        for (const d of body.split(";")) {
          const k = d.indexOf(":");
          if (k < 1) continue;
          const property = d.slice(0, k).trim().toLowerCase();
          const value = d.slice(k + 1).trim().replace(/\s*!important$/i, "");
          if (property && value) decls.push({ property, value });
        }
        out.push({ selector: prelude, decls });
      }
      i = j;
    }
  };
  walk(src);
  return out;
}

const COLOR_PROP = /^(color|background|background-color|border(-(top|right|bottom|left|block|inline)(-(start|end))?)?(-color)?|outline(-color)?|fill|stroke|text-decoration(-color)?|caret-color|accent-color|column-rule(-color)?)$/;
const DIMENSION_PROP = /^((min-|max-)?(width|height)|(margin|padding|inset|scroll-margin|scroll-padding)(-(top|right|bottom|left|block|inline)(-(start|end))?)?|top|right|bottom|left|gap|row-gap|column-gap|grid-gap|font-size|letter-spacing|word-spacing|text-indent|flex-basis|border(-(top|right|bottom|left))?-width|outline-width|outline-offset|border(-(top|bottom)-(left|right))?-radius|border-radius|line-height|border|outline)$/;
const SHADOW_PROP = /^(box-shadow|text-shadow)$/;
const DURATION_PROP = /^(transition|transition-duration|transition-delay|animation|animation-duration|animation-delay)$/;
const EASING_PROP = /^(transition|transition-timing-function|animation|animation-timing-function)$/;
const NUMBER_PROP = /^(opacity|z-index|line-height)$/;

const NAMED_COLORS = /^(white|black|red|green|blue|gray|grey|orange|purple|yellow|pink|brown|navy|teal|silver|maroon|olive|lime|aqua|fuchsia|gold|indigo|violet|crimson|coral|salmon|tomato|khaki|beige|ivory|lavender|plum|orchid|tan|chocolate|sienna|peru|wheat|linen|snow|azure|cyan|magenta|turquoise|slategray|slategrey|lightgray|lightgrey|darkgray|darkgrey|dimgray|dimgrey|gainsboro|whitesmoke|ghostwhite|aliceblue|mintcream|honeydew|seashell|oldlace|floralwhite|lightblue|darkblue|skyblue|steelblue|royalblue|dodgerblue|midnightblue|firebrick|darkred|forestgreen|seagreen|darkgreen|limegreen|olivedrab|goldenrod|darkorange|orangered|hotpink|deeppink|rebeccapurple)$/i;

const VAR = /var\(\s*(--[\w-]+)\s*(?:,[^()]*(?:\([^()]*\)[^()]*)*)?\)/g;
const HAS_VAR = /var\(/;

function literalsIn(value: string, category: DtcgType): string[] {
  const stripped = value.replace(VAR, " ");
  const out: string[] = [];
  if (category === "color") {
    for (const m of stripped.matchAll(/#[0-9a-f]{3,8}\b|(rgba?|hsla?|oklch|oklab|color)\([^)]*\)/gi)) out.push(m[0]);
    for (const w of stripped.split(/[\s,/()]+/)) if (NAMED_COLORS.test(w)) out.push(w);
  } else if (category === "dimension") {
    for (const m of stripped.matchAll(/(?<![\w#.-])-?\d*\.?\d+(px|rem|em|pt|pc|cm|mm|in)\b/gi)) {
      if (parseFloat(m[0]) !== 0) out.push(m[0]);
    }
  } else if (category === "duration") {
    for (const m of stripped.matchAll(/(?<![\w.-])\d*\.?\d+(ms|s)\b/g)) if (parseFloat(m[0]) !== 0) out.push(m[0]);
  } else if (category === "cubicBezier") {
    for (const m of stripped.matchAll(/cubic-bezier\([^)]*\)/g)) out.push(m[0]);
  } else if (category === "number") {
    const v = stripped.trim();
    if (/^-?\d*\.?\d+$/.test(v) && !["0", "1"].includes(v)) out.push(v);
  } else if (category === "shadow") {
    const v = stripped.trim();
    if (v && !/^(none|inherit|initial|unset)$/i.test(v)) out.push(v);
  } else if (category === "fontFamily") {
    const v = stripped.trim();
    if (v && !/^(inherit|initial|unset)$/i.test(v)) out.push(v);
  } else if (category === "fontWeight") {
    const v = stripped.trim();
    if (/^(\d{3}|bold|bolder|lighter)$/i.test(v)) out.push(v);
  }
  return out;
}

function categoriesFor(property: string, value: string): DtcgType[] {
  const cats: DtcgType[] = [];
  if (COLOR_PROP.test(property)) cats.push("color");
  if (DIMENSION_PROP.test(property) && !(property === "line-height" && /^\d*\.?\d+$/.test(value.trim()))) cats.push("dimension");
  if (SHADOW_PROP.test(property)) cats.push("shadow");
  if (DURATION_PROP.test(property)) cats.push("duration");
  if (EASING_PROP.test(property)) cats.push("cubicBezier");
  if (property === "font-family") cats.push("fontFamily");
  if (property === "font-weight") cats.push("fontWeight");
  if (NUMBER_PROP.test(property) && /^\s*-?\d*\.?\d+\s*$/.test(value.replace(VAR, ""))) cats.push("number");
  if (property === "font") cats.push("dimension", "fontFamily");
  return cats;
}

function typeOfToken(t: Token): DtcgType | null {
  const ty = (t.type ?? "") as DtcgType;
  return ty || null;
}

function nearest(tokens: TokenSet, literal: string, category: DtcgType): Token | null {
  const exact = matchValue(tokens, literal).find((t) => !t.type || typeOfToken(t) === category || category === "shadow");
  if (exact) return exact;
  if (category === "color") {
    const c = normaliseColor(literal);
    if (!c) return null;
    const [r, g, b] = c.split(",").map(Number);
    let best: { t: Token; d: number } | null = null;
    for (const t of tokens.tokens) {
      const n = t.normalised?.startsWith("color:") ? t.normalised.slice(6).split(",").map(Number) : null;
      if (!n) continue;
      const d = (n[0] - r) ** 2 + (n[1] - g) ** 2 + (n[2] - b) ** 2;
      if (!best || d < best.d) best = { t, d };
    }
    return best?.t ?? null;
  }
  if (category === "dimension") {
    const px = normaliseLength(literal);
    if (!px) return null;
    const v = parseFloat(px);
    let best: { t: Token; d: number } | null = null;
    for (const t of tokens.tokens) {
      if (t.type && t.type !== "dimension") continue;
      const n = t.normalised?.startsWith("len:") ? parseFloat(t.normalised.slice(4)) : NaN;
      if (Number.isNaN(n)) continue;
      const d = Math.abs(n - v);
      if (!best || d < best.d) best = { t, d };
    }
    return best?.t ?? null;
  }
  return null;
}

/** Every style value on a screen that is not a token, and what to use instead. */
export function styleIssues(cssBlocks: string[], tokens: TokenSet | null): StyleIssue[] {
  const issues: StyleIssue[] = [];
  const seen = new Set<string>();
  const add = (i: StyleIssue) => {
    if (seen.has(i.key)) return;
    seen.add(i.key);
    issues.push(i);
  };
  if (!tokens) {
    add({ key: "no-tokens", kind: "no-tokens", property: "", value: "", selector: "", category: null, message: "The project has no DTCG token file, so no style can be checked against it.", suggestion: null });
    return issues;
  }

  const rules = cssBlocks.flatMap(cssRules);
  const tokenVars = new Set(tokens.tokens.map((t) => t.cssVar));
  const local = new Map<string, string>();
  for (const r of rules) for (const d of r.decls) if (d.property.startsWith("--")) local.set(d.property, d.value);

  const typesPresent = new Set(tokens.tokens.map(typeOfToken).filter(Boolean) as DtcgType[]);
  const categoriesUsed = new Set<DtcgType>();

  for (const r of rules) {
    for (const { property, value } of r.decls) {
      if (property.startsWith("--")) {
        // A token published as a variable must carry the token's value.
        const tok = tokens.byVar.get(property);
        if (tok) {
          const lit = value.trim();
          if (!HAS_VAR.test(lit) && tok.normalised && matchValue(tokens, lit).every((t) => t.path !== tok.path)) {
            add({ key: `redefined:${property}`, kind: "redefined", property, value: lit, selector: r.selector, category: typeOfToken(tok), message: `${property} is the token ${tok.path} (${tok.value}) but is set to ${lit} here.`, suggestion: tok.value });
          }
        }
        continue;
      }
      for (const m of value.matchAll(VAR)) {
        const name = m[1];
        if (tokenVars.has(name)) continue;
        if (local.has(name)) {
          const def = local.get(name)!;
          const cats = categoriesFor(property, def);
          for (const cat of cats) {
            for (const lit of literalsIn(def, cat)) {
              const near = nearest(tokens, lit, cat);
              add({ key: `var:${name}`, kind: "literal", property: name, value: lit, selector: r.selector, category: cat, message: `${name} is a local variable holding ${lit}, not a token.`, suggestion: near ? `var(${near.cssVar})` : null });
            }
          }
          continue;
        }
        add({ key: `var:${name}`, kind: "unknown-var", property, value: m[0], selector: r.selector, category: null, message: `${name} is not a token in the project's token file.`, suggestion: null });
      }
      for (const cat of categoriesFor(property, value)) {
        const lits = literalsIn(value, cat);
        if (lits.length || HAS_VAR.test(value)) categoriesUsed.add(cat);
        for (const lit of lits) {
          const near = nearest(tokens, lit, cat);
          const exact = near && matchValue(tokens, lit).some((t) => t.path === near.path);
          add({
            key: `style:${property}:${lit}`,
            kind: "literal",
            property,
            value: lit,
            selector: r.selector,
            category: cat,
            message: exact ? `${property}: ${lit} is the value of ${near!.path}; use the token.` : `${property}: ${lit} is not a token.`,
            suggestion: near ? `var(${near.cssVar})` : null,
          });
        }
      }
    }
  }

  for (const cat of categoriesUsed) {
    if (typesPresent.has(cat) || (cat === "shadow" && typesPresent.has("shadow"))) continue;
    add({ key: `category:${cat}`, kind: "missing-category", property: "", value: cat, selector: "", category: cat, message: `The screen uses ${cat} values but the token file has no ${cat} tokens.`, suggestion: null });
  }
  return issues;
}

export { cssVarFor };
