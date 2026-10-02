import { PNG } from "pngjs";
import { compareImages, type Region } from "./fidelity";

/**
 * Text alignment against Figma's render.
 *
 * Boxes land where Figma puts them, but Figma draws glyphs at fractional
 * positions inside a line and a browser snaps the baseline to a whole pixel,
 * so a line of text can sit a pixel or so off. This measures, for every text
 * element, where its ink is in Figma's render and in the page, and writes a
 * sub-pixel translate for each one that is off, in a single marked style
 * block. Every correction is listed, and the page is compared again after.
 */

export type TextNudge = { key: string; text: string; dx: number; dy: number };

type Box = { key: string; text: string; x: number; y: number; w: number; h: number };

const STYLE_ID = "wave-figma-align";
const STROKE_ID = "wave-figma-strokes";

export type StrokeFix = { id: string; width: number; drawn: number; color: string; shadow?: string };

/**
 * Figma draws a 1.5px stroke; Chrome rounds a border down to whole pixels and
 * draws 1px, at every screen density. This finds every element whose border
 * as written in the stylesheet is fractional and adds the missing part as an
 * inset ring of the same colour, inside the border Chrome does draw.
 */
export async function strokeFixes(html: string, size: { width: number; height: number }, executablePath?: string): Promise<StrokeFix[]> {
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    const found = await page.evaluate(() => {
      const rules: CSSStyleRule[] = [];
      const collect = (list: CSSRuleList) => {
        for (const r of list) {
          if (r instanceof CSSStyleRule) rules.push(r);
          if ("cssRules" in r && (r as CSSGroupingRule).cssRules) collect((r as CSSGroupingRule).cssRules);
        }
      };
      for (const s of document.styleSheets) collect(s.cssRules);
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const resolve = (el: Element, v: string, depth = 0): string => {
        if (depth > 8) return v;
        return v.replace(/var\((--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g, (_m, name: string, fb?: string) => {
          const val = getComputedStyle(el).getPropertyValue(name).trim();
          return resolve(el, val || (fb ?? "").trim(), depth + 1);
        });
      };
      const px = (v: string) => {
        const m = /^(-?[\d.]+)(px|rem)$/.exec(v.trim());
        return m ? (m[2] === "rem" ? +m[1] * rootPx : +m[1]) : NaN;
      };
      const out: { id: string; width: number; drawn: number; color: string; shadow: string }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("[data-figma-id]")) {
        const cs = getComputedStyle(el);
        if (cs.borderTopStyle === "none") continue;
        let written = "";
        for (const r of rules) {
          try {
            if (!el.matches(r.selectorText)) continue;
          } catch {
            continue;
          }
          const v = r.style.getPropertyValue("border-top-width") || r.style.getPropertyValue("border-width");
          if (v) written = v;
        }
        const inline = el.style.getPropertyValue("border-top-width") || el.style.getPropertyValue("border-width");
        if (inline) written = inline;
        if (!written) continue;
        const width = px(resolve(el, written).split(/\s+/)[0]);
        const drawn = parseFloat(cs.borderTopWidth);
        const even = ["Right", "Bottom", "Left"].every((s) => cs.getPropertyValue(`border-${s.toLowerCase()}-width`) === cs.borderTopWidth);
        if (!even || !(width - drawn >= 0.05)) continue;
        out.push({ id: el.dataset.figmaId!, width: +width.toFixed(3), drawn, color: cs.borderTopColor, shadow: cs.boxShadow });
      }
      return out;
    });
    const seen = new Set<string>();
    return found.filter((f) => !seen.has(f.id) && seen.add(f.id));
  } finally {
    await browser.close();
  }
}

function strokeCss(fixes: StrokeFix[]): string {
  const rules = fixes.map((f) => {
    const ring = `inset 0 0 0 ${+(f.width - f.drawn).toFixed(3)}px ${f.color}`;
    const rest = f.shadow && f.shadow !== "none" ? `,${f.shadow}` : "";
    return `[data-figma-id="${f.id}"]{box-shadow:${ring}${rest}}`;
  });
  return `<style id="${STROKE_ID}">/* Fractional strokes as Figma draws them (wave-figma align). */\n${rules.join("\n")}\n</style>\n`;
}

