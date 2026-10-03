import { describe, expect, it } from "vitest";
import { evaluateGate, gateMarkdown, inspectNodes, script, GATE, type GateFacts, type GateReport } from "../src";

const red = { r: 1, g: 0, b: 0 };
const facts: GateFacts = {
  vars: {
    "v:red": { name: "color/accent", type: "COLOR", scopes: ["ALL_SCOPES"], collection: "c1", values: { m1: { ...red, a: 1 } } },
    "v:grey": { name: "color/border/hover", type: "COLOR", scopes: ["ALL_SCOPES"], collection: "c1", values: { m1: { r: 0.54, g: 0.545, b: 0.56, a: 1 } } },
    "v:gap": { name: "space/4", type: "FLOAT", scopes: ["GAP"], collection: "c1", values: { m1: 16 } },
    "v:radius": { name: "radius/md", type: "FLOAT", scopes: ["CORNER_RADIUS"], collection: "c1", values: { m1: 8 } },
  },
  defaultModes: { c1: "m1" },
  textStyles: 2,
  mains: { "9:1": { name: "Button", remote: false, page: "0:ds" }, "9:2": { name: "Chip", remote: true, page: null } },
  componentNames: ["Button", "Chip"],
  dsPage: "0:ds",
};
const page = (id: string, children: unknown[]) => {
  const p = { id, name: id, type: "PAGE", children } as { children: { parent?: unknown }[] };
  const link = (n: { children?: { parent?: unknown }[] }) => n.children?.forEach((c) => ((c.parent = n), link(c as never)));
  link(p);
  return p;
};
const solid = (color = red, v?: string) => ({ type: "SOLID", color, opacity: 1, ...(v ? { boundVariables: { color: { id: v } } } : {}) });
const rules = (hits: { rule: string }[]) => [...new Set(hits.map((h) => h.rule))].sort();

describe("entry gate rules", () => {
  it("passes a frame drawn from variables, text styles and auto layout", () => {
    const screen = page("0:s", [
      {
        id: "1:1", name: "Screen", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 16, boundVariables: { itemSpacing: { id: "v:gap" } }, fills: [solid(red, "v:red")],
        children: [
          { id: "1:2", name: "Title", type: "TEXT", textStyleId: "S:1", fontName: { family: "Geist", style: "Medium" }, fontSize: 24, fills: [solid(red, "v:red")] },
          { id: "9:1", name: "Button", type: "INSTANCE", reactions: [{}], overrides: [{ id: "9:1", overriddenFields: ["characters", "width"] }] },
        ],
      },
    ]);
    expect(inspectNodes([screen], facts)).toEqual({ hits: [], fonts: ["Geist"], covers: ["1:1"] });
  });

  it("finds what Wave cannot take as it is", () => {
    const screen = page("0:s", [
      {
        id: "1:1", name: "Screen", type: "FRAME", layoutMode: "NONE", fills: [solid({ r: 1, g: 1, b: 1 })], cornerRadius: 4,
        children: [
          { id: "1:2", name: "Title", type: "TEXT", textStyleId: "", fontName: { family: "Inter", style: "Bold" }, fontSize: 20, fills: [solid(red, "v:red")] },
          { id: "9:1", name: "Button", type: "INSTANCE", overrides: [{ id: "9:3", overriddenFields: ["fills"] }] },
          { id: "9:2", name: "Chip", type: "INSTANCE", reactions: [] },
          { id: "1:3", name: "Button", type: "FRAME", layoutMode: "HORIZONTAL", itemSpacing: 12, children: [] },
          { id: "1:4", name: "Hover ring", type: "RECTANGLE", x: 173.5, y: 2, width: 1, height: 20, strokes: [solid({ r: 0, g: 0, b: 0 }, "v:grey")], strokeWeight: 1 },
          { id: "1:5", name: "Group 3", type: "GROUP", children: [{ id: "1:6", name: "a", type: "TEXT", textStyleId: "S:1", fills: [] }, { id: "1:7", name: "b", type: "TEXT", textStyleId: "S:1", fills: [] }] },
        ],
      },
    ]);
    const { hits, fonts } = inspectNodes([screen], facts);
    expect(fonts).toEqual(["Inter"]);
    expect(rules(hits)).toEqual([
      "color.stale", "color.unbound", "geometry.subpixel", "instance.detached", "instance.override", "instance.remote", "layer.name", "layout.group", "layout.none", "proto.unlinked", "radius.unbound", "spacing.unbound", "text.style",
    ]);
    expect(hits.find((h) => h.rule === "color.stale")?.detail).toBe("stroke draws #000000, its variable color/border/hover is #8A8B8F");
    expect(hits.find((h) => h.rule === "instance.override")).toMatchObject({ detail: "Button: fills", in: "Screen" });
  });

  it("checks only components on the design-system page, and asks for their descriptions", () => {
    const ds = page("0:ds", [
      { id: "2:1", name: "Note", type: "TEXT", textStyleId: "", fills: [solid({ r: 0, g: 0, b: 0 })] },
      { id: "2:2", name: "Chip", type: "COMPONENT_SET", description: "", strokes: [solid({ r: 0.59, g: 0.28, b: 1 })], children: [{ id: "2:3", name: "State=Default", type: "COMPONENT", layoutMode: "HORIZONTAL", itemSpacing: 0, fills: [solid(red, "v:red")], children: [] }] },
    ]);
    const { hits } = inspectNodes([ds], facts);
    expect(hits.map((h) => [h.rule, h.node])).toEqual([["component.description", "2:2"]]);
  });
});

