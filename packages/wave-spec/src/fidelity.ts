/**
 * How closely a screen converted from Figma matches its Figma frame, as
 * measured before it is uploaded, and the gate on it.
 *
 * wave-figma renders the page in a browser at the frame's size and compares it
 * with Figma's render of the frame. Match is 100 minus the structural
 * difference (the comparison after a light blur, so glyph-edge noise from the
 * two font renderers does not count, but a box, a border or moved text does).
 * A screen converted from Figma is uploaded only when its match is at least
 * FIDELITY_GATE: the last 1% is the margin for the two renderers drawing the
 * same font slightly differently.
 *
 * The measurement is stamped into the page as a meta tag, with a fingerprint
 * of the page it measured: a page changed after measuring has to be measured
 * again.
 */

export const FIDELITY_GATE = 99;
export const FIDELITY_META = "wave:fidelity";

export type FidelityStamp = {
  /** 100 minus the structural difference, in percent. */
  match: number;
  /** The structural difference, in percent. */
  structural: number;
  /** The raw difference (every pixel the renderers drew differently), in percent. */
  raw: number;
  width: number;
  height: number;
  /** The Figma frame measured against, as figma:file/node. */
  reference: string | null;
  /** When it was measured (ISO). */
  at: string;
  /** Fingerprint of the page measured. */
  page: string;
};

export type FidelityCheck = {
  /** Whether the page was converted from Figma (screens only; specimens are measured in their own stage). */
  figma: boolean;
  stamp: FidelityStamp | null;
  pass: boolean;
  /** Why it does not pass, for the designer and engineer. */
  reason: string | null;
};

const META_RE = /[ \t]*<meta\s+name="wave:fidelity"\s+content="[^"]*"\s*\/?>\n?/g;
const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * A fingerprint of what the page draws: the page without its fidelity stamp,
 * its test ids and its Wave attributes (ids, bindings, answers), which
 * publishing and answering questions add and which draw nothing.
 */
export function pageFingerprint(html: string): string {
  const s = html
    .replace(META_RE, "")
    .replace(/\s+data-(?:wave|pi)-[\w-]+(?:="[^"]*")?/g, "")
    .replace(/\s+data-testid="[^"]*"/g, "")
    .replace(/>\s+</g, "><")
    .replace(/\s+/g, " ")
    .trim();
  // cyrb53: small, stable, the same in a browser and in Node.
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function readFidelity(html: string): FidelityStamp | null {
  const m = /<meta\s+name="wave:fidelity"\s+content="([^"]*)"/.exec(html);
  if (!m) return null;
  const f = Object.fromEntries(
    m[1].split(";").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const [width, height] = (f.size ?? "").split("x").map(Number);
  const num = (k: string) => (f[k] !== undefined && f[k] !== "" && Number.isFinite(Number(f[k])) ? Number(f[k]) : NaN);
  const stamp: FidelityStamp = {
    match: num("match"),
    structural: num("structural"),
    raw: num("raw"),
    width: width || 0,
    height: height || 0,
    reference: f.reference || null,
    at: f.at ?? "",
    page: f.page ?? "",
  };
  return Number.isNaN(stamp.match) || Number.isNaN(stamp.structural) ? null : stamp;
}

/** Writes the measurement into the page, replacing any earlier one. */
export function stampFidelity(
  html: string,
  result: { width: number; height: number; raw: { percent: number }; structural: { percent: number } },
  options: { reference?: string | null; at?: string } = {},
): { html: string; stamp: FidelityStamp } {
  const clean = html.replace(META_RE, "");
  const stamp: FidelityStamp = {
    match: round(100 - result.structural.percent),
    structural: round(result.structural.percent),
    raw: round(result.raw.percent),
    width: result.width,
    height: result.height,
    reference: options.reference ?? /<meta\s+name="figma-source"\s+content="([^"]*)"/.exec(clean)?.[1] ?? null,
    at: options.at ?? new Date().toISOString(),
    page: pageFingerprint(clean),
  };
  const content = [
    `match=${stamp.match}`,
    `structural=${stamp.structural}`,
    `raw=${stamp.raw}`,
    `size=${stamp.width}x${stamp.height}`,
    ...(stamp.reference ? [`reference=${stamp.reference.replace(/[";]/g, "")}`] : []),
    `at=${stamp.at}`,
    `page=${stamp.page}`,
  ].join("; ");
  const meta = `<meta name="${FIDELITY_META}" content="${content}">\n`;
  // Next to the figma-source meta when there is one, else first in the head.
  const after = /<meta\s+name="figma-source"[^>]*>\n?/.exec(clean) ?? /<head[^>]*>\n?/i.exec(clean);
  const at = after ? after.index + after[0].length : 0;
  return { html: clean.slice(0, at) + (after && !after[0].endsWith("\n") ? "\n" : "") + meta + clean.slice(at), stamp };
}