/** Ink centroid of a box against its own background (the median of its edge pixels). */
function inkCentroid(png: PNG, b: Box, pad: number): { x: number; y: number; mass: number } | null {
  const x0 = Math.max(0, Math.floor(b.x - pad)), y0 = Math.max(0, Math.floor(b.y - pad));
  const x1 = Math.min(png.width, Math.ceil(b.x + b.w + pad)), y1 = Math.min(png.height, Math.ceil(b.y + b.h + pad));
  if (x1 - x0 < 2 || y1 - y0 < 2) return null;
  const lum = (x: number, y: number) => {
    const i = (y * png.width + x) * 4;
    const a = png.data[i + 3] / 255;
    return (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]) * a + 255 * (1 - a);
  };
  const edge: number[] = [];
  for (let x = x0; x < x1; x++) edge.push(lum(x, y0), lum(x, y1 - 1));
  for (let y = y0; y < y1; y++) edge.push(lum(x0, y), lum(x1 - 1, y));
  edge.sort((p, q) => p - q);
  const bg = edge[edge.length >> 1];
  let sx = 0, sy = 0, s = 0;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const ink = Math.abs(lum(x, y) - bg);
      if (ink < 24) continue;
      sx += x * ink;
      sy += y * ink;
      s += ink;
    }
  return s > 0 ? { x: sx / s, y: sy / s, mass: s } : null;
}

async function shoot(html: string, size: { width: number; height: number }, executablePath?: string): Promise<{ png: Buffer; boxes: Box[] }> {
  const playwright = await import("playwright");
  const browser = await playwright.chromium.launch(executablePath ? { executablePath } : {});
  try {
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const boxes = await page.evaluate(() => {
      const out: { key: string; text: string; x: number; y: number; w: number; h: number }[] = [];
      for (const el of document.querySelectorAll<HTMLElement>("[data-figma-text]")) {
        const r = el.getBoundingClientRect();
        out.push({ key: el.dataset.figmaText!, text: (el.textContent ?? "").trim().slice(0, 40), x: r.x, y: r.y, w: r.width, h: r.height });
      }
      return out;
    });
    const png = await page.screenshot({ clip: { x: 0, y: 0, ...size } });
    return { png, boxes };
  } finally {
    await browser.close();
  }
}

/** Marks every element that holds text directly, so it can be measured and nudged. */
export function markTextElements(html: string): string {
  let n = 0;
  return html.replace(/<(p|span|div|h[1-6]|label|a|button|li)(\s[^>]*)?>(?=[^<]*[^\s<][^<]*<)/g, (m, tag: string, attrs = "") =>
    /data-figma-text=/.test(attrs) ? m : `<${tag}${attrs} data-figma-text="t${++n}">`,
  );
}

export async function alignText(
  html: string,
  reference: Buffer,
  options: { executablePath?: string; regions?: Region[]; maxShift?: number; minShift?: number } = {},
): Promise<{ html: string; nudges: TextNudge[]; strokes: StrokeFix[]; before: number; after: number }> {
  const ref = PNG.sync.read(reference);
  const size = { width: ref.width, height: ref.height };
  const clean = html.replace(new RegExp(`<style id="(?:${STYLE_ID}|${STROKE_ID})">[\\s\\S]*?</style>\\n?`, "g"), "");
  const strokes = await strokeFixes(clean, size, options.executablePath);
  const stroked = strokes.length ? clean.replace("</head>", `${strokeCss(strokes)}</head>`) : clean;
  const marked = markTextElements(stroked);
  const first = await shoot(marked, size, options.executablePath);
  const shot = PNG.sync.read(first.png);
  const nudges: TextNudge[] = [];
  const max = options.maxShift ?? 3;
  const min = options.minShift ?? 0.2;
  for (const b of first.boxes) {
    const f = inkCentroid(ref, b, 3);
    const p = inkCentroid(shot, b, 3);
    if (!f || !p) continue;
    // Same text, roughly the same ink: otherwise this is a real difference, not alignment.
    if (Math.abs(f.mass - p.mass) / Math.max(f.mass, p.mass) > 0.35) continue;
    const dx = +(f.x - p.x).toFixed(2), dy = +(f.y - p.y).toFixed(2);
    if (Math.abs(dx) > max || Math.abs(dy) > max) continue;
    if (Math.abs(dx) < min && Math.abs(dy) < min) continue;
    nudges.push({ key: b.key, text: b.text, dx: Math.abs(dx) < min ? 0 : dx, dy: Math.abs(dy) < min ? 0 : dy });
  }
  const css = nudges.map((n) => `[data-figma-text="${n.key}"]{translate:${n.dx}px ${n.dy}px}`).join("\n");
  const out = nudges.length ? marked.replace("</head>", `<style id="${STYLE_ID}">/* Text placed to match Figma's render (wave-figma align). */\n${css}\n</style>\n</head>`) : marked;
  const second = nudges.length ? await shoot(out, size, options.executablePath) : first;
  const before = compareImages(reference, first.png, { regions: options.regions }).structural.percent;
  const after = compareImages(reference, second.png, { regions: options.regions }).structural.percent;
  return { html: out, nudges, strokes: strokes.map(({ id, width, drawn, color }) => ({ id, width, drawn, color })), before, after };
}
