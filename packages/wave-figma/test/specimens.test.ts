import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { alignText, applyUpgrade, boxShadow, buildDtcg, compareDocuments, compareImages, convertFigma, renderPage, revertUpgrade, strokeWidth, type FigmaStyles, type UpgradeOp } from "../src";

const fixture = (f: string) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url));
const read = (f: string) => readFileSync(fixture(f), "utf8");
const CHROMIUM = "/opt/pw-browsers/chromium";
const tokens = JSON.stringify(buildDtcg(read("keel-variables.txt"), JSON.parse(read("keel-styles.json")) as FigmaStyles).doc);
const face = (family: string, file: string) =>
  `@font-face{font-family:"${family}";font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${readFileSync(fixture(`fonts/${file}`)).toString("base64")}) format("woff2")}`;
const fontCss = face("Geist", "Geist.woff2") + face("Geist Mono", "GeistMono.woff2");
const effects = JSON.parse(read("effects.json"));

async function specimen(name: string, svgs?: Record<string, string>) {
  const comp = JSON.parse(read(`${name}/component.json`));
  const png = readFileSync(fixture(`${name}/figma.png`));
  const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const { html, report } = await convertFigma({ code: read(`${name}/code.tsx.txt`), ...size, tokens, fontCss, effects, svgByNode: svgs, variants: comp.variants });
  const regions = comp.variants.map((v: { x: number; y: number; width: number; height: number }) => [v.x, v.y, v.width, v.height]);
  return { comp, png, size, html, report, regions };
}

describe("shadows from Figma's effects", () => {
  it("writes a spread ring the reference code drops", () => {
    expect(boxShadow(effects["28:217"])).toBe("0px 0px 0px var(--shadow\\/spread\\/ring,3px) var(--color\\/accent\\/ring-subtle,rgba(47,75,219,0.18))");
  });

  it("takes an inside stroke off an inner shadow, as Figma draws the stroke over it", () => {
    expect(boxShadow(effects["28:302"], 1)).toBe("inset 0px 0px 0px calc(var(--shadow\\/spread\\/hairline,1px) - 1px) var(--color\\/border\\/selected,rgba(17,17,19,1))");
  });

  it("reads a stroke width from border classes", () => {
    expect(strokeWidth("border-[length:var(--border-width\\/emphasis,1.5px)] border-solid")).toBe(1.5);
    expect(strokeWidth("border border-solid")).toBe(1);
    expect(strokeWidth("border-b border-solid")).toBe(0);
  });
});

describe("semantic upgrade", () => {
  const page = `<!doctype html><html><head><style>p{margin:0}</style></head><body><div data-figma-id="1:1" class="flex"><p data-figma-id="1:2" class="a">Full name</p><p data-figma-id="1:3" class="b">Maya</p></div></body></html>`;
  const ops: UpgradeOp[] = [
    { op: "tag", id: "1:1", tag: "label" },
    { op: "input", id: "1:3", text: "placeholder", attrs: { name: "fullName", autocomplete: "name" }, filledColor: "var(--color-text-primary)" },
  ];

  it("makes real elements and records how to undo them", () => {
    const r = applyUpgrade(page, ops);
    expect(r.missing).toEqual([]);
    expect(r.html).toContain('<label data-figma-id="1:1" class="flex" data-wave-tag="div">');
    expect(r.html).toMatch(/<input data-figma-id="1:3" class="b" data-wave-from="p" data-wave-text="placeholder" type="text" placeholder="Maya" name="fullName" autocomplete="name"/);
    expect(r.html).toContain('input[data-figma-id="1:3"]:not(:placeholder-shown){color:var(--color-text-primary)}');
    expect(compareDocuments(page, revertUpgrade(r.html))).toEqual([]);
  });

  it("refuses an attribute that could change how it looks", () => {
    expect(() => applyUpgrade(page, [{ op: "attrs", id: "1:1", attrs: { class: "x" } }])).toThrow(/could change how it looks/);
    expect(() => applyUpgrade(page, [{ op: "tag", id: "1:1", tag: "img" }])).toThrow(/not one the upgrade makes/);
  });

  it("reports an id it could not find", () => {
    expect(applyUpgrade(page, [{ op: "tag", id: "9:9", tag: "button" }]).missing).toEqual(["9:9"]);
  });

  it("puts a hidden native control inside a label", () => {
    const r = applyUpgrade(page, [{ op: "control", id: "1:1", kind: "checkbox", name: "terms", checked: true }]);
    expect(r.html).toContain('<label data-figma-id="1:1" class="flex" data-wave-tag="div"><input type="checkbox" name="terms" data-wave-insert="" checked="">');
    expect(compareDocuments(page, revertUpgrade(r.html))).toEqual([]);
  });
});

describe.skipIf(!existsSync(CHROMIUM))("Keel specimens, end to end", () => {
  it("Option card: inner shadow and selected states match Figma", async () => {
    const s = await specimen("option-card", JSON.parse(read("option-card/svgs.json")));
    expect(s.report.unresolvedNodes).toEqual([]);
    expect(s.report.shadows).toBe(2);
    const a = await alignText(s.html, s.png, { executablePath: CHROMIUM, regions: s.regions });
    expect(a.after).toBeLessThanOrEqual(0.25);
  }, 90_000);

  it("Checkbox: draws the 1.5px stroke Chrome rounds down, and reports the vector to export", async () => {
    const bare = await specimen("checkbox");
    expect(bare.report.unresolvedNodes).toEqual(["28:284"]);
    const s = await specimen("checkbox", JSON.parse(read("option-card/svgs.json")));
    const a = await alignText(s.html, s.png, { executablePath: CHROMIUM, regions: s.regions });
    expect(a.strokes.map((x) => [x.id, x.width, x.drawn])).toEqual([
      ["28:281", 1.5, 1],
      ["28:282", 1.5, 1],
      ["28:283", 1.5, 1],
    ]);
    // Hover is left out: Figma's file draws a stale black stroke there (its variable says #8a8b8f).
    const regions = s.comp.variants.filter((v: { variant: Record<string, string> }) => v.variant.State !== "Hover").map((v: { x: number; y: number; width: number; height: number }) => [v.x, v.y, v.width, v.height]);
    const shot = await renderPage(a.html, s.size, { executablePath: CHROMIUM });
    expect(compareImages(s.png, shot.png, { regions }).structural.percent).toBe(0);
  }, 90_000);

  it("Text field: the upgrade to real inputs changes no pixel", async () => {
    const s = await specimen("text-field");
    const a = await alignText(s.html, s.png, { executablePath: CHROMIUM, regions: s.regions });
    expect(a.after).toBeLessThanOrEqual(0.25);
    const up = applyUpgrade(a.html, JSON.parse(read("text-field/plan.json")));
    expect(up.missing).toEqual([]);
    expect(compareDocuments(a.html, revertUpgrade(up.html))).toEqual([]);
    const before = await renderPage(a.html, s.size, { executablePath: CHROMIUM });
    const after = await renderPage(up.html, s.size, { executablePath: CHROMIUM });
    expect(compareImages(before.png, after.png).raw.pixels).toBe(0);
  }, 90_000);
});
