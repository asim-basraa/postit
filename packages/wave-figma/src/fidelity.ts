import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { launchOptions } from "./browser";

/**
 * How closely a rendered page matches Figma's render of the same frame.
 *
 * Two numbers. Raw: the share of pixels pixelmatch calls different. Text is
 * drawn slightly differently by Figma and by a browser, so raw is never zero.
 * Structural: the same comparison after a light blur of both images, which
 * removes glyph-edge noise but not a box, a border or text that moved; a 2px
 * shift of a whole screen still scores well over 1%. The pass mark is on
 * structural.
 */

export type Blob = { size: number; box: [number, number, number, number] };

export type FidelityResult = {
  width: number;
  height: number;
  raw: { pixels: number; percent: number; worst: Blob | null };
  structural: { pixels: number; percent: number; worst: Blob | null };
  /** The worst 32px cells, for pointing at what to fix. */
  hotspots: { x: number; y: number; pixels: number }[];
  pass: boolean;
  threshold: number;
  /** PNG of the raw differences, red on a faded copy of the reference. */
  diffPng: Buffer;
};

export const DEFAULT_THRESHOLD = 0.25;

function flatten(png: PNG): PNG {
  const out = new PNG({ width: png.width, height: png.height });
  for (let i = 0; i < png.data.length; i += 4) {
    const a = png.data[i + 3] / 255;
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.round(png.data[i + c] * a + 255 * (1 - a));
    out.data[i + 3] = 255;
  }
  return out;
}

/** A box blur of radius r, twice (close to a gaussian of sigma about r). */
function blur(png: PNG, r = 1): PNG {
  const { width: w, height: h } = png;
  let src = Float32Array.from(png.data);
  for (let pass = 0; pass < 2; pass++) {
    const tmp = new Float32Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        for (let c = 0; c < 3; c++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) {
            const xx = x + k;
            if (xx < 0 || xx >= w) continue;
            s += src[(y * w + xx) * 4 + c];
            n++;
          }
          tmp[(y * w + x) * 4 + c] = s / n;
        }
    const out = new Float32Array(src.length);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        for (let c = 0; c < 3; c++) {
          let s = 0, n = 0;
          for (let k = -r; k <= r; k++) {
            const yy = y + k;
            if (yy < 0 || yy >= h) continue;
            s += tmp[(yy * w + x) * 4 + c];
            n++;
          }
          out[(y * w + x) * 4 + c] = s / n;
        }
        out[(y * w + x) * 4 + 3] = 255;
      }
    src = out;
  }
  const res = new PNG({ width: w, height: h });
  for (let i = 0; i < src.length; i++) res.data[i] = Math.round(src[i]);
  return res;
}

function worstBlob(mask: Uint8Array, w: number, h: number): Blob | null {
  const seen = new Uint8Array(w * h);
  let worst: Blob | null = null;
  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || seen[i]) continue;
    const stack = [i];
    seen[i] = 1;
    let size = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    while (stack.length) {
      const j = stack.pop()!;
      size++;
      const x = j % w, y = (j / w) | 0;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const k = ny * w + nx;
          if (mask[k] && !seen[k]) {
            seen[k] = 1;
            stack.push(k);
          }
        }
    }
    if (!worst || size > worst.size) worst = { size, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] };
  }
  return worst;
}

function compare(a: PNG, b: PNG, threshold: number, area = a.width * a.height) {
  const { width: w, height: h } = a;
  const diff = new PNG({ width: w, height: h });
  const pixels = pixelmatch(a.data, b.data, diff.data, w, h, { threshold, includeAA: false, alpha: 0.2 });
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = diff.data[i * 4] === 255 && diff.data[i * 4 + 1] === 0 ? 1 : 0;
  return { pixels, percent: +((100 * pixels) / area).toFixed(3), worst: worstBlob(mask, w, h), diff, mask };
}

/** A rectangle in image pixels: x, y, width, height. */
export type Region = [number, number, number, number];

export function compareImages(reference: Buffer, rendered: Buffer, options: { threshold?: number; regions?: Region[] } = {}): FidelityResult {
  const ref = flatten(PNG.sync.read(reference));
  const shot = flatten(PNG.sync.read(rendered));
  if (ref.width !== shot.width || ref.height !== shot.height) {
    throw new Error(`The images differ in size: Figma ${ref.width}x${ref.height}, page ${shot.width}x${shot.height}.`);
  }
  // Only these areas count (a component set's variants, not the editor's frame around them).
  let area = ref.width * ref.height;
  if (options.regions?.length) {
    const inside = new Uint8Array(ref.width * ref.height);
    for (const [x, y, w, h] of options.regions)
      for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(ref.height, Math.ceil(y + h)); yy++)
        for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(ref.width, Math.ceil(x + w)); xx++) inside[yy * ref.width + xx] = 1;
    area = 0;
    for (let i = 0; i < inside.length; i++) {
      if (inside[i]) {
        area++;
        continue;
      }
      for (let c = 0; c < 4; c++) shot.data[i * 4 + c] = ref.data[i * 4 + c];
    }
  }
  const raw = compare(ref, shot, 0.1, area);
  const structural = compare(blur(ref), blur(shot), 0.15, area);
  const hotspots: { x: number; y: number; pixels: number }[] = [];
  for (let y = 0; y < ref.height; y += 32)
    for (let x = 0; x < ref.width; x += 32) {
      let c = 0;
      for (let yy = y; yy < Math.min(y + 32, ref.height); yy++) for (let xx = x; xx < Math.min(x + 32, ref.width); xx++) c += structural.mask[yy * ref.width + xx];
      if (c) hotspots.push({ x, y, pixels: c });
    }
  hotspots.sort((p, q) => q.pixels - p.pixels);
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;
  return {
    width: ref.width,
    height: ref.height,
    raw: { pixels: raw.pixels, percent: raw.percent, worst: raw.worst },
    structural: { pixels: structural.pixels, percent: structural.percent, worst: structural.worst },
    hotspots: hotspots.slice(0, 10),
    pass: structural.percent <= threshold,
    threshold,
    diffPng: PNG.sync.write(raw.diff),
  };
}

/**
 * Renders a page at a frame's size with Playwright's Chromium, after its fonts
 * have loaded. Playwright is an optional dependency: the engineer installs it
 * once (`npm i -D playwright && npx playwright install chromium`).
 */
export async function renderPage(
  html: string,
  size: { width: number; height: number },
  options: { executablePath?: string; baseUrl?: string } = {},
): Promise<{ png: Buffer; fonts: string[]; failed: string[] }> {
  let playwright: typeof import("playwright");
  try {
    playwright = await import("playwright");
  } catch {
    throw new Error("Playwright is not installed. Run: npm i -D playwright && npx playwright install chromium");
  }
  const browser = await playwright.chromium.launch(launchOptions(options.executablePath));
  try {
    const page = await browser.newPage({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: 1 });
    const failed: string[] = [];
    page.on("requestfailed", (r) => failed.push(r.url()));
    if (options.baseUrl) await page.goto(options.baseUrl);
    await page.setContent(html, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`));
    const png = await page.screenshot({ clip: { x: 0, y: 0, width: size.width, height: size.height } });
    return { png, fonts, failed };
  } finally {
    await browser.close();
  }
}
