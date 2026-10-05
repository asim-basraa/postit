import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { parseTokens, validateTokenDocument } from "@wave/spec";
import { buildDtcg, checksum, compareDocuments, compareImages, convertFigma, renderPage, script, VARIABLES, weightOf, type FigmaStyles } from "../src";

const fixture = (f: string) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url));
const listing = readFileSync(fixture("keel-variables.txt"), "utf8");
const styles = JSON.parse(readFileSync(fixture("keel-styles.json"), "utf8")) as FigmaStyles;
const CHROMIUM = "/opt/pw-browsers/chromium";

describe("checksum", () => {
  it("matches the value Figma's plugin computed for the Keel variables", () => {
    expect(listing.length).toBe(13001);
    expect(checksum(listing)).toBe(2821965228);
  });

  it("fills in a script's placeholders", () => {
    const s = script(VARIABLES, { PART: 2 });
    expect(s).toContain("const part = 2;");
    expect(s).not.toContain("{{");
  });
});

describe("tokens from Figma", () => {
  const r = buildDtcg(listing, styles, { description: "Keel" });
  const json = JSON.stringify(r.doc);

  it("builds a valid DTCG file with every variable, text style and shadow", () => {
    expect(validateTokenDocument(json).problems).toEqual([]);
    expect(r.count).toBe(329);
  });

  it("keeps a variable declared in two collections once, and converts a percentage opacity", () => {
    expect(r.notes.some((n) => n.startsWith("radius/full"))).toBe(true);
    expect(parseTokens(json)!.byPath.get("opacity.disabled")!.value).toBe("0.7");
  });

  it("resolves aliases to Figma's values", () => {
    const set = parseTokens(json)!;
    expect(set.byPath.get("color.text.primary")!.value).toBe("#111113");
    expect(set.byPath.get("space.4")!.normalised).toBe("len:16px");
    expect(set.byPath.get("shadow.selected-inset")!.value).toBe("inset 0rem 0rem 0rem 0.0625rem #111113");
    expect(set.byPath.get("typography.eyebrow")!.value).toBe('500 0.75rem "Geist Mono"');
    expect(set.byPath.get("motion.easing.standard")!.value).toBe("cubic-bezier(0.2, 0, 0, 1)");
  });

  it("names weights from Figma style names", () => {
    expect([weightOf("Regular"), weightOf("Medium"), weightOf("SemiBold"), weightOf("Semi Bold"), weightOf("ExtraBold")]).toEqual([400, 500, 600, 600, 800]);
  });
});

