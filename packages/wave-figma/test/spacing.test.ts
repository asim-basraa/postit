import { describe, expect, it } from "vitest";
import { assessSpacing, planSpacing, proposedDecisions, spacingChanges, spacingScript, spacingSkill, type GateReport, type SpacingVariable } from "../src";

const v = (id: string, name: string, px: number, other?: number): SpacingVariable => ({ id, name, collection: "c", scopes: ["GAP"], px, byMode: other === undefined ? { d: px } : { d: px, m: other } });
const use = (count: number, area = "Checkout") => ({ count, props: { gap: count }, areas: { [area]: count }, examples: [["1:" + count, "Row", area]] as [string, string, string][] });

const report = (raw: Record<string, ReturnType<typeof use>>, variables = [v("v4", "space/4", 4), v("v8", "space/8", 8), v("v16", "space/16", 16), v("vmd", "space/md", 16), v("v24", "space/24", 24, 20)], remote = 0): GateReport => ({
  file: "FILE",
  pages: ["0:1"],
  covers: ["1:0"],
  areas: { Checkout: "1:0" },
  fonts: [],
  total: 0,
  hits: {},
  spacing: { raw, remote, variables },
});

describe("spacing assessment", () => {
  it("sorts each value by how safely it can be bound, and never offers a variable of another value", () => {
    const plan = planSpacing(report({ "8": use(5), "16": use(3), "24": use(2), "32": use(4), "40": use(1), "18": use(2), "16.5": use(1) }), { project: "Keel", at: "2026-10-20T00:00:00Z" });
    const g = Object.fromEntries(plan.values.map((x) => [x.px, x.group]));
    expect(g).toEqual({ 8: "exact", 16: "ambiguous", 16.5: "fractional", 18: "off-scale", 24: "ambiguous", 32: "missing", 40: "off-scale" });
    expect(plan.grid).toBe(4);
    expect(plan.prefix).toBe("space");
    const byPx = (px: number) => plan.values.find((x) => x.px === px)!;
    expect(byPx(8).proposed).toEqual({ kind: "bind", id: "v8", name: "space/8" });
    // Two variables of the same value: the designer chooses; nothing is proposed.
    expect(byPx(16).proposed).toEqual({ kind: "skip" });
    expect(byPx(16).options.filter((o) => o.kind === "bind").map((o) => (o as { name: string }).name)).toEqual(["space/16", "space/md"]);
    // A variable that is another value in another mode is never bound without a choice, and a fixed one can be made.
    expect(byPx(24).options).toEqual([{ kind: "bind", id: "v24", name: "space/24", note: "is 20px in another mode, so a layer in that mode would change" }, { kind: "create", name: "space/24px" }, { kind: "skip" }]);
    expect(byPx(32).proposed).toEqual({ kind: "create", name: "space/32" });
    expect(byPx(18).why).toContain("off the 4px grid");
    expect(byPx(40).why).toContain("only one layer");
    expect(byPx(16.5).options).toEqual([{ kind: "skip", note: "fix by hand in Figma" }]);
    for (const x of plan.values) for (const o of x.options) if (o.kind === "bind") expect(plan.values.length && [4, 8, 16, 24].includes(x.px)).toBe(true);
    expect(byPx(32).rem).toBe(2);
  });

  it("reads the grid from the scale's steps, not its hairlines", () => {
    const vars = [v("v1", "space/1", 1), v("v2", "space/2", 2), v("v4", "space/4", 4), v("v8", "space/8", 8), v("v12", "space/12", 12), v("v16", "space/16", 16)];
    expect(planSpacing(report({ "20": use(3) }, vars), { project: "Keel" })).toMatchObject({ grid: 4, values: [{ px: 20, group: "missing" }] });
  });

  it("gives the project's risk and recommendation", () => {
    expect(assessSpacing(report({ "8": use(5) }), { project: "Keel" })).toMatchObject({ risk: "low", recommend: true, total: 5 });
    expect(assessSpacing(report({ "8": use(5), "32": use(4) }), { project: "Keel" })).toMatchObject({ risk: "medium", recommend: true });
    const high = assessSpacing(report({ "8": use(20), "18": use(2) }), { project: "Keel" });
    expect(high).toMatchObject({ risk: "high", recommend: true });
    expect(high.recommendation).toContain("Allow only if the designer decides each high-risk value");
    const messy = assessSpacing(report({ "8": use(5), "18": use(4), "13": use(3) }), { project: "Keel" });
    expect(messy).toMatchObject({ risk: "high", recommend: false });
    expect(messy.recommendation).toContain("Not recommended");
    const lib = assessSpacing(report({ "8": use(5) }, [], 12), { project: "Keel" });
    expect(lib).toMatchObject({ possible: false, recommend: false });
    expect(assessSpacing(report({}), { project: "Keel" }).recommendation).toContain("Nothing to do");
    expect(() => assessSpacing({ ...report({}), spacing: undefined }, { project: "Keel" })).toThrow("no spacing data");
  });

  it("writes a page that says what can go wrong and what is certain", () => {
    const md = assessSpacing(report({ "8": use(5), "18": use(2) }), { project: "Keel", version: 2, at: "2026-10-20T00:00:00Z" }).markdown;
    expect(md).toContain("# Figma spacing assessment: Keel");
    expect(md).toContain("**Version 2**, assessed 2026-10-20");
    expect(md).toContain("Wave never changes Figma.");
    expect(md).toContain("## Verdict: high risk");
    expect(md).toContain("| [8px](https://www.figma.com/design/FILE?node-id=1-5) | 0.5rem | 5 | Checkout (5) | exact | bind to `space/8` |");
    expect(md).toContain("**Misunderstanding: a value is not a meaning.**");
    expect(md).toContain("**Nothing moves.**");
  });
});

