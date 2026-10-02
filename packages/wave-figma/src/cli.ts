import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { validateTokenDocument } from "@wave/spec";
import { convertFigma, type InstanceInfo } from "./convert";
import { buildDtcg, type FigmaStyles } from "./dtcg";
import { compareImages, renderPage, DEFAULT_THRESHOLD } from "./fidelity";
import { fontFaceCss, fontFileName, googleFontFiles } from "./fonts";
import { compareDocuments } from "./lock";
import { alignText } from "./align";
import { applyUpgrade, revertUpgrade, type UpgradeOp } from "./semantic";
import { checksum, script, INVENTORY, VARIABLES, STYLES, NODE_MAP, COMPONENT, EXPORT_SVG, EFFECTS } from "./scripts";

/**
 * wave-figma: the Figma flow's tools, one command per step. Every command
 * prints JSON on stdout (or writes the file named by -o) so a skill can read
 * the result, and exits 1 when its check fails.
 */

const HELP = `wave-figma <command> [options]

  script <INVENTORY|VARIABLES|STYLES|NODE_MAP|COMPONENT|EFFECTS|EXPORT_SVG> [--page id] [--node id] [--part n] [--ids a,b]
      Prints a plugin script for Figma's use_figma tool.
  checksum <file>
      Prints the checksum and length of a saved Figma result, to compare with the script's.
  tokens --variables vars.txt --styles styles.json [--description text] -o tokens.json
      Builds a DTCG token file and validates it.
  fonts --families "Geist,Geist Mono" [--weights 400,500,600] --out dir
      Downloads free fonts (Google Fonts) to dir, with fonts.json describing them.
  font-css --manifest dir/fonts.json [--urls urls.json | --inline] -o fonts.css
      @font-face rules, pointing at uploaded URLs ({file: url}) or inlined as data URLs.
  convert --code ref.jsx --width 1440 --height 900 [--tokens t.json] [--map map.json] [--svgs svgs.json] [--effects effects.json]
          [--fonts fonts.css] [--title t] [--source figma:file/node] -o page.html
          [--component component.json --type button [--status proposed]]
      Figma reference code to a static HTML page. Prints the report. With
      --component (the COMPONENT script's data) it is a catalogue specimen.
  render --page page.html --width 1440 --height 900 -o page.png [--chromium path]
  fidelity --page page.html --reference figma.png [--component component.json] [--threshold ${DEFAULT_THRESHOLD}] [--diff diff.png] [--chromium path]
      Renders the page at the reference's size and compares. Exit 1 when it does not pass.
  align --page page.html --reference figma.png [--component component.json] -o aligned.html [--chromium path]
      Places each text element where Figma draws it (sub-pixel), in one marked style block.
  upgrade --page page.html --plan plan.json -o upgraded.html [--chromium path]
      Real elements (input, button, label + checkbox) where Figma drew pictures of them, then the look lock.
  lock --before a.html --after b.html [--chromium path]
      The look lock: lists every change that could affect rendering and compares
      the two renders. Exit 1 unless both are clean.
`;

function args(argv: string[]) {
  const pos: string[] = [];
  const opt: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o") opt.o = argv[++i];
    else if (a.startsWith("--")) {
      const k = a.slice(2);
      opt[k] = argv[i + 1] && !argv[i + 1].startsWith("-") ? argv[++i] : "true";
    } else pos.push(a);
  }
  return { pos, opt };
}

const read = (f: string) => readFileSync(f, "utf8");
const out = (o: unknown) => process.stdout.write(JSON.stringify(o, null, 2) + "\n");
const need = (opt: Record<string, string>, k: string) => {
  if (!opt[k]) throw new Error(`--${k} is required.`);
  return opt[k];
};
const write = (file: string, data: string | Buffer) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
};

