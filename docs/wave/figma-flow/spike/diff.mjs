// Spike: render HTML at the frame size and pixel-diff it against Figma's render.
// usage: node diff.mjs <page.html> <ref.png> <width> <height> <out-prefix>
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const require = createRequire("/home/user/postit/package.json");
const { chromium } = require("playwright");
const [, , page, refFile, w, h, out] = process.argv;
const W = Number(w), H = Number(h);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
await p.goto(pathToFileURL(page).href, { waitUntil: "networkidle" });
await p.evaluate(() => document.fonts.ready);
const shot = PNG.sync.read(await p.screenshot({ clip: { x: 0, y: 0, width: W, height: H } }));
const fonts = await p.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family} ${f.weight}`));
await browser.close();

const ref = PNG.sync.read(readFileSync(refFile));
// Figma's PNG has alpha; flatten on white like the page.
for (let i = 0; i < ref.data.length; i += 4) {
  const a = ref.data[i + 3] / 255;
  for (let c = 0; c < 3; c++) ref.data[i + c] = Math.round(ref.data[i + c] * a + 255 * (1 - a));
  ref.data[i + 3] = 255;
}
const diff = new PNG({ width: W, height: H });
const n = pixelmatch(ref.data, shot.data, diff.data, W, H, { threshold: 0.1, includeAA: false, alpha: 0.2 });
writeFileSync(`${out}.png`, PNG.sync.write(shot));
writeFileSync(`${out}.diff.png`, PNG.sync.write(diff));

// Where the differences are: a grid of 32px cells, the worst ones listed.
const mask = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) mask[i] = diff.data[i * 4] === 255 && diff.data[i * 4 + 1] === 0 ? 1 : 0;
const cells = [];
for (let y = 0; y < H; y += 32) for (let x = 0; x < W; x += 32) {
  let c = 0;
  for (let yy = y; yy < Math.min(y + 32, H); yy++) for (let xx = x; xx < Math.min(x + 32, W); xx++) c += mask[yy * W + xx];
  if (c) cells.push({ x, y, c });
}
cells.sort((a, b) => b.c - a.c);
// Largest connected blob (8-connected), as a bounding box.
const seen = new Uint8Array(W * H);
let worst = { size: 0 };
for (let i = 0; i < W * H; i++) {
  if (!mask[i] || seen[i]) continue;
  const stack = [i]; seen[i] = 1;
  let size = 0, x0 = W, y0 = H, x1 = 0, y1 = 0;
  while (stack.length) {
    const j = stack.pop(); size++;
    const x = j % W, y = (j / W) | 0;
    x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (mask[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
    }
  }
  if (size > worst.size) worst = { size, box: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] };
}
console.log(JSON.stringify({ differing: n, percent: +((100 * n) / (W * H)).toFixed(3), worstBlob: worst, topCells: cells.slice(0, 8), fontsLoaded: fonts.length }, null, 0));
