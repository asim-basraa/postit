import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { alignText, applyUpgrade, bindVariables, boxShadow, buildDtcg, compareDocuments, compareImages, convertFigma, renderPage, revertUpgrade, type FigmaStyles, type UpgradeOp } from "../src";

const fixture = (f: string) => fileURLToPath(new URL(`./fixtures/${f}`, import.meta.url));
const read = (f: string) => readFileSync(fixture(f), "utf8");
const CHROMIUM = "/opt/pw-browsers/chromium";
const tokens = JSON.stringify(buildDtcg(read("keel-variables.txt"), JSON.parse(read("keel-styles.json")) as FigmaStyles).doc);
const face = (family: string, file: string) =>
  `@font-face{font-family:"${family}";font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${readFileSync(fixture(`fonts/${file}`)).toString("base64")}) format("woff2")}`;
const fontCss = face("Geist", "Geist.woff2") + face("Geist Mono", "GeistMono.woff2");
const effects = JSON.parse(read("effects.json"));
const bindings = read("bindings.txt");

async function specimen(name: string, svgs?: Record<string, string>) {
  const comp = JSON.parse(read(`${name}/component.json`));
  const png = readFileSync(fixture(`${name}/figma.png`));
  const size = { width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
  const { html, report } = await convertFigma({ code: read(`${name}/code.tsx.txt`), ...size, tokens, fontCss, effects, bindings, svgByNode: svgs, variants: comp.variants, canvas: comp.canvas });
  const regions = comp.variants.map((v: { x: number; y: number; width: number; height: number }) => [v.x, v.y, v.width, v.height]);
  return { comp, png, size, html, report, regions };
}

describe("shadows from Figma's effects", () => {
  it("writes a spread ring the reference code drops", () => {
    expect(boxShadow(effects["28:217"])).toBe("0px 0px 0px var(--shadow\\/spread\\/ring,3px) var(--color\\/accent\\/ring-subtle,rgba(47,75,219,0.18))");
  });
});

describe("variables Figma's code writes as plain values", () => {
  const bound = { width: { name: "size/icon-md", value: "16" }, height: { name: "size/icon-md", value: "16" } };
  it("puts the variable back where the value is the variable's", () => {
    expect(bindVariables("relative shrink-0 size-[16px]", bound)).toBe("relative shrink-0 size-[var(--size\\/icon-md,16px)]");
    expect(bindVariables("h-[48px] w-full", { height: { name: "size/control-input", value: "48" } })).toBe("h-[var(--size\\/control-input,48px)] w-full");
    expect(bindVariables("h-[12px] w-px", { width: { name: "size/hairline", value: "1" }, height: { name: "size/divider-sm", value: "12" } })).toBe("h-[var(--size\\/divider-sm,12px)] w-[var(--size\\/hairline,1px)]");
  });

  it("puts the type variables back on a text Figma wrote out (an underlined link)", () => {
    const caption = { fontSize: { name: "type/caption/font-size", value: "13" }, lineHeight: { name: "type/caption/line-height", value: "19.5" }, fontFamily: { name: "type/caption/font-family", value: "Geist" }, fontWeight: { name: "type/caption/font-weight", value: "400" } };
    expect(bindVariables("font-['Geist:Regular'] font-normal leading-[19.5px] text-[13px] underline", caption)).toBe(
      "font-[family-name:var(--type\\/caption\\/font-family,'Geist:Regular')] font-[var(--type\\/caption\\/font-weight,400)] leading-[var(--type\\/caption\\/line-height,19.5px)] text-[length:var(--type\\/caption\\/font-size,13px)] underline",
    );
  });

  it("leaves a class alone when the value is not the variable's", () => {
    expect(bindVariables("size-[14px]", bound)).toBe("size-[14px]");
    expect(bindVariables("size-[16px]", { width: bound.width })).toBe("w-[var(--size\\/icon-md,16px)] h-[16px]");
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

  it("changes an instance once when Figma's code names it by its own id", () => {
    const chip = `<!doctype html><html><head></head><body><label data-figma-instance="9:1" data-figma-id="9:1" class="flex"><p data-figma-id="I9:1;2:3">Product</p></label></body></html>`;
    const r = applyUpgrade(chip, [{ op: "control", id: "@9:1", kind: "radio", name: "role", value: "Product", checked: false }]);
    expect(r.applied).toEqual([{ op: "control", id: "@9:1", count: 1 }]);
    expect(r.html.match(/<input/g)?.length).toBe(1);
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
  // The strict check: every value a token, as Wave's preflight asks of a specimen.
  const literals = (html: string) => [...html.matchAll(/(?<![\w-])-?\d*\.?\d+px(?![\w-])/g)].map((m) => m[0]).filter((v) => v !== "0px");
  // Declarations only: a selector is Tailwind's class name, which spells the value it replaced.
  const css = (html: string) => [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).filter((c) => !c.includes("@font-face")).join("\n").replace(/:root\{[^}]*\}/g, "").replace(/[^{};]*\{/g, "{");

  it("Option card: matches Figma, and every size is a token", async () => {
    const s = await specimen("option-card", JSON.parse(read("option-card/svgs.json")));
    expect(s.report.unresolvedNodes).toEqual([]);
    expect(s.report.shadows).toBe(0);
    const a = await alignText(s.html, s.png, { executablePath: CHROMIUM, regions: s.regions });
    expect(a.after).toBe(0);
    expect(literals(css(a.html).replace(/var\(--[^,()]+,[^()]*\)/g, ""))).toEqual([]);
  }, 90_000);

  it("Checkbox: the 1.5px stroke as Figma has it, and the vector to export", async () => {
    const bare = await specimen("checkbox");
    expect(bare.report.unresolvedNodes).toEqual(["28:284"]);
    const s = await specimen("checkbox", JSON.parse(read("option-card/svgs.json")));
    const a = await alignText(s.html, s.png, { executablePath: CHROMIUM, regions: s.regions });
    expect(a.html).not.toContain("box-shadow");
    const shot = await renderPage(a.html, s.size, { executablePath: CHROMIUM });
    expect(compareImages(s.png, shot.png, { regions: s.regions }).structural.percent).toBe(0);
  }, 90_000);

  it("Text field: text boxes on Figma's pixel grid, focus rings as shadow tokens, and the upgrade changes no pixel", async () => {
    const s = await specimen("text-field");
    expect(s.html).toContain("round(up,size,var(--dimension-1))");
    expect(s.html).toContain("box-shadow:var(--shadow-focus-ring-field)");
    expect(s.html).toContain("box-shadow:var(--shadow-focus-ring-error)");
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