/** The look lock: the documents match once the upgrade is undone, and the two renders are identical. */
async function lookLock(before: string, after: string, opt: Record<string, string>) {
  const changes = compareDocuments(before, revertUpgrade(after));
  const { PNG } = await import("pngjs");
  const width = Number(opt.width ?? 0) || Number(/body\{width:(\d+)px/.exec(before)?.[1] ?? 1440);
  const height = Number(opt.height ?? 0) || Number(/min-height:(\d+)px/.exec(before)?.[1] ?? 900);
  const a = await renderPage(before, { width, height }, { executablePath: opt.chromium });
  const b = await renderPage(after, { width, height }, { executablePath: opt.chromium });
  const ia = PNG.sync.read(a.png);
  const ib = PNG.sync.read(b.png);
  let pixels = 0;
  for (let i = 0; i < ia.data.length; i += 4) if (ia.data[i] !== ib.data[i] || ia.data[i + 1] !== ib.data[i + 1] || ia.data[i + 2] !== ib.data[i + 2]) pixels++;
  if (opt.diff && pixels) write(opt.diff, compareImages(a.png, b.png).diffPng);
  return { identical: pixels === 0, differingPixels: pixels, changes };
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const { pos, opt } = args(rest);
  switch (cmd) {
    case "script": {
      const all: Record<string, string> = { INVENTORY, VARIABLES, STYLES, NODE_MAP, COMPONENT, EFFECTS, EXPORT_SVG };
      const src = all[(pos[0] ?? "").toUpperCase()];
      if (!src) throw new Error(`Unknown script. One of: ${Object.keys(all).join(", ")}.`);
      process.stdout.write(script(src, { PAGE: opt.page, NODE: opt.node, PART: opt.part ? Number(opt.part) : 0, IDS: opt.ids ? opt.ids.split(",") : [] }).trim() + "\n");
      return 0;
    }
    case "checksum": {
      const s = read(need({ f: pos[0] }, "f")).replace(/\n$/, "");
      out({ length: s.length, checksum: checksum(s) });
      return 0;
    }
    case "tokens": {
      const styles = JSON.parse(read(need(opt, "styles"))) as FigmaStyles;
      const r = buildDtcg(read(need(opt, "variables")).replace(/\n$/, ""), styles, { description: opt.description });
      const json = JSON.stringify(r.doc, null, 2) + "\n";
      const v = validateTokenDocument(json);
      write(need(opt, "o"), json);
      out({ tokens: r.count, notes: r.notes, problems: v.problems, typeCounts: v.typeCounts });
      return v.problems.length ? 1 : 0;
    }
    case "fonts": {
      const families = need(opt, "families").split(",").map((s) => s.trim()).filter(Boolean);
      const weights = (opt.weights ?? "400,500,600").split(",").map(Number);
      const dir = need(opt, "out");
      const { files, missing } = await googleFontFiles(families, weights);
      const saved = [];
      for (const f of files) {
        const res = await fetch(f.url);
        if (!res.ok) throw new Error(`Could not download ${f.url}: ${res.status}`);
        const name = fontFileName(f);
        write(join(dir, name), Buffer.from(await res.arrayBuffer()));
        saved.push({ ...f, file: name });
      }
      write(join(dir, "fonts.json"), JSON.stringify(saved, null, 2));
      out({ saved: saved.map((s) => s.file), missing });
      return missing.length ? 1 : 0;
    }
    case "font-css": {
      const manifestFile = need(opt, "manifest");
      const files = JSON.parse(read(manifestFile)) as (Parameters<typeof fontFaceCss>[0][number] & { file: string })[];
      const urls = opt.urls ? (JSON.parse(read(opt.urls)) as Record<string, string>) : {};
      const withSrc = files.map((f) => ({
        ...f,
        src: opt.inline ? `data:font/woff2;base64,${readFileSync(join(dirname(manifestFile), f.file)).toString("base64")}` : urls[f.file] ?? f.file,
      }));
      const missing = withSrc.filter((f) => !opt.inline && !urls[f.file]).map((f) => f.file);
      write(need(opt, "o"), fontFaceCss(withSrc));
      out({ faces: withSrc.length, withoutUrl: missing });
      return 0;
    }
    case "convert": {
      const map = opt.map ? JSON.parse(read(opt.map)) : null;
      const instances: Record<string, InstanceInfo> = {};
      for (const i of map?.instances ?? []) instances[i.id] = { component: i.component, variant: i.variant, props: i.props };
      // A specimen: each variant of the component set is an example of it.
      const comp = opt.component ? JSON.parse(read(opt.component)) : null;
      let definition: Record<string, unknown> | undefined;
      if (comp) {
        for (const v of comp.variants) instances[v.id] = { component: comp.name, variant: v.variant };
        const states = new Set<string>();
        const variants = new Set<string>();
        for (const v of comp.variants) {
          const entries = Object.entries(v.variant as Record<string, string>);
          const st = entries.find(([k]) => /^state$/i.test(k));
          if (st && !/^default$/i.test(st[1])) states.add(st[1].toLowerCase());
          const rest = entries.filter(([k]) => !/^state$/i.test(k)).map(([, x]) => x.toLowerCase().replace(/\s+/g, "-")).join("-");
          variants.add(rest || "default");
        }
        definition = {
          name: comp.name,
          type: opt.type ?? null,
          description: comp.description || null,
          variants: [...variants],
          states: [...states],
          status: opt.status ?? "proposed",
          figma: { node: comp.id, properties: comp.properties },
        };
      }
      const { html, report } = await convertFigma({
        code: read(need(opt, "code")),
        width: Number(need(opt, "width")),
        height: Number(need(opt, "height")),
        tokens: opt.tokens ? read(opt.tokens) : null,
        svgByNode: opt.svgs ? JSON.parse(read(opt.svgs)) : undefined,
        effects: opt.effects ? JSON.parse(read(opt.effects)) : undefined,
        instances,
        fontCss: opt.fonts ? read(opt.fonts) : undefined,
        title: opt.title,
        source: opt.source,
        definition,
        variants: comp && comp.variants.length > 1 ? comp.variants : undefined,
      });
      write(need(opt, "o"), html);
      out(report);
      return 0;
    }
    case "render": {
      const r = await renderPage(read(need(opt, "page")), { width: Number(need(opt, "width")), height: Number(need(opt, "height")) }, { executablePath: opt.chromium });
      write(need(opt, "o"), r.png);
      out({ fonts: r.fonts, failed: r.failed });
      return r.failed.length ? 1 : 0;
    }
    case "fidelity": {
      const reference = readFileSync(need(opt, "reference"));
      const { PNG } = await import("pngjs");
      const ref = PNG.sync.read(reference);
      const r = await renderPage(read(need(opt, "page")), { width: ref.width, height: ref.height }, { executablePath: opt.chromium });
      // A specimen counts only its variants, not Figma's frame around the set.
      const comp = opt.component ? JSON.parse(read(opt.component)) : null;
      const regions = comp && comp.variants.length > 1 ? comp.variants.map((v: { x: number; y: number; width: number; height: number }) => [v.x, v.y, v.width, v.height] as [number, number, number, number]) : undefined;
      const result = compareImages(reference, r.png, { threshold: opt.threshold ? Number(opt.threshold) : undefined, regions });
      if (opt.diff) write(opt.diff, result.diffPng);
      if (opt.shot) write(opt.shot, r.png);
      const { diffPng: _d, ...rest } = result;
      out({ ...rest, fontsLoaded: r.fonts, failedRequests: r.failed });
      return result.pass && !r.failed.length ? 0 : 1;
    }
    case "align": {
      const comp = opt.component ? JSON.parse(read(opt.component)) : null;
      const regions = comp && comp.variants.length > 1 ? comp.variants.map((v: { x: number; y: number; width: number; height: number }) => [v.x, v.y, v.width, v.height] as [number, number, number, number]) : undefined;
      const r = await alignText(read(need(opt, "page")), readFileSync(need(opt, "reference")), { executablePath: opt.chromium, regions });
      write(need(opt, "o"), r.html);
      out({ nudges: r.nudges.length, strokes: r.strokes, structuralBefore: r.before, structuralAfter: r.after, list: r.nudges });
      return r.after <= r.before ? 0 : 1;
    }
    case "upgrade": {
      const before = read(need(opt, "page"));
      const plan = JSON.parse(read(need(opt, "plan"))) as UpgradeOp[] | { ops: UpgradeOp[] };
      const r = applyUpgrade(before, Array.isArray(plan) ? plan : plan.ops);
      write(need(opt, "o"), r.html);
      const lock = await lookLock(before, r.html, opt);
      out({ applied: r.applied, missing: r.missing, ...lock });
      return lock.identical && !lock.changes.length && !r.missing.length ? 0 : 1;
    }
    case "lock": {
      const lock = await lookLock(read(need(opt, "before")), read(need(opt, "after")), opt);
      out(lock);
      return lock.identical && lock.changes.length === 0 ? 0 : 1;
    }
    default:
      process.stdout.write(HELP);
      return cmd ? 1 : 0;
  }
}
