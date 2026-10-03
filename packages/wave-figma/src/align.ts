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
): Promise<{ html: string; nudges: TextNudge[]; before: number; after: number }> {
  const ref = PNG.sync.read(reference);
  const size = { width: ref.width, height: ref.height };
  const clean = html.replace(new RegExp(`<style id="${STYLE_ID}">[\\s\\S]*?</style>\\n?`, "g"), "");
  const marked = markTextElements(clean);
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
  // As a share of the text's own box: the same shift, in a unit that is not a design value.
  const pct = (d: number, size: number) => `${+((d / size) * 100).toFixed(4)}%`;
  const box = new Map(first.boxes.map((b) => [b.key, b]));
  const css = nudges.map((n) => { const b = box.get(n.key)!; return `[data-figma-text="${n.key}"]{translate:${pct(n.dx, b.w)} ${pct(n.dy, b.h)}}`; }).join("\n");
  const out = nudges.length ? marked.replace("</head>", `<style id="${STYLE_ID}">/* Text placed to match Figma's render (wave-figma align). */\n${css}\n</style>\n</head>`) : marked;
  const second = nudges.length ? await shoot(out, size, options.executablePath) : first;
  const before = compareImages(reference, first.png, { regions: options.regions }).structural.percent;
  const after = compareImages(reference, second.png, { regions: options.regions }).structural.percent;
  return { html: out, nudges, before, after };
}
