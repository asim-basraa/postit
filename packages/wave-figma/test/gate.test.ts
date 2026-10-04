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
    expect(inspectNodes([screen], facts)).toEqual({ hits: [], fonts: ["Geist"], covers: ["1:1"], areas: { Screen: "1:1" } });
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

  it("takes a layer hidden in one variant and shown by another as that variant's look", () => {
    const text = (id: string, visible: boolean) => ({ id, name: "Helper", type: "TEXT", visible, textStyleId: "S:1", fills: [] });
    const variant = (id: string, name: string, kids: unknown[]) => ({ id, name, type: "COMPONENT", layoutMode: "VERTICAL", itemSpacing: 0, children: kids });
    const ds = page("0:ds", [
      {
        id: "3:1", name: "Text field", type: "COMPONENT_SET", description: "A field.", layoutMode: "VERTICAL", itemSpacing: 0,
        children: [variant("3:2", "State=Default", [text("3:3", false)]), variant("3:4", "State=Error", [text("3:5", true)])],
      },
      { id: "3:6", name: "Select", type: "COMPONENT_SET", description: "A select.", layoutMode: "VERTICAL", itemSpacing: 0, children: [variant("3:7", "State=Default", [text("3:8", false)])] },
    ]);
    const { hits } = inspectNodes([ds], facts);
    expect(hits.filter((h) => h.rule === "layer.hidden").map((h) => h.node)).toEqual(["3:8"]);
  });

  it("checks only components on the design-system page, and asks for their descriptions", () => {
    const ds = page("0:ds", [
      { id: "2:1", name: "Note", type: "TEXT", textStyleId: "", fills: [solid({ r: 0, g: 0, b: 0 })] },
      { id: "2:2", name: "Chip", type: "COMPONENT_SET", description: "", strokes: [solid({ r: 0.59, g: 0.28, b: 1 })], children: [{ id: "2:3", name: "State=Default", type: "COMPONENT", layoutMode: "HORIZONTAL", itemSpacing: 0, fills: [solid(red, "v:red")], children: [] }] },
    ]);
    const { hits } = inspectNodes([ds], facts);
    // A chip with no chosen look drawn cannot show being chosen in a prototype.
    expect(hits.map((h) => [h.rule, h.node])).toEqual([["component.description", "2:2"], ["choice.state", "2:2"]]);
  });
});