describe("the project's spacing skill", () => {
  const plan = planSpacing(report({ "8": use(2), "16": use(1), "32": use(2), "18": use(2) }), { project: "Keel", at: "2026-10-20T00:00:00Z" });

  // A small Figma file: a screen with rows, one inside an instance.
  type N = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const file = () => {
    const vars: Record<string, N> = {
      v8: { id: "v8", name: "space/8", variableCollectionId: "c", valuesByMode: { d: 8 } },
      v16: { id: "v16", name: "space/16", variableCollectionId: "c", valuesByMode: { d: 16 } },
      vmd: { id: "vmd", name: "space/md", variableCollectionId: "c", valuesByMode: { d: 16 } },
      v24: { id: "v24", name: "space/24", variableCollectionId: "c", valuesByMode: { d: 24 } },
    };
    const node = (id: string, extra: N, children: N[] = []): N => {
      const n: N = { id, name: "Row " + id, type: "FRAME", layoutMode: "HORIZONTAL", itemSpacing: 0, paddingTop: 0, paddingRight: 0, paddingBottom: 0, paddingLeft: 0, boundVariables: {}, children, ...extra };
      n.setBoundVariable = (prop: string, variable: N | null) => {
        if (!variable) return void delete n.boundVariables[prop];
        n.boundVariables[prop] = { id: variable.id };
        n[prop] = variable.valuesByMode[n.mode ?? "d"];
      };
      for (const c of children) c.parent = n;
      return n;
    };
    const inside = node("2:1", { itemSpacing: 8 });
    const screen = node("1:0", { type: "FRAME", layoutMode: "VERTICAL", itemSpacing: 32, paddingTop: 8 }, [
      node("1:1", { itemSpacing: 8 }),
      node("1:2", { itemSpacing: 18, paddingLeft: 32 }),
      node("1:3", { itemSpacing: 12 }),
      { id: "2:0", type: "INSTANCE", children: [inside] },
    ]);
    const pageNode = { id: "0:1", type: "PAGE", loadAsync: async () => {}, children: [screen] };
    screen.parent = pageNode;
    const all = new Map<string, N>();
    const index = (n: N) => (all.set(n.id, n), (n.children ?? []).forEach(index));
    index(pageNode);
    const saved: string[] = [];
    const collection = { id: "c", modes: [{ modeId: "d" }] };
    const figma = {
      fileKey: "FILE",
      getNodeByIdAsync: async (id: string) => all.get(id) ?? null,
      saveVersionHistoryAsync: async (title: string) => void saved.push(title),
      variables: {
        getVariableCollectionByIdAsync: async (id: string) => (id === "c" ? collection : null),
        getLocalVariablesAsync: async () => Object.values(vars),
        getVariableByIdAsync: async (id: string) => vars[id] ?? null,
        createVariableCollection: () => collection,
        createVariable: (name: string, col: N) => {
          const x: N = { id: "new:" + name, name, variableCollectionId: col.id, valuesByMode: {} };
          x.setValueForMode = (m: string, value: number) => (x.valuesByMode[m] = value);
          vars[x.id] = x;
          return x;
        },
      },
    };
    return { figma, screen, inside, saved, vars, all };
  };
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const run = (figma: unknown, decisions: unknown, mode: string, part = 0, checkpoint = "auto") =>
    new AsyncFunction("figma", spacingScript(plan).replace("{{DECISIONS}}", JSON.stringify(decisions)).replace("{{MODE}}", mode).replace("{{PART}}", String(part)).replace("{{CHECKPOINT}}", checkpoint))(figma);

  it("proposes binding exact values and creating missing steps, and leaves the rest", () => {
    expect(proposedDecisions(plan)).toEqual({ "8": { bind: "v8" }, "16": "skip", "18": "skip", "32": { create: "space/32" } });
  });

  it("lists the changes in a dry run without touching the file, and never looks inside an instance", async () => {
    const f = file();
    const r = await run(f.figma, proposedDecisions(plan), "dry");
    expect(r).toMatchObject({ mode: "dry", total: 4, byValue: { 8: 2, 32: 2 }, unplanned: { 12: 1 }, parts: 1, missingCovers: 0 });
    expect(JSON.parse(r.data)).toEqual([
      ["1:0", "Row 1:0", "itemSpacing", 32, "create:space/32"],
      ["1:0", "Row 1:0", "paddingTop", 8, "bind:v8"],
      ["1:1", "Row 1:1", "itemSpacing", 8, "bind:v8"],
      ["1:2", "Row 1:2", "paddingLeft", 32, "create:space/32"],
    ]);
    expect(f.screen.boundVariables).toEqual({});
    expect(f.saved).toEqual([]);
    expect(f.inside.boundVariables).toEqual({});
  });

  it("saves a version, creates and binds, and moves nothing", async () => {
    const f = file();
    const r = await run(f.figma, proposedDecisions(plan), "apply");
    expect(r).toEqual({ mode: "apply", bound: 4, created: [["space/32", 32, "new:space/32"]] });
    expect(f.saved).toEqual(["Before spacing variables"]);
    expect(f.screen.boundVariables).toEqual({ itemSpacing: { id: "new:space/32" }, paddingTop: { id: "v8" } });
    expect([f.screen.itemSpacing, f.screen.paddingTop]).toEqual([32, 8]);
    expect(f.vars["new:space/32"]).toMatchObject({ scopes: ["GAP"], valuesByMode: { d: 32 } });
    expect(f.inside.boundVariables).toEqual({});
    // Nothing is left for the approved values.
    expect(await run(f.figma, proposedDecisions(plan), "dry")).toMatchObject({ total: 0 });
  });

  it("undoes a binding that changed a layer and stops", async () => {
    const f = file();
    f.all.get("1:1")!.mode = "m";
    f.vars.v8.valuesByMode.m = 6;
    const r = await run(f.figma, proposedDecisions(plan), "apply");
    expect(r.stopped).toContain("would have changed from 8 to 6");
    expect(f.all.get("1:1")!.itemSpacing).toBe(8);
    expect(f.all.get("1:1")!.boundVariables).toEqual({});
  });

  it("refuses what the plan does not allow, another file, and changes nothing when it cannot save a version", async () => {
    const f = file();
    await expect(run(f.figma, { "18": { bind: "v16" } }, "dry")).rejects.toThrow("does not allow");
    await expect(run(f.figma, { "12": { create: "space/12" } }, "dry")).rejects.toThrow("No value 12px");
    await expect(run(f.figma, { "32": { create: "space/8" } }, "apply")).rejects.toThrow("already exists");
    await expect(run({ ...f.figma, fileKey: "OTHER" }, {}, "dry")).rejects.toThrow("for another Figma file");
    const failing = { ...f.figma, saveVersionHistoryAsync: async () => { throw new Error("not allowed"); } };
    const r = await run(failing, proposedDecisions(plan), "apply");
    expect(r.stopped).toContain("Could not save a version first");
    expect(f.screen.boundVariables).toEqual({});
    // Only after the designer saved one by hand.
    expect(await run(failing, proposedDecisions(plan), "apply", 0, "saved-by-designer")).toMatchObject({ bound: 4 });
  });

  it("writes the skill for this project and file only, with the plan and the script", () => {
    const md = spacingSkill(plan, { assessmentLink: "the assessment" });
    expect(md).toMatch(/^---\nname: Keel Figma spacing\n/);
    expect(md).toContain("only for the file https://www.figma.com/design/FILE");
    expect(md).toContain("| 32px | 2rem | 2 | missing (medium) | create `space/32` | create `space/32`; leave it |");
    expect(md).toContain("Never move a pixel");
    expect(md).toContain("const changesOf =");
    expect(spacingChanges([], {})).toEqual({ changes: [], unplanned: {} });
  });
});