describe("entry gate: what Figma binds per corner and side, and what a component owns", () => {
  const corners = { topLeftRadius: { id: "v:radius" }, topRightRadius: { id: "v:radius" }, bottomLeftRadius: { id: "v:radius" }, bottomRightRadius: { id: "v:radius" } };
  it("reads radius bindings per corner", () => {
    const ds = page("0:ds", [
      { id: "3:1", name: "Card", type: "COMPONENT", description: "A card.", layoutMode: "VERTICAL", cornerRadius: 8, boundVariables: corners, children: [] },
      { id: "3:2", name: "Tag", type: "COMPONENT", description: "A tag.", layoutMode: "VERTICAL", cornerRadius: 8, boundVariables: { topLeftRadius: { id: "v:radius" } }, children: [] },
    ]);
    expect(inspectNodes([ds], facts).hits.map((h) => [h.rule, h.node, h.detail])).toEqual([["radius.unbound", "3:2", "radius 8"]]);
  });

  it("leaves a component's own parts, toggled layers and variable recolours alone", () => {
    const icon = { id: "I1;5:1", name: "Path", type: "VECTOR", strokes: [solid(red, "v:red")] };
    const ds = page("0:ds", [
      {
        id: "4:1", name: "Select", type: "COMPONENT_SET", description: "Pick one.", cornerRadius: 12, children: [
          {
            id: "4:2", name: "State=Default", type: "COMPONENT", layoutMode: "VERTICAL", children: [
              { id: "4:3", name: "Select", type: "FRAME", layoutMode: "HORIZONTAL", children: [] },
              { id: "4:4", name: "Helper", type: "TEXT", visible: false, componentPropertyReferences: { visible: "Show helper#1:2" } },
              { id: "9:1", name: "Chevron", type: "INSTANCE", overrides: [{ id: "I1;5:1", overriddenFields: ["strokes"] }], children: [icon] },
            ],
          },
        ],
      },
    ]);
    expect(inspectNodes([ds], facts).hits.map((h) => h.rule)).toEqual(["instance.recolor"]);
  });
});

describe("gate report", () => {
  const report: GateReport = {
    file: "KEY",
    pages: ["0:s"],
    covers: ["1:1"],
    fonts: ["Geist"],
    total: 3,
    hits: { "layer.name": { count: 1, nodes: [["1:5", "Group 3"]] }, "color.unbound": { count: 2, nodes: [["1:1", "Screen", "fill #FFFFFF", "Lead form"]] } },
  };

  it("blocks on blocking rules only, and links every layer", () => {
    const r = evaluateGate(report);
    expect([r.pass, r.blocking, r.advice]).toEqual([false, 2, 1]);
    expect(r.rules[0].rule).toBe("color.unbound");
    const md = gateMarkdown(report, r);
    expect(md).toContain("| Lead form | [Screen](https://www.figma.com/design/KEY/?node-id=1-1) `1:1` | fill #FFFFFF |");
    expect(md).toContain("| ... and 1 more | | |");
    expect(evaluateGate({ ...report, hits: { "layer.name": report.hits["layer.name"] } }).pass).toBe(true);
  });

  it("is a script use_figma can run: the rules travel as their own source", () => {
    const src = script(GATE, { PAGE: "0:ds", IDS: ["0:ds", "1:86"] });
    expect(src).toContain('const ids = ["0:ds","1:86"]');
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    expect(() => new AsyncFunction("figma", src)).not.toThrow();
  });
});

describe("ids across conversions", () => {
  it("gives each Figma layer back the id it had, inserted controls through their layer", async () => {
    const { carryIds } = await import("../src");
    const before = `<!doctype html><html><body><div data-figma-id="1:1" data-wave-id="n_card01"><label data-figma-id="1:2" data-wave-id="n_lbl001"><input data-wave-insert="" data-wave-id="n_inp001"></label><p data-figma-id="1:9" data-wave-id="n_gone01"></p></div></body></html>`;
    const after = `<!doctype html><html><body><div data-figma-id="1:1" class="flex"><label data-figma-id="1:2"><input data-wave-insert=""></label><span data-figma-id="1:3"></span></div></body></html>`;
    const r = carryIds(after, before);
    expect(r.carried).toBe(3);
    expect(r.vanished).toEqual(["n_gone01"]);
    expect(r.html).toContain('<div data-figma-id="1:1" class="flex" data-wave-id="n_card01">');
    expect(r.html).toContain('<input data-wave-insert="" data-wave-id="n_inp001">');
    expect(r.html).toContain('<span data-figma-id="1:3"></span>');
  });
});