describe("entry gate: what a prototype needs drawn", () => {
  const variant = (id: string, name: string, kids: unknown[] = []) => ({ id, name, type: "COMPONENT", layoutMode: "VERTICAL", itemSpacing: 0, variantProperties: Object.fromEntries(name.split(", ").map((p) => p.split("="))), children: kids });
  const set = (id: string, name: string, states: string[], kids: unknown[]) => ({ id, name, type: "COMPONENT_SET", description: "x", layoutMode: "VERTICAL", itemSpacing: 0, componentPropertyDefinitions: { State: { type: "VARIANT", variantOptions: states } }, children: kids });
  const optionFacts: GateFacts = { ...facts, mains: { ...facts.mains, "8:1": { name: "Option", remote: false, page: "0:ds", states: ["Default", "Selected"] }, "8:2": { name: "Option", remote: false, page: "0:ds", states: ["Default", "Selected"] }, "8:3": { name: "Label", remote: false, page: "0:ds", states: [] } } };
  const found = (root: unknown, f = optionFacts) => inspectNodes([root], f).hits.filter((h) => ["choice.state", "select.open", "select.menu"].includes(h.rule)).map((h) => [h.rule, h.node]);

  it("takes a choice whose chosen look is the default, as Keel's Segment item draws it", () => {
    expect(found(page("0:ds", [set("4:1", "Segment item", ["Selected", "Default"], [variant("4:2", "State=Selected"), variant("4:3", "State=Default")])]))).toEqual([]);
    expect(found(page("0:ds", [set("4:1", "Radio", ["Unchecked", "Hover", "Checked"], [variant("4:2", "State=Unchecked")])]))).toEqual([]);
  });

  it("refuses a choice that cannot show being chosen", () => {
    expect(found(page("0:ds", [set("4:1", "Chip", ["Default", "Hover"], [variant("4:2", "State=Default")])]))).toEqual([["choice.state", "4:1"]]);
    expect(found(page("0:ds", [set("4:1", "Toggle", ["A", "B"], [variant("4:2", "State=A")])]))).toEqual([["choice.state", "4:1"]]);
    // A group of choices is not itself a choice.
    expect(found(page("0:ds", [set("4:1", "Chip group", [], [variant("4:2", "Size=Default")])]))).toEqual([]);
  });

  it("takes a select's option row as a choice, not a select, as Keel's Select option is named", () => {
    expect(found(page("0:ds", [set("6:1", "Select option", ["Default", "Hover", "Selected"], [variant("6:2", "State=Default")])]))).toEqual([]);
    expect(found(page("0:ds", [set("6:1", "Select option", ["Default", "Hover"], [variant("6:2", "State=Default")])]))).toEqual([["choice.state", "6:1"]]);
  });

  it("refuses a select with no open state, as Keel's Select was drawn", () => {
    const keel = set("5:1", "Select", ["Default", "Filled", "Focus", "Disabled"], [variant("5:2", "State=Default"), variant("5:3", "State=Filled")]);
    expect(found(page("0:ds", [keel]))).toEqual([["select.open", "5:1"]]);
  });

  it("asks the open state for a menu of option instances with a chosen look", () => {
    const row = (id: string) => ({ id, name: "Option", type: "INSTANCE" });
    const menu = (kids: unknown[]) => ({ id: "5:9", name: "Menu", type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 0, children: kids });
    const open = (kids: unknown[]) => set("5:1", "Select", ["Default", "Open"], [variant("5:2", "State=Default"), variant("5:3", "State=Open", kids)]);
    expect(found(page("0:ds", [open([menu([row("8:1"), row("8:2")])])]))).toEqual([]);
    expect(found(page("0:ds", [open([])]))).toEqual([["select.menu", "5:3"]]);
    expect(found(page("0:ds", [open([menu([row("8:1")])])]))).toEqual([["select.menu", "5:9"]]);
    expect(found(page("0:ds", [open([menu([row("8:1"), { id: "8:3", name: "Label", type: "INSTANCE" }])])]))).toEqual([["select.menu", "5:9"]]);
  });

  it("checks a screen's instances by what their component set has, when the set is not in the run", () => {
    const f: GateFacts = { ...facts, mains: { "9:5": { name: "Select", remote: false, page: "0:ds", states: ["Default", "Filled"] }, "9:6": { name: "Segment item", remote: false, page: "0:ds", states: ["Selected", "Default"] } } };
    const screen = page("0:s", [{ id: "1:1", name: "Screen", type: "FRAME", layoutMode: "VERTICAL", children: [{ id: "9:5", name: "Select", type: "INSTANCE" }, { id: "9:6", name: "Segment item", type: "INSTANCE" }] }]);
    expect(found(screen, f)).toEqual([["select.open", "9:5"]]);
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
        id: "4:1", name: "Field", type: "COMPONENT_SET", description: "Pick one.", cornerRadius: 12, children: [
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

  it("takes a variant property bound to a variable as a component property, not a restyle", () => {
    const f: GateFacts = { ...facts, mains: { ...facts.mains, "9:3": { name: "Chip", remote: false, page: "0:ds", propertyBindings: ["9:3"] }, "9:4": { name: "Chip", remote: false, page: "0:ds", propertyBindings: [] } } };
    const s = page("0:s", [
      {
        id: "1:1", name: "Screen", type: "FRAME", layoutMode: "VERTICAL", children: [
          { id: "9:3", name: "Chip", type: "INSTANCE", overrides: [{ id: "9:3", overriddenFields: ["boundVariables", "reactions"] }], children: [] },
          { id: "9:4", name: "Chip", type: "INSTANCE", overrides: [{ id: "9:4", overriddenFields: ["boundVariables"] }], children: [] },
        ],
      },
    ]);
    expect(inspectNodes([s], f).hits.filter((h) => h.rule.startsWith("instance.")).map((h) => [h.rule, h.node])).toEqual([["instance.override", "9:4"]]);
  });
});

describe("entry gate: sizes, positions and instances become pixels unless they are tokens", () => {
  const sized: GateFacts = { ...facts, vars: { ...facts.vars, "v:w": { name: "size/field", type: "FLOAT", scopes: ["WIDTH_HEIGHT"], collection: "c1", values: { m1: 320 } } }, mains: { ...facts.mains, "9:5": { name: "Text field", remote: false, page: "0:ds", width: 320, height: 74, hugW: false, hugH: true }, "9:6": { name: "Chip", remote: false, page: "0:ds", width: 90, height: 44, hugW: true, hugH: true }, "9:7": { name: "Chip", remote: false, page: "0:ds", width: 90, height: 44, hugW: true, hugH: true }, "9:8": { name: "Chip", remote: false, page: "0:ds", width: 90, height: 44, hugW: true, hugH: true, bools: { "Show icon#1:2": true } }, "9:9": { name: "Chip", remote: false, page: "0:ds", width: 90, height: 44, hugW: true, hugH: true, bools: { "Show icon#1:2": true } } } };
  const screen = (kids: unknown[]) => page("0:s", [{ id: "1:1", name: "Screen", type: "FRAME", layoutMode: "VERTICAL", layoutSizingHorizontal: "FIXED", layoutSizingVertical: "FIXED", width: 1440, height: 900, children: kids }]);

  it("asks for a size variable, Hug or Fill; the screen's own frame is the device", () => {
    const { hits } = inspectNodes([screen([
      { id: "2:1", name: "Column", type: "FRAME", layoutMode: "VERTICAL", layoutSizingHorizontal: "FIXED", layoutSizingVertical: "HUG", width: 430, height: 200, children: [] },
      { id: "2:2", name: "Field slot", type: "FRAME", layoutMode: "VERTICAL", layoutSizingHorizontal: "FIXED", layoutSizingVertical: "HUG", width: 320, height: 74, boundVariables: { width: { id: "v:w" } }, children: [] },
      { id: "2:3", name: "Row", type: "FRAME", layoutMode: "HORIZONTAL", layoutSizingHorizontal: "FILL", layoutSizingVertical: "HUG", width: 1440, height: 44, children: [] },
      { id: "2:4", name: "Intro", type: "TEXT", textStyleId: "S:1", textAutoResize: "HEIGHT", layoutSizingHorizontal: "FIXED", layoutSizingVertical: "HUG", width: 408, height: 54, fills: [] },
    ])], sized);
    expect(hits.map((h) => [h.rule, h.node, h.detail])).toEqual([["size.fixed", "2:1", "width 430"], ["text.fixed", "2:4", "width 408"]]);
  });

  it("keeps instances at their component's size and shape, and places nothing at an offset", () => {
    const { hits } = inspectNodes([screen([
      { id: "9:5", name: "Text field", type: "INSTANCE", layoutSizingHorizontal: "FIXED", layoutSizingVertical: "HUG", width: 602, height: 74 },
      { id: "9:6", name: "Chip", type: "INSTANCE", layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG", width: 140, height: 44 },
      { id: "9:7", name: "Chip", type: "INSTANCE", layoutSizingHorizontal: "HUG", layoutSizingVertical: "FIXED", width: 140, height: 64 },
      { id: "9:8", name: "Chip", type: "INSTANCE", layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG", width: 90, height: 44, componentProperties: { "Show icon#1:2": { type: "BOOLEAN", value: false } } },
      { id: "9:9", name: "Chip", type: "INSTANCE", layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG", width: 90, height: 44, componentProperties: { "Show icon#1:2": { type: "BOOLEAN", value: true } } },
      { id: "2:5", name: "Badge", type: "FRAME", layoutMode: "HORIZONTAL", layoutPositioning: "ABSOLUTE", x: 13, y: 13, layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG", width: 9, height: 9, children: [] },
    ])], sized);
    expect(hits.map((h) => [h.rule, h.node, h.detail])).toEqual([["instance.resized", "9:5", "Text field: width 602, component 320"], ["instance.resized", "9:7", "Chip: height fixed at 64, component hugs"], ["instance.boolean", "9:8", "Chip: Show icon off"], ["layout.absolute", "2:5", "at 13, 13"]]);
  });

  it("asks a component set for auto layout: it is the specimen's canvas", () => {
    const ds = page("0:ds", [{ id: "4:1", name: "Card", type: "COMPONENT_SET", description: "A card.", layoutMode: "NONE", children: [
      { id: "4:2", name: "State=Default", type: "COMPONENT", layoutMode: "HORIZONTAL", layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG", width: 90, height: 44, children: [] },
      { id: "4:3", name: "State=Hover", type: "COMPONENT", layoutMode: "HORIZONTAL", layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG", width: 90, height: 44, children: [] },
    ] }]);
    expect(inspectNodes([ds], sized).hits.map((h) => h.rule)).toEqual(["set.layout"]);
  });

  it("lays out boxes Figma's code draws as boxes; shapes with a vector are one SVG", () => {
    const rect = { id: "6:3", name: "Corner", type: "RECTANGLE", x: 13, y: 13, width: 9, height: 9, layoutSizingHorizontal: "FIXED", layoutSizingVertical: "FIXED", boundVariables: { width: { id: "v:w" }, height: { id: "v:w" } }, fills: [solid(red, "v:red")] };
    const frame = (id: string, kids: unknown[]) => ({ id, name: "Mark", type: "COMPONENT", description: "A mark.", layoutMode: "NONE", layoutSizingHorizontal: "FIXED", layoutSizingVertical: "FIXED", width: 22, height: 22, boundVariables: { width: { id: "v:w" }, height: { id: "v:w" } }, children: kids });
    const ds = page("0:ds", [frame("6:1", [rect]), frame("6:2", [{ ...rect, id: "6:4" }, { id: "6:5", name: "Check", type: "VECTOR", x: 4, y: 4, width: 14, height: 14, strokes: [solid(red, "v:red")] }])]);
    expect(inspectNodes([ds], sized).hits.map((h) => [h.rule, h.node])).toEqual([["layout.none", "6:1"]]);
  });

  it("asks for an inner shadow under an inside stroke to go: Figma hides it, a browser shows it", () => {
    const card = (id: string, align: string) => ({ id, name: "Card", type: "COMPONENT", description: "A card.", layoutMode: "HORIZONTAL", layoutSizingHorizontal: "HUG", layoutSizingVertical: "HUG", width: 90, height: 44, strokes: [solid(red, "v:red")], strokeAlign: align, strokeWeight: 1, effectStyleId: "S:inset", effects: [{ type: "INNER_SHADOW", visible: true, radius: 0, spread: 1, offset: { x: 0, y: 0 }, color: { ...red, a: 1 } }], children: [] });
    const ds = page("0:ds", [card("5:1", "INSIDE"), card("5:2", "OUTSIDE")]);
    expect(inspectNodes([ds], sized).hits.map((h) => [h.rule, h.node])).toEqual([["effect.under-stroke", "5:1"]]);
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

  it("tells instances of one component apart: by instance id, and their layers within it", async () => {
    const { carryIds } = await import("../src");
    const field = (inst: string, ids: [string, string]) =>
      `<div data-figma-instance="${inst}" data-figma-id="7:1"${ids[0] ? ` data-wave-id="${ids[0]}"` : ""}><input data-figma-id="7:2"${ids[1] ? ` data-wave-id="${ids[1]}"` : ""}></div>`;
    const before = `<!doctype html><html><body>${field("5:1", ["n_fielda", "n_inputa"])}${field("5:2", ["n_fieldb", "n_inputb"])}</body></html>`;
    const after = `<!doctype html><html><body>${field("5:1", ["", ""])}${field("5:2", ["", ""])}</body></html>`;
    const r = carryIds(after, before);
    expect(r.carried).toBe(4);
    expect(r.vanished).toEqual([]);
    expect(r.html).toContain('data-figma-instance="5:2" data-figma-id="7:1" data-wave-id="n_fieldb"><input data-figma-id="7:2" data-wave-id="n_inputb">');
  });
});

describe("entry gate: screen names", () => {
  const frame = (id: string, name: string) => ({ id, name, type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 0, children: [] });
  const named = (...names: string[]) => inspectNodes([page("0:s", names.map((n, i) => frame(`7:${i}`, n)))], facts).hits.filter((h) => h.rule === "screen.name").map((h) => h.detail);

  it("takes a frame named as its screen", () => {
    expect(named("About you", "Budget and timing", "You’re qualified")).toEqual([]);
  });

  it("refuses a frame name that is not a screen's name, as Keel's frames were", () => {
    expect(named("Qualification Form — 01 · About you · DS · 1440", "Login 1440", "Frame/2")).toEqual([
      '"Qualification Form — 01 · About you · DS · 1440"',
      '"Login 1440"',
      '"Frame/2"',
    ]);
  });

  it("refuses two frames with the same screen name", () => {
    expect(named("About you", "About You")).toEqual(['"About You" and "About you" are the same screen name']);
  });
});