export function isFigmaScreen(html: string): boolean {
  return /<meta\s+name="figma-source"/.test(html) && !/<meta\s+name="(wave|pi):component"/.test(html);
}

/** The upload gate: a screen converted from Figma needs a measurement of this page at FIDELITY_GATE or better. */
export function checkFidelity(html: string, gate = FIDELITY_GATE): FidelityCheck {
  const figma = isFigmaScreen(html);
  const stamp = readFidelity(html);
  if (!figma) return { figma, stamp, pass: true, reason: null };
  if (!stamp) {
    return { figma, stamp, pass: false, reason: `It was converted from Figma but carries no measurement of how closely it matches the frame. Measure it (wave-figma fidelity) and stamp the result (wave-figma stamp) before uploading; it needs ${gate}% or better.` };
  }
  if (stamp.page !== pageFingerprint(html)) {
    return { figma, stamp, pass: false, reason: "The page changed after its match with Figma was measured. Measure it again and stamp the new result." };
  }
  if (stamp.match < gate) {
    return { figma, stamp, pass: false, reason: `It matches its Figma frame ${stamp.match}% (structural difference ${stamp.structural}%). A screen is uploaded only at ${gate}% or better; the last ${round(100 - gate)}% is for the browser and Figma drawing fonts slightly differently. Fix the conversion, or the design in Figma, and measure again.` };
  }
  return { figma, stamp, pass: true, reason: null };
}

export type FidelityLogRow = {
  screen: string;
  version: number | null;
  stamp: FidelityStamp | null;
  published: boolean;
  reason: string | null;
  when: string;
};

const LOG_HEAD = "| When | Screen | Version | Match | Structural | Raw | Size | Figma frame | Measured | Result |";

/**
 * The feature's fidelity report: every Figma screen at every publish, newest
 * first. Rows already in the report are kept.
 */
export function fidelityReport(feature: string, rows: FidelityLogRow[], previous: string | null, gate = FIDELITY_GATE): string {
  const pct = (n: number | undefined) => (n === undefined || Number.isNaN(n) ? "" : `${n}%`);
  const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  const fresh = rows.map((r) =>
    `| ${[
      r.when,
      r.screen,
      r.version === null ? "" : `v${r.version}`,
      pct(r.stamp?.match),
      pct(r.stamp?.structural),
      pct(r.stamp?.raw),
      r.stamp ? `${r.stamp.width}x${r.stamp.height}` : "",
      r.stamp?.reference ? `\`${r.stamp.reference}\`` : "",
      r.stamp?.at ?? "",
      r.published ? "Uploaded" : `Refused: ${r.reason ?? ""}`,
    ].map(cell).join(" | ")} |`,
  );
  const old = (previous ?? "").split("\n").filter((l) => l.startsWith("| ") && l !== LOG_HEAD && !l.startsWith("| ---"));
  return [
    `# Figma match: ${feature}`,
    "",
    `Each screen converted from Figma, compared with its Figma frame before it was uploaded: the page is rendered in a browser at the frame's size and compared pixel by pixel with Figma's render of the frame. Written by Wave at every publish, newest first.`,
    "",
    `- **Match** is 100% minus the structural difference. A screen is uploaded only at **${gate}%** or better. The last ${round(100 - gate)}% is the margin for the browser and Figma drawing the same font slightly differently (kerning, anti-aliasing).`,
    "- **Structural** is the difference after a light blur of both images: glyph-edge noise does not count, a box, a border or moved text does.",
    "- **Raw** counts every pixel the two renderers drew differently, glyph edges included. It is shown for reference and never gates.",
    "",
    LOG_HEAD,
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
    ...fresh,
    ...old,
    "",
  ].join("\n");
}
