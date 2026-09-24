import { matchValue, normaliseColor, normaliseLength, type TokenSet } from "./tokens";

/**
 * Literal style values that no token accounts for, found by reading the CSS in
 * a mockup rather than rendering it.
 *
 * The inspector does the precise version for one element at a time, with the
 * browser's own cascade. This is the cheap version for a whole screen at save
 * time: every declaration of a colour, a size, a spacing or a radius whose value
 * is a literal instead of a var(), and which equals no token's value.
 */

const COLOR_PROPS = /^(color|background|background-color|border(-top|-right|-bottom|-left)?(-color)?|outline(-color)?|fill|stroke|text-decoration-color|caret-color|accent-color)$/;
const LENGTH_PROPS = /^(margin|padding)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$|^(gap|row-gap|column-gap|font-size|border-radius|border-(top|bottom)-(left|right)-radius|line-height|letter-spacing)$/;

export type OffToken = { property: string; value: string };

const IGNORED = new Set(["0", "0px", "auto", "inherit", "initial", "unset", "none", "transparent", "currentcolor", "normal"]);

function literals(value: string): string[] {
  // var(...) is by definition on a token; strip it (and its fallback) out.
  const stripped = value.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, " ");
  const out: string[] = [];
  const colorFn = /(rgba?|hsla?)\([^)]*\)/gi;
  let m: RegExpExecArray | null;
  while ((m = colorFn.exec(stripped))) out.push(m[0]);
  const rest = stripped.replace(colorFn, " ");
  for (const part of rest.split(/[\s,/]+/)) {
    const p = part.trim().replace(/!important$/, "");
    if (!p || IGNORED.has(p.toLowerCase())) continue;
    if (/^#[0-9a-f]{3,8}$/i.test(p) || /^-?[\d.]+(px|rem|em)?$/i.test(p)) out.push(p);
  }
  return out;
}

export function declarations(css: string): { property: string; value: string }[] {
  const out: { property: string; value: string }[] = [];
  // Strip comments, then read property: value pairs inside blocks.
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const block = /\{([^{}]*)\}/g;
  let b: RegExpExecArray | null;
  while ((b = block.exec(clean))) {
    for (const decl of b[1].split(";")) {
      const i = decl.indexOf(":");
      if (i < 1) continue;
      const property = decl.slice(0, i).trim().toLowerCase();
      const value = decl.slice(i + 1).trim();
      if (property.startsWith("--")) continue; // defining a token is not using a literal
      if (property && value) out.push({ property, value });
    }
  }
  return out;
}

export function findOffToken(cssBlocks: string[], tokens: TokenSet): OffToken[] {
  const found: OffToken[] = [];
  const seen = new Set<string>();
  for (const css of cssBlocks) {
    for (const { property, value } of declarations(css)) {
      const isColor = COLOR_PROPS.test(property);
      const isLength = LENGTH_PROPS.test(property);
      if (!isColor && !isLength) continue;
      for (const lit of literals(value)) {
        const comparable = isColor ? normaliseColor(lit) : normaliseLength(lit);
        if (!comparable) continue;
        if (!isColor && comparable === "0px") continue;
        if (matchValue(tokens, lit).length > 0) continue;
        const key = `${property}:${lit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        found.push({ property, value: lit });
      }
    }
  }
  return found;
}
