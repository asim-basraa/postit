import { createRequire } from "node:module";
const sharp = createRequire("/home/user/postit/package.json")("sharp");
import { PNG } from "pngjs"; import pixelmatch from "pixelmatch";
const [, , a, b] = process.argv;
const load = async (f) => { const { data, info } = await sharp(f).flatten({ background: "#fff" }).blur(1.2).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data, w: info.width, h: info.height }; };
const A = await load(a), B = await load(b);
const out = new PNG({ width: A.w, height: A.h });
const n = pixelmatch(A.data, B.data, out.data, A.w, A.h, { threshold: 0.15, includeAA: false });
console.log(JSON.stringify({ structuralDiffering: n, percent: +(100 * n / (A.w * A.h)).toFixed(3) }));
