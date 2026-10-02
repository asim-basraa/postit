// Builds a W3C DTCG token file from Figma's variable listing plus its text and effect style bindings.
// usage: node build-dtcg.mjs <vars.txt> <out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [, , varsFile, outFile] = process.argv;
const r4 = (n) => +(+n).toFixed(4);
const rem = (px) => ({ value: r4(px / 16), unit: "rem" });
const ref = (name) => `{${name.split("/").join(".")}}`;
const typeOf = (name, rt) => {
  if (rt === "C") return "color";
  if (rt === "S") return /easing/.test(name) ? "cubicBezier" : "fontFamily";
  if (/font\/weight|font-weight/.test(name)) return "fontWeight";
  if (/^duration\/|^motion\/(duration|stagger)/.test(name)) return "duration";
  if (/^scale\/|^motion\/scale|^opacity\//.test(name)) return "number";
  return "dimension";
};

const doc = { $description: "Keel design tokens, built by Wave from the Figma file Keel - New File (39lO3zxf1SU4lmjSGlljwS): its variables, text styles and effect styles. Figma is the source of truth. Dimensions in rem (1rem = 16px)." };
const put = (path, tok) => {
  let o = doc;
  const p = path.split("/");
  for (const k of p.slice(0, -1)) o = o[k] ??= {};
  if (o[p.at(-1)]) throw new Error(`Two tokens at ${path}`);
  o[p.at(-1)] = tok;
};
const notes = [];
const seen = new Set();
for (const line of readFileSync(varsFile, "utf8").split("\n")) {
  const [col, name, rt, val, a4, a5] = line.split("|");
  const alias = a4 && !a4.startsWith("# ") ? a4 : null;
  const desc = [a4, a5].find((x) => x && x.startsWith("# "))?.slice(2).replace(/&#39;/g, "'");
  const t = typeOf(name, rt);
  if (seen.has(name)) {
    // Semantics re-declares a primitive of the same name (radius/full): one token, the value.
    notes.push(`${name}: defined in Primitives and Semantics with the same value; kept once.`);
    continue;
  }
  seen.add(name);
  let value;
  if (alias && alias !== name) value = ref(alias);
  else if (t === "color") value = val;
  else if (t === "dimension") value = rem(+val);
  else if (t === "duration") value = { value: r4(val), unit: "ms" };
  else if (t === "cubicBezier") value = val.match(/-?[\d.]+/g).map(Number);
  else if (t === "number" && name.startsWith("opacity/") && +val > 1) {
    value = r4(+val / 100);
    notes.push(`${name}: Figma stores ${val} (a percentage); written as ${value}.`);
  } else if (t === "fontFamily") value = val;
  else value = r4(val);
  const tok = { $type: t, $value: value };
  if (desc) tok.$description = desc;
  put(name, tok);
}

// Text styles: each is bound to its type/<name>/* variables.
const textStyles = ["display", "h1", "h2", "title", "body-lg", "body", "body-sm", "label", "caption", "button", "chip", "eyebrow", "logo", "marker", "lede"];
for (const s of textStyles) {
  put(`typography/${s}`, {
    $type: "typography",
    $description: `Figma text style Keel/${s}.`,
    $value: {
      fontFamily: ref(`type/${s}/font-family`),
      fontWeight: ref(`type/${s}/font-weight`),
      fontSize: ref(`type/${s}/font-size`),
      lineHeight: ref(`type/${s}/line-height`),
      letterSpacing: ref(`type/${s}/letter-spacing`),
    },
  });
}

// Effect styles, with the variables Figma binds them to.
const zero = { value: 0, unit: "rem" };
const shadows = [
  ["focus-ring", "color/accent/ring", "shadow/spread/ring", false],
  ["focus-ring-error", "color/feedback/error-ring", "shadow/spread/ring", false],
  ["focus-ring-field", "color/accent/ring-subtle", "shadow/spread/ring", false],
  ["selected-inset", "color/border/selected", "shadow/spread/hairline", true],
  ["segment-thumb", "color/border/default", "shadow/spread/hairline", false],
];
for (const [n, color, spread, inset] of shadows) {
  put(`shadow/${n}`, {
    $type: "shadow",
    $description: `Figma effect style Keel/shadow/${n}.`,
    $value: { color: ref(color), offsetX: zero, offsetY: zero, blur: zero, spread: ref(spread), ...(inset ? { inset: true } : {}) },
  });
}
notes.push("Keel/blur/bar: effect style bound to blur/bar; the token is blur.bar.");

writeFileSync(outFile, JSON.stringify(doc, null, 2) + "\n");
console.log(notes.join("\n"));
