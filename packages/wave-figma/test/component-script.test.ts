import { describe, expect, it } from "vitest";
import { script, COMPONENT } from "../src";

// Runs the COMPONENT script against a fake Figma document.
async function run(node: Record<string, unknown>) {
  const page = { type: "PAGE" };
  const n = { ...node, parent: page, findAll: () => [] };
  const figma = { getNodeByIdAsync: async () => n, setCurrentPageAsync: async () => {}, variables: { getVariableByIdAsync: async () => null } };
  const body = script(COMPONENT, { NODE: "1:1" });
  const fn = new Function("figma", `return (async () => {${body}})();`);
  const r = (await fn(figma)) as { data: string };
  return JSON.parse(r.data);
}

describe("COMPONENT script", () => {
  it("keeps a text property that shares its name with a variant property", async () => {
    const comp = await run({
      id: "1:1", name: "Select", type: "COMPONENT_SET", description: "", width: 320, height: 76, children: [],
      componentPropertyDefinitions: {
        "Helper#28:65": { type: "TEXT", defaultValue: "Helper text" },
        State: { type: "VARIANT", defaultValue: "Default", variantOptions: ["Default", "Open"] },
        Helper: { type: "VARIANT", defaultValue: "Off", variantOptions: ["Off", "On"] },
      },
    });
    expect(comp.properties.Helper).toEqual({ type: "VARIANT", default: "Off", options: ["Off", "On"] });
    expect(comp.properties["Helper (text)"]).toEqual({ type: "TEXT", default: "Helper text", options: null });
    expect(comp.properties.State.type).toBe("VARIANT");
  });
});

describe("COMPONENT script strokes", () => {
  it("lists auto-layout frames whose stroke takes no room", async () => {
    const menu = { id: "4:1", layoutMode: "VERTICAL", strokesIncludedInLayout: false, strokes: [{ visible: true }], strokeWeight: 1 };
    const card = { id: "4:2", layoutMode: "VERTICAL", strokesIncludedInLayout: true, strokes: [{ visible: true }], strokeWeight: 1 };
    const page = { type: "PAGE" };
    const n = { id: "1:1", name: "Select", type: "COMPONENT", description: "", width: 1, height: 1, parent: page, componentPropertyDefinitions: {}, findAll: (f: (x: unknown) => boolean) => [menu, card].filter(f) };
    const figma = { getNodeByIdAsync: async () => n, setCurrentPageAsync: async () => {}, variables: { getVariableByIdAsync: async () => null } };
    const fn = new Function("figma", `return (async () => {${script(COMPONENT, { NODE: "1:1" })}})();`);
    const comp = JSON.parse(((await fn(figma)) as { data: string }).data);
    expect(comp.strokesOutOfLayout).toEqual({ "4:1": 1 });
  });
});
