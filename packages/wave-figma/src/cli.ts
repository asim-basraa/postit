import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { assignIds, assignTestIds, checkFidelity, FIDELITY_GATE, stampFidelity, designSystemIds, parseDesignMd, parseFeatureMd, parseMockup, parseSpecimen, parseTokens, preflightHtml, validateTokenDocument, type CatalogueComponent } from "@wave/spec";
import { convertFigma, writtenState, type InstanceInfo } from "./convert";
import { buildDtcg, type FigmaStyles } from "./dtcg";
import { compareImages, renderPage, DEFAULT_THRESHOLD } from "./fidelity";
import { fontFaceCss, fontFileName, googleFontFiles } from "./fonts";
import { compareDocuments } from "./lock";
import { alignText } from "./align";
import { carryIds } from "./carry";
import { errorParts, linkStates, withErrorParts } from "./states";
import { specimenRoots, specimenTags } from "./specimen-roots";
import { applyUpgrade, outline, outlineText, revertUpgrade, type UpgradeOp } from "./semantic";
import { checksum, script, INVENTORY, VARIABLES, STYLES, NODE_MAP, COMPONENT, EXPORT_SVG, EFFECTS, GATE, BINDINGS } from "./scripts";
import { evaluateGate, gateCovers, gateMarkdown, type GateReport } from "./gate";
import { readinessReport, type PageFidelity } from "./report";
import { behaviourCheck, type BehaviourResult } from "./behaviour";

/**
 * wave-figma: the Figma flow's tools, one command per step. Every command
 * prints JSON on stdout (or writes the file named by -o) so a skill can read
 * the result, and exits 1 when its check fails.
 */

const HELP = `wave-figma <command> [options]

  script <GATE|INVENTORY|VARIABLES|STYLES|NODE_MAP|COMPONENT|EFFECTS|BINDINGS|EXPORT_SVG> [--page id] [--node id] [--part n] [--ids a,b]
      Prints a plugin script for Figma's use_figma tool. GATE: --ids the pages or frames to check,
      --page the design-system page. BINDINGS: --ids the frames or components to convert.
  gate --report gate.json [-o GATE.md] [--fonts]
      The entry gate: what in the Figma file Wave does not take as it is, blocking and advice, with a
      link to each layer. Exit 1 while anything blocks. --fonts also lists fonts Google does not serve.
  checksum <file>
      Prints the checksum and length of a saved Figma result, to compare with the script's.
  tokens --variables vars.txt --styles styles.json [--description text] -o tokens.json
      Builds a DTCG token file and validates it.
  fonts --families "Geist,Geist Mono" [--weights 400,500,600] --out dir
      Downloads free fonts (Google Fonts) to dir, with fonts.json describing them.
  font-css --manifest dir/fonts.json [--urls urls.json | --inline] -o fonts.css
      @font-face rules, pointing at uploaded URLs ({file: url}) or inlined as data URLs.
  convert --gate gate.json --code ref.jsx --width 1440 --height 900 [--tokens t.json] [--map map.json] [--svgs svgs.json] [--effects effects.json]
          [--bindings bindings.txt] [--fonts fonts.css] [--title t] [--source figma:file/node] -o page.html
          [--component component.json --type button [--status proposed]]
      Figma reference code to a static HTML page. Prints the report. With
      --component (the COMPONENT script's data) it is a catalogue specimen. --bindings (the BINDINGS
      script's text) puts back variables the reference code wrote as plain values. Refuses
      unless the gate report passed and covers the frame or component.
  render --page page.html --width 1440 --height 900 -o page.png [--chromium path]
  fidelity --page page.html --reference figma.png [--component component.json] [--threshold ${DEFAULT_THRESHOLD}] [--diff diff.png] [--stamp out.html] [--source figma:file/node] [--chromium path]
      Renders the page at the reference's size and compares. Exit 1 when it does not pass.
      --stamp: writes the page with the measurement in it (the wave:fidelity meta). Post-it uploads
      a screen converted from Figma only with a stamp of that page at ${FIDELITY_GATE}% match or better.
  stamp --page page.html --fidelity fidelity.json [--source figma:file/node] -o out.html
      Stamps a measurement taken earlier (fidelity's JSON output) into the page it measured.
  align --page page.html --reference figma.png [--component component.json] -o aligned.html [--chromium path]
      Places each text element where Figma draws it (sub-pixel), in one marked style block.
  upgrade --page page.html --plan plan.json -o upgraded.html [--chromium path]
      Real elements (input, button, label + checkbox) where Figma drew pictures of them, then the look lock.
  lock --before a.html --after b.html [--chromium path]
  convert ... --components dir|a.json,b.json --map node-map.json --screens screens.json
      For a screen: marks design-system instances, gives each instance its id, and writes Figma's
      prototype links as data-wave-to (screens.json maps frame names to screen slugs).
      --specimen-pages dir: the published specimen pages; each instance then carries exactly its
      specimen's root classes, and how it sits in its parent goes on a wrapper around it.
  outline --page page.html [--json]        the elements a semantic plan names, one a line
  preflight --page p.html --name "About you" [--tokens t.json] [--specimens dir] [--design DESIGN.md] [--feature FEATURE.md] [--asset-base url/]
      Offline preflight; Post-it's preflight_html (via send) is the one that counts.
  ids --page page.html [--from published.html] [--screen <slug>] [-o out.html]
      Wave ids where needed. --from: each Figma layer keeps the id (and test id) it had in that version.
      --screen: test ids on the screen's root, sections and design-system components (publishing
      gives them too; this shows them first).
  behaviour --page screen.html --specimens dir|a.html,b.html [--width 1440 --height 900] [-o result.json] [--chromium path]
      Plays the screen with the prototype runtime and clicks every control: a choice has to show
      being chosen, a select has to open its drawn menu, an action has to go somewhere. Exit 1 when
      any does nothing visible. Run it on every screen before publishing.
  report --gate gate.json -o REPORT.md [--fidelity results.json] [--behaviour b.json] [--fonts] [--title t] [--version n]
      The readiness report for the designer: whether Wave can take the file, and every correction
      to make in Figma, by component and screen, with links. results.json: [{name, node, score, pass,
      cause}]. b.json: [{name, result}] from behaviour. Exit 1 unless the file is ready.
  bundle --screen "Name=file.html,Other=b.html" -o screens.json    for wave_publish_flow via send
  send --link <upload link> --tool <post-it tool> [--args '{"space_id":"..."}'] [--file content=page.html,...] [--json-file screens=screens.json]
      Calls a Post-it tool directly through an upload link (Post-it's wave_upload_link; or
      POSTIT_MCP_URL and POSTIT_TOKEN in the environment), with file
      contents put in the arguments here, so a page is never copied through the conversation.
      The look lock: lists every change that could affect rendering and compares
      the two renders. Exit 1 unless both are clean.
`;