describe("convert", () => {
  const tokens = JSON.stringify(buildDtcg(listing, styles).doc);
  const code = `const assetPathPrefix = "https://www.figma.com/api/mcp/asset/x";
const imgIcon = \`\${assetPathPrefix}/a1.svg\`;
export default function F() {
  return (
    <div className="bg-[var(--color\\/background\\/canvas,white)] relative size-full" data-node-id="1:1" data-name="Frame">
      <p className="font-[family-name:var(--type\\/h1\\/font-family,'Geist:SemiBold')] text-[color:var(--color\\/text\\/primary,#111113)] text-[length:var(--type\\/h1\\/font-size,46px)] absolute left-[10px] top-[5px]" data-node-id="1:2">Hello</p>
      <div className="absolute bg-[var(--color\\/accent\\/default,#123456)] size-[16px]" data-node-id="1:3" data-name="Button"><img alt="" src={imgIcon} /></div>
      <div className="absolute size-[16px] text-[color:var(--brand\\/unknown,#abcdef)]" data-node-id="1:4" />
    </div>
  );
}`;

  it("renders the reference exactly and maps Figma variables to tokens", async () => {
    const { html, report } = await convertFigma({
      code,
      width: 200,
      height: 100,
      tokens,
      svgByNode: { "1:3": '<svg width="16" height="16"><path d="M0 0"/></svg>' },
      instances: { "1:3": { component: "Button", variant: { Type: "Primary", State: "Hover" }, props: { Label: "Go" } } },
      source: "figma:abc/1:1",
    });
    expect(html).toContain("var(--color-text-primary)");
    expect(html).toContain("--color-text-primary:#111113");
    expect(html).toContain("var(--type-h1-font-family)");
    expect(report.families).toEqual(["Geist"]);
    // The token says #2F4BDB; Figma drew #123456. Figma is the truth.
    expect(report.valueMismatch).toEqual([{ figma: "color/accent/default", figmaValue: "#123456", tokenValue: "#2F4BDB" }]);
    expect(html).toContain("#123456");
    expect(report.notInTokens).toEqual({ "brand/unknown": "#abcdef" });
    expect(html).toContain('data-wave-component="Button"');
    expect(html).toContain('data-wave-variant="primary"');
    expect(html).toContain('data-wave-state="hover"');
    expect(html).toContain('<svg width="16" height="16">');
    expect(html).not.toContain("<img");
    expect(html).toContain('data-figma-id="1:2"');
    expect(html).toContain('<meta name="figma-source" content="figma:abc/1:1">');
    expect(report.unresolvedAssets).toEqual([]);
  });

  it("marks a chosen state by its name, and a choice inside another component, as Keel's currency switch draws them", async () => {
    const seg = `export default function S() {
  return (
    <div className="flex" data-node-id="2:1" data-name="Segmented control">
      <div className="bg-white" data-node-id="2:2" data-name="Segment item"><p data-node-id="2:3">USD</p></div>
      <div className="bg-transparent" data-node-id="2:4" data-name="Segment item"><p data-node-id="2:5">EUR</p></div>
      <div data-node-id="2:6" data-name="Icon"><p data-node-id="2:7">x</p></div>
    </div>
  );
}`;
    const states = ["Selected", "Default"];
    const { html } = await convertFigma({
      code: seg,
      width: 200,
      height: 40,
      figmaInstances: [{ id: "9", main: "2:1" }, { id: "I9;1", main: "2:2" }, { id: "I9;2", main: "2:4" }, { id: "I9;3", main: "2:6" }],
      instances: { "2:1": { component: "Segmented control" } },
      components: {
        // Selected is the set's default look; it is still the chosen one.
        "2:2": { component: "Segment item", variant: { State: "Selected" }, baseState: "Selected", states },
        "2:4": { component: "Segment item", variant: { State: "Default" }, baseState: "Selected", states },
        "2:6": { component: "Icon", variant: { Name: "Plus" } },
      },
    });
    const tag = (id: string) => new RegExp(`<div[^>]*data-figma-instance="${id}"[^>]*>`).exec(html)?.[0] ?? "";
    expect(tag("I9;1")).toContain('data-wave-component="Segment item"');
    expect(tag("I9;1")).toContain('data-wave-state="selected"');
    expect(tag("I9;2")).toContain('data-wave-component="Segment item"');
    expect(tag("I9;2")).not.toContain("data-wave-state");
    // An icon inside a component stays its component's part.
    expect(tag("I9;3")).not.toContain("data-wave-component");
  });

  it("knows an instance Figma's code names by its own id, next to one named by its main component", async () => {
    const two = `export default function S() {
  return (
    <div className="flex" data-node-id="1:1">
      <div className="bg-white" data-node-id="9:1" data-name="Chip"><p data-node-id="I9:1;2:3">A</p></div>
      <div className="bg-white" data-node-id="2:2" data-name="Chip"><p data-node-id="2:3">B</p></div>
    </div>
  );
}`;
    const { html } = await convertFigma({
      code: two,
      width: 200,
      height: 40,
      figmaInstances: [{ id: "9:1", main: "2:2" }, { id: "9:2", main: "2:2" }],
      components: { "2:2": { component: "Chip", variant: { State: "Default" }, ds: "DS.chip" } },
      specimenRoots: { "2:2": "bg-white" },
    });
    // Each takes its component, its design-system id and its specimen's root classes from its main component.
    const tag = (id: string) => new RegExp(`<div[^>]*data-figma-instance="${id}"[^>]*>`).exec(html)?.[0] ?? "";
    for (const id of ["9:1", "9:2"]) {
      expect(tag(id)).toContain('data-wave-component="Chip"');
      expect(tag(id)).toContain('data-wave-ds="DS.chip"');
    }
    expect(html).toMatch(/data-figma-instance="9:1"[^>]*>(<[^>]*>)*A/);
    expect(html).toMatch(/data-figma-instance="9:2"[^>]*>(<[^>]*>)*B/);
  });

  it("writes a clickable instance as its specimen draws it, not as Figma's button", async () => {
    const chip = `export default function S() {
  return (
    <div className="flex" data-node-id="1:1">
      <button className="flex px-2" data-node-id="9:1"><p className="text-left whitespace-nowrap" data-node-id="I9:1;2:3">Product</p></button>
    </div>
  );
}`;
    const { html } = await convertFigma({
      code: chip,
      width: 200,
      height: 40,
      figmaInstances: [{ id: "9:1", main: "2:2" }],
      specimenTags: { "2:2": "div" },
    });
    expect(html).toMatch(/<div class="flex px-2" data-figma-instance="9:1"/);
    expect(html).toMatch(/<p class="whitespace-nowrap"/);
    expect(html).not.toContain("<button");
  });

  it("leaves a variant swap inside a component out of the screen links", async () => {
    const seg = `export default function S() {
  return (
    <div className="flex" data-node-id="1:1">
      <div data-node-id="2:4"><p data-node-id="2:5">EUR</p></div>
      <div data-node-id="2:6"><p data-node-id="2:7">Next</p></div>
    </div>
  );
}`;
    const { html } = await convertFigma({
      code: seg,
      width: 200,
      height: 40,
      screens: { "5:1": "budget" },
      links: [
        { from: "2:4", to: "4:2", toName: "Value=EUR", url: null, navigation: "CHANGE_TO" },
        { from: "2:6", to: "5:1", toName: "Budget", url: null, navigation: "NAVIGATE" },
      ],
    });
    expect(html).not.toContain("screen:valueeur");
    expect(html).toContain('data-wave-to="screen:budget"');
  });

  it("reports an asset it could not resolve", async () => {
    const { report } = await convertFigma({ code, width: 200, height: 100 });
    expect(report.unresolvedAssets).toEqual(["a1.svg"]);
  });
});