/** HTML files: a folder's, or a comma list. */
function htmlFiles(spec: string): string[] {
  return spec.split(",").map((p) => p.trim()).filter(Boolean).flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => f.endsWith(".html")).map((f) => join(p, f)) : [p]));
}


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

/** Files named by a comma list, where a directory stands for every component.json under it. */
function listFiles(spec: string | undefined): string[] {
  const out: string[] = [];
  for (const p of (spec ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    if (existsSync(p) && statSync(p).isDirectory()) {
      for (const d of readdirSync(p)) {
        const f = join(p, d, "component.json");
        if (existsSync(f)) out.push(f);
      }
    } else out.push(p);
  }
  return out;
}

/** A component set's variants, states, design-system ids, and what marks each drawn variant (by its node id). */
function componentRecords(comp: { name: string; properties?: Record<string, { type: string; default: unknown }>; variants: { id: string; variant: Record<string, string> }[] }) {
  const stateProp = Object.entries(comp.properties ?? {}).find(([k, p]) => /^state$/i.test(k) && p.type === "VARIANT");
  const baseState = stateProp ? String(stateProp[1].default) : undefined;
  const states = new Set<string>();
  const variants = new Set<string>();
  const keyOf = new Map<string, string>();
  for (const v of comp.variants) {
    const entries = Object.entries(v.variant);
    const st = entries.find(([k]) => /^state$/i.test(k));
    const written = st ? writtenState(st[1], baseState) : null;
    if (written) states.add(written);
    const rest = entries.filter(([k]) => !/^state$/i.test(k)).map(([, x]) => x.toLowerCase().replace(/\s+/g, "-")).join("-");
    variants.add(rest || "default");
    keyOf.set(v.id, rest || "default");
  }
  const ds = designSystemIds(comp.name, [...variants]);
  const instances: Record<string, InstanceInfo> = {};
  const options = stateProp ? [...new Set(comp.variants.map((v) => Object.entries(v.variant).find(([k]) => /^state$/i.test(k))?.[1]).filter((x): x is string => !!x))] : undefined;
  for (const v of comp.variants) instances[v.id] = { component: comp.name, variant: v.variant, baseState, ds: ds.variantIds[keyOf.get(v.id)!] ?? ds.id, states: options };
  return { instances, ds, variants: [...variants], states: [...states] };
}

export async function main(argv: string[]): Promise<number> {
  const [cmd, ...rest] = argv;
  const { pos, opt } = args(rest);
  switch (cmd) {
    case "script": {
      const all: Record<string, string> = { GATE, INVENTORY, VARIABLES, STYLES, NODE_MAP, COMPONENT, EFFECTS, BINDINGS, EXPORT_SVG };
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
    case "gate": {
      const report = JSON.parse(read(need(opt, "report"))) as GateReport;
      const result = evaluateGate(report);
      const fontsMissing = opt.fonts ? (await googleFontFiles(report.fonts, [400])).missing : undefined;
      if (opt.o) write(opt.o, gateMarkdown(report, result, { fontsMissing }));
      out({ pass: result.pass, blocking: result.blocking, advice: result.advice, fonts: report.fonts, fontsMissing, rules: result.rules.map((r) => ({ rule: r.rule, severity: r.severity, count: r.count })) });
      return result.pass ? 0 : 1;
    }
    case "report": {
      // The readiness report for the designer: by component and screen, in plain words.
      const report = JSON.parse(read(need(opt, "gate"))) as GateReport;
      const fontsMissing = opt.fonts ? (await googleFontFiles(report.fonts, [400])).missing : [];
      const fidelity = opt.fidelity ? (JSON.parse(read(opt.fidelity)) as PageFidelity[]) : [];
      const behaviour = opt.behaviour ? (JSON.parse(read(opt.behaviour)) as { name: string; result: BehaviourResult }[]) : [];
      if (opt.version && !(Number.isInteger(Number(opt.version)) && Number(opt.version) > 0)) throw new Error("--version is a whole number from 1: one more than the report it replaces.");
      const r = readinessReport(report, { title: opt.title, version: opt.version ? Number(opt.version) : undefined, fontsMissing, fidelity, behaviour, threshold: opt.threshold ? Number(opt.threshold) : DEFAULT_THRESHOLD });
      write(need(opt, "o"), r.markdown);
      out({ ready: r.ready, blocking: r.blocking, advice: r.advice, areas: r.areas, fidelityFailures: r.fidelityFailures, behaviourFailures: r.behaviourFailures, fontsMissing });
      return r.ready ? 0 : 1;
    }
    case "behaviour": {
      const r = await behaviourCheck(read(need(opt, "page")), {
        specimens: htmlFiles(need(opt, "specimens")).map(read),
        width: opt.width ? Number(opt.width) : undefined,
        height: opt.height ? Number(opt.height) : undefined,
        executablePath: opt.chromium,
      });
      if (opt.o) write(opt.o, JSON.stringify(r, null, 2));
      out(r);
      return r.pass ? 0 : 1;
    }
    case "convert": {
      // The entry gate: nothing from Figma is converted until the file passes it.
      const gate = JSON.parse(read(need(opt, "gate"))) as GateReport;
      const comp0 = opt.component ? JSON.parse(read(opt.component)) : null;
      const node = comp0?.id ?? /^figma:[^/]+\/(.+)$/.exec(opt.source ?? "")?.[1];
      if (!node) throw new Error("convert needs --source figma:<file>/<node> or --component, to check the node against the gate.");
      const verdict = evaluateGate(gate);
      if (!verdict.pass) throw new Error(`The Figma file has not passed the entry gate (${verdict.blocking} blocking). Fix them in Figma, run GATE again, then convert.`);
      if (!gateCovers(gate, node)) throw new Error(`The gate report does not cover ${node}. Run GATE with its page or frame.`);
      const map = opt.map ? JSON.parse(read(opt.map)) : null;
      const instances: Record<string, InstanceInfo> = {};
      for (const i of map?.instances ?? []) instances[i.id] = { component: i.component, variant: i.variant, props: i.props };
      // A specimen: each variant of the component set is an example of it.
      const comp = comp0;
      let definition: Record<string, unknown> | undefined;
      if (comp) {
        const rec = componentRecords(comp);
        Object.assign(instances, rec.instances);
        definition = {
          name: comp.name,
          id: rec.ds.id,
          ...(Object.keys(rec.ds.variantIds).length ? { variantIds: rec.ds.variantIds } : {}),
          type: opt.type ?? null,
          description: comp.description || null,
          variants: rec.variants,
          states: rec.states,
          status: opt.status ?? "proposed",
          figma: { node: comp.id, properties: comp.properties },
        };
      }
      // A screen: the design system's components (their COMPONENT data) mark the instances it draws.
      const components: Record<string, InstanceInfo> = {};
      const comps = listFiles(opt.components).map((f) => JSON.parse(read(f)));
      for (const c of comps) Object.assign(components, componentRecords(c).instances);
      const specimenPages = opt["specimen-pages"] ? htmlFiles(opt["specimen-pages"]).map(read) : null;
      const { html, report } = await convertFigma({
        code: read(need(opt, "code")),
        width: Number(need(opt, "width")),
        height: Number(need(opt, "height")),
        tokens: opt.tokens ? read(opt.tokens) : null,
        svgByNode: opt.svgs ? JSON.parse(read(opt.svgs)) : undefined,
        effects: opt.effects ? JSON.parse(read(opt.effects)) : undefined,
        bindings: opt.bindings ? read(opt.bindings) : undefined,
        instances,
        components: Object.keys(components).length ? components : undefined,
        figmaInstances: (map?.instances ?? []).filter((i: { main?: string }) => i.main).map((i: { id: string; main: string }) => ({ id: i.id, main: i.main })),
        links: map?.links ?? undefined,
        screens: opt.screens ? JSON.parse(read(opt.screens)) : undefined,
        fontCss: opt.fonts ? read(opt.fonts) : undefined,
        title: opt.title,
        source: opt.source,
        definition,
        variants: comp && comp.variants.length > 1 ? comp.variants : undefined,
        canvas: comp?.canvas ?? undefined,
        strokesOutOfLayout: comp?.strokesOutOfLayout ?? map?.strokesOutOfLayout ?? undefined,
        specimenRoots: specimenPages ? specimenRoots(specimenPages) : undefined,
        specimenTags: specimenPages ? specimenTags(specimenPages) : undefined,
        errorParts: specimenPages && !comp ? errorParts(comps, specimenPages) : undefined,
      });
      // A specimen draws each variant's error part too (hidden), as screens' instances do.
      const parts = comp ? errorParts([comp], [html]) : {};
      const defaults = Object.fromEntries(Object.entries(comp?.properties ?? {}).filter(([, p]) => (p as { type: string }).type === "TEXT").map(([k, p]) => [k, String((p as { default: unknown }).default ?? "")]));
      const withParts = parts && Object.keys(parts).length ? withErrorParts(html, parts, defaults) : { html, added: 0 };
      write(need(opt, "o"), withParts.html);
      out(withParts.added ? { ...report, errorParts: withParts.added } : report);
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
      // A measurement where a font or image failed to load is not a measurement of the page: never stamp it.
      if (opt.stamp && r.failed.length) throw new Error(`Not stamped: ${r.failed.length} request(s) failed while rendering (${r.failed.join(", ")}). Make them load and measure again.`);
      const stamped = opt.stamp ? stampFidelity(read(need(opt, "page")), result, { reference: opt.source }) : null;
      if (stamped) write(opt.stamp, stamped.html);
      out({ ...rest, fontsLoaded: r.fonts, failedRequests: r.failed, ...(stamped ? { match: stamped.stamp.match, uploadGate: { gate: FIDELITY_GATE, pass: stamped.stamp.match >= FIDELITY_GATE } } : {}) });
      return result.pass && !r.failed.length ? 0 : 1;
    }
    case "stamp": {
      const m = JSON.parse(read(need(opt, "fidelity"))) as { width: number; height: number; raw: { percent: number }; structural: { percent: number }; failedRequests?: string[] };
      if (m.failedRequests?.length) throw new Error(`Not stamped: ${m.failedRequests.length} request(s) failed in that measurement. Make them load and measure again.`);
      const r = stampFidelity(read(need(opt, "page")), m, { reference: opt.source });
      write(need(opt, "o"), r.html);
      const check = checkFidelity(r.html);
      out({ ...r.stamp, uploadGate: { gate: FIDELITY_GATE, pass: r.stamp.match >= FIDELITY_GATE, ...(check.reason ? { reason: check.reason } : {}) } });
      return r.stamp.match >= FIDELITY_GATE ? 0 : 1;
    }
    case "align": {
      const comp = opt.component ? JSON.parse(read(opt.component)) : null;
      const regions = comp && comp.variants.length > 1 ? comp.variants.map((v: { x: number; y: number; width: number; height: number }) => [v.x, v.y, v.width, v.height] as [number, number, number, number]) : undefined;
      const r = await alignText(read(need(opt, "page")), readFileSync(need(opt, "reference")), { executablePath: opt.chromium, regions });
      write(need(opt, "o"), r.html);
      out({ nudges: r.nudges.length, structuralBefore: r.before, structuralAfter: r.after, list: r.nudges });
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
    case "outline": {
      // What a semantic plan names: instances (@instance id), text, inputs, Wave attributes.
      const rows = outline(read(need(opt, "page")));
      if (opt.json) out(rows);
      else process.stdout.write(outlineText(rows) + "\n");
      return 0;
    }
    case "preflight": {
      // Offline, against local copies of the project's tokens, specimens and briefs. Post-it's
      // preflight_html (through send) is the one that counts; this is the fast loop before it.
      const html = read(need(opt, "page"));
      const components: CatalogueComponent[] = [];
      for (const f of (opt.specimens ?? "").split(",").filter(Boolean).flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((x) => x.endsWith(".html")).map((x) => join(p, x)) : [p]))) {
        const s = read(f);
        const def = parseSpecimen(s, parseMockup(s));
        if (def) components.push({ ...def, pageId: f, pagePath: f, version: 1 });
      }
      const r = preflightHtml(html, opt.name ?? "screen", {
        html,
        tokens: opt.tokens ? parseTokens(read(opt.tokens)) : undefined,
        assetBase: opt["asset-base"],
        catalogue: opt.specimens ? { components } : undefined,
        design: opt.design ? parseDesignMd(read(opt.design)).design : undefined,
        feature: opt.feature ? parseFeatureMd(read(opt.feature)).feature : undefined,
      });
      out({ pass: r.pass, counts: r.counts, issues: r.issues, open: r.open.map((q) => ({ qid: q.qid, label: q.label, question: q.question })) });
      return r.pass ? 0 : 1;
    }
    case "ids": {
      // Wave ids on every element that needs one; ids already there are kept. With --from (the
      // version published before), each Figma layer first takes back the id it had there.
      let html = read(need(opt, "page"));
      const carry = opt.from ? carryIds(html, read(opt.from)) : null;
      if (carry) html = carry.html;
      const r = assignIds(html);
      // Error states drawn in Figma point at their field once the field has its id.
      const states = linkStates(r.html);
      const tests = opt.screen ? assignTestIds(states.html, opt.screen) : null;
      write(opt.o ?? need(opt, "page"), tests ? tests.html : states.html);
      out({ carried: carry?.carried ?? 0, vanished: carry?.vanished ?? [], added: r.added, ...(tests ? { testIds: tests.added, testIdProblems: tests.problems.map((p) => p.message) } : {}), ...(states.linked ? { errorStates: states.linked } : {}), ...(states.unresolved.length ? { unresolvedStates: states.unresolved } : {}) });
      return tests?.problems.length ? 1 : 0;
    }
    case "bundle": {
      // Screens for wave_publish_flow: --screen "About you=about-you.html" (repeatable as a comma list).
      const screens = (opt.screen ?? "").split(",").filter(Boolean).map((pair) => {
        const [name, ...f] = pair.split("=");
        return { name: name.trim(), html: read(f.join("=").trim()) };
      });
      write(need(opt, "o"), JSON.stringify(screens));
      out({ screens: screens.map((s) => ({ name: s.name, bytes: s.html.length })) });
      return 0;
    }
    case "send": {
      // --link: a short-lived upload link from Post-it's wave_upload_link, which carries its
      // own credential, so nobody puts a token in the environment.
      const server = opt.link ?? opt.server ?? process.env.POSTIT_MCP_URL;
      const token = opt.link ? null : opt.token ?? process.env.POSTIT_TOKEN;
      if (!server || (!opt.link && !token)) throw new Error("Give --link (from Post-it's wave_upload_link), or set POSTIT_MCP_URL and POSTIT_TOKEN.");
      const params = (opt.args ? JSON.parse(opt.args) : {}) as Record<string, unknown>;
      for (const pair of (opt.file ?? "").split(",").filter(Boolean)) {
        const [k, ...f] = pair.split("=");
        params[k] = read(f.join("="));
      }
      for (const pair of (opt["json-file"] ?? "").split(",").filter(Boolean)) {
        const [k, ...f] = pair.split("=");
        params[k] = JSON.parse(read(f.join("=")));
      }
      const res = await fetch(server, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: need(opt, "tool"), arguments: params } }),
      });
      const body = (await res.json().catch(() => null)) as { result?: { content?: { type: string; text?: string }[]; isError?: boolean }; error?: { message: string } } | null;
      if (!res.ok || !body || body.error) {
        process.stderr.write(`Post-it answered ${res.status}: ${body?.error?.message ?? "no JSON"}\n`);
        return 1;
      }
      process.stdout.write((body.result?.content ?? []).map((c) => c.text ?? "").join("\n") + "\n");
      return body.result?.isError ? 1 : 0;
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