describe("fidelity", () => {
  const img = (w: number, h: number, paint: (x: number, y: number) => number) => {
    const p = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        const v = paint(x, y);
        const i = (y * w + x) * 4;
        p.data[i] = p.data[i + 1] = p.data[i + 2] = v;
        p.data[i + 3] = 255;
      }
    return PNG.sync.write(p);
  };
  const box = (dx: number) => (x: number, y: number) => (x >= 20 + dx && x < 60 + dx && y >= 20 && y < 60 ? 0 : 255);

  it("passes identical images", () => {
    const a = img(100, 80, box(0));
    const r = compareImages(a, a);
    expect(r.raw.pixels).toBe(0);
    expect(r.pass).toBe(true);
  });

  it("fails a box that moved", () => {
    const r = compareImages(img(100, 80, box(0)), img(100, 80, box(3)));
    expect(r.structural.percent).toBeGreaterThan(1);
    expect(r.pass).toBe(false);
    expect(r.structural.worst).not.toBeNull();
  });
});

describe("look lock", () => {
  const before = `<!doctype html><html><head><title>x</title></head><body><div data-figma-id="1:1" class="a"><p>Hello</p></div></body></html>`;

  it("allows Wave attributes, aria and Wave's head entries", () => {
    const after = `<!doctype html><html><head><title>x</title><meta name="wave:screen" content="s"><script type="application/wave+json" id="wave-resources">{}</script></head><body><div data-figma-id="1:1" class="a" data-wave-id="n_1" aria-label="Hi" role="group"><p data-wave-slug="hello">Hello</p></div></body></html>`;
    expect(compareDocuments(before, after)).toEqual([]);
  });

  it("refuses a changed class, tag or text", () => {
    const after = `<!doctype html><html><head><title>x</title></head><body><section data-figma-id="1:1" class="a"><p>Hello</p></section></body></html>`;
    expect(compareDocuments(before, after).map((c) => c.kind)).toEqual(["tag"]);
    const after2 = `<!doctype html><html><head><title>x</title></head><body><div data-figma-id="1:1" class="b"><p>Hi</p></div></body></html>`;
    expect(compareDocuments(before, after2).map((c) => c.kind)).toEqual(["attribute", "text"]);
  });
});

describe.skipIf(!existsSync(CHROMIUM))("the About you spike, end to end", () => {
  it("converts the Figma reference and matches Figma's render within the pass mark", async () => {
    const tokens = JSON.stringify(buildDtcg(listing, styles).doc);
    // Geist and Geist Mono are variable fonts (OFL); one file serves every weight.
    const face = (family: string, file: string) =>
      `@font-face{font-family:"${family}";font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${readFileSync(fixture(`fonts/${file}`)).toString("base64")}) format("woff2")}`;
    const { html, report } = await convertFigma({
      code: readFileSync(fixture("about-you.jsx"), "utf8"),
      width: 1440,
      height: 900,
      tokens,
      fontCss: face("Geist", "Geist.woff2") + face("Geist Mono", "GeistMono.woff2"),
    });
    // The arrow icon is the one asset this old frame cannot resolve here.
    expect(report.unresolvedAssets).toEqual(["bde91.svg"]);
    expect(report.mapped.length).toBeGreaterThan(30);
    expect(report.valueMismatch).toEqual([]);
    const shot = await renderPage(html, { width: 1440, height: 900 }, { executablePath: CHROMIUM });
    expect(shot.fonts.length).toBeGreaterThan(0);
    const r = compareImages(readFileSync(fixture("about-you.png")), shot.png);
    expect(r.pass).toBe(true);
  }, 60_000);
});
