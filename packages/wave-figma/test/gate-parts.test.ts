import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GATE, GATE_WHOLE, mergeGateParts, script, type GatePart } from "../src";
import { main } from "../src/cli";

type Node = { id: string; name: string; type: string; children?: Node[]; parent?: Node; [k: string]: unknown };

// A fake Figma document, enough of the plugin API for the GATE script.
function fakeFigma(pages: Node[], extra: { mains: Record<string, Node> }) {
  const byId = new Map<string, Node>();
  const link = (n: Node, parent?: Node) => {
    if (parent) n.parent = parent;
    byId.set(n.id, n);
    for (const c of n.children ?? []) link(c, n);
  };
  const root = { id: "0:0", name: "Document", type: "DOCUMENT", children: pages } as Node;
  link(root);
  for (const m of Object.values(extra.mains)) if (!byId.has(m.id)) link(m);
  const below = (n: Node, types: string[]): Node[] => (n.children ?? []).flatMap((c) => [...(types.includes(c.type) ? [c] : []), ...below(c, types)]);
  for (const n of byId.values()) {
    n.findAllWithCriteria = ({ types }: { types: string[] }) => below(n, types);
    if (n.type === "PAGE") n.loadAsync = async () => {};
    if (n.type === "INSTANCE") n.getMainComponentAsync = async () => extra.mains[n.id] ?? null;
  }
  const calls = { main: 0 };
  for (const n of byId.values()) if (n.type === "INSTANCE") {
    const get = n.getMainComponentAsync as () => Promise<Node | null>;
    n.getMainComponentAsync = async () => (calls.main++, get());
  }
  const figma = {
    fileKey: "KEY",
    getNodeByIdAsync: async (id: string) => byId.get(id) ?? null,
    getLocalTextStylesAsync: async () => [{ id: "S:loose", name: "Body", boundVariables: {} }, { id: "S:1", name: "Title", boundVariables: { fontSize: {}, lineHeight: {}, letterSpacing: {}, fontFamily: {}, fontWeight: {} } }],
    variables: {
      getLocalVariableCollectionsAsync: async () => [{ id: "c1", defaultModeId: "m1" }],
      getLocalVariablesAsync: async () => [
        { id: "v:red", name: "color/accent", resolvedType: "COLOR", scopes: ["ALL_SCOPES"], variableCollectionId: "c1", valuesByMode: { m1: { r: 1, g: 0, b: 0, a: 1 } } },
        { id: "v:gap", name: "space/4", resolvedType: "FLOAT", scopes: ["GAP"], variableCollectionId: "c1", valuesByMode: { m1: 16 } },
        { id: "v:type", name: "type/body", resolvedType: "FLOAT", scopes: ["FONT_SIZE"], variableCollectionId: "c1", valuesByMode: { m1: 14 } },
      ],
    },
  };
  return { figma, calls };
}

const run = async (figma: unknown, src: string) => {
  const fn = new Function("figma", `return (async () => {${src}})();`);
  return (await fn(figma)) as { checksum: number; length: number; parts: number; part: number; data: string };
};

// Every part of a reply, as Figma would give them one run at a time.
const replies = async (figma: unknown, values: Parameters<typeof script>[1]) => {
  const first = await run(figma, script(GATE, { ...values, PART: 0 }));
  const all = [first];
  for (let p = 1; p < first.parts; p++) all.push(await run(figma, script(GATE, { ...values, PART: p })));
  return all;
};
const joined = (rs: { data: string }[]) => JSON.parse(rs.map((r) => r.data).join(""));

const red = { type: "SOLID", color: { r: 1, g: 0, b: 0 }, opacity: 1, boundVariables: { color: { id: "v:red" } } };
const loose = (id: string) => ({ id, name: "Copy", type: "TEXT", characters: "x", textStyleId: "S:loose", fontName: { family: "Geist", style: "Regular" }, fontSize: 14, fills: [red] });
const frame = (id: string, name: string, children: Node[], gap = 16) => ({ id, name, type: "FRAME", layoutMode: "VERTICAL", itemSpacing: gap, fills: [red], children }) as Node;
const unnamed = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => ({ id: `${prefix}:${i}`, name: `Rectangle ${i}`, type: "RECTANGLE", x: 0, y: 0, fills: [{ type: "SOLID", color: { r: 0, g: 0, b: 1 }, opacity: 1 }] }) as Node);
const button = (id: string) => ({ id, name: "Button", type: "INSTANCE", reactions: [], overrides: [{ id, overriddenFields: ["boundVariables"] }], boundVariables: {} }) as Node;

function file() {
  const buttonMain = { id: "2:1", name: "Button", type: "COMPONENT", description: "A button.", layoutMode: "HORIZONTAL", primaryAxisSizingMode: "AUTO", counterAxisSizingMode: "AUTO", itemSpacing: 8, fills: [red], width: 120, height: 40, componentPropertyDefinitions: { "Icon#1:1": { type: "BOOLEAN", defaultValue: false } }, boundVariables: {}, children: [loose("2:2")] } as Node;
  const ds = { id: "0:ds", name: "Design system", type: "PAGE", children: [
    buttonMain,
    { id: "2:3", name: "Chip", type: "COMPONENT_SET", description: "", layoutMode: "NONE", children: [{ id: "2:4", name: "State=Default", type: "COMPONENT", layoutMode: "HORIZONTAL", itemSpacing: 12, children: [] }] },
    { id: "2:5", name: "Card", type: "COMPONENT", description: "A card.", layoutMode: "VERTICAL", itemSpacing: 16, boundVariables: { itemSpacing: { id: "v:gap" } }, children: [loose("2:6")] },
  ] } as Node;
  const screens = { id: "0:s", name: "Screens", type: "PAGE", children: [
    frame("5:1", "About you", [loose("5:2"), button("5:3"), ...unnamed("5:4", 150)], 18),
    frame("6:1", "Budget", [loose("6:2"), button("6:3"), button("6:4")], 18),
    { id: "7:0", name: "Later", type: "SECTION", children: [frame("7:1", "About You", [button("7:2"), ...unnamed("7:3", 150)], 20), frame("7:4", "Login 1440", [])] },
    frame("8:1", "Done", [loose("8:2")]),
  ] } as Node;
  const mains = { "5:3": buttonMain, "6:3": buttonMain, "6:4": buttonMain, "7:2": buttonMain };
  return fakeFigma([ds, screens], { mains });
}

describe("the gate in parts", () => {
  afterEach(() => vi.restoreAllMocks());

  it("joins its parts into the report one run gives", async () => {
    const { figma } = file();
    const base = { PAGE: "0:ds", IDS: ["0:ds", "0:s"] };
    const one = await replies(figma, base);
    expect(one.length).toBeGreaterThan(1);
    const whole = joined(one);
    const plan = joined(await replies(figma, { ...base, AREAS: "plan" })).areas as [string, string][];
    expect(plan.map(([id]) => id)).toEqual(["2:1", "2:3", "2:5", "5:1", "6:1", "7:0", "8:1"]);

    for (const size of [1, 2, 3, 7]) {
      const parts: GatePart[] = [];
      for (let i = 0; i < plan.length; i += size) parts.push(joined(await replies(figma, { ...base, AREAS: plan.slice(i, i + size).map(([id]) => id) })));
      expect(mergeGateParts(parts)).toEqual(whole);
    }
    // What the parts had to agree on: a name two screens share in different parts, a style found in two parts, the 200-layer cap.
    expect(whole.hits["screen.name"].nodes.map((n: string[]) => n[2])).toEqual(['"About You" and "About you" are the same screen name', '"Login 1440"']);
    expect(whole.hits["text.style.unbound"].count).toBe(1);
    expect([whole.hits["layer.name"].count, whole.hits["layer.name"].nodes.length]).toEqual([300, 200]);
    expect(Object.keys(whole.spacing.raw)).toEqual(["8", "12", "16", "18", "20"]);
  });

  it("looks each instance's main component up once", async () => {
    const { figma, calls } = file();
    await run(figma, script(GATE, { PAGE: "0:ds", IDS: ["0:ds", "0:s"] }));
    expect(calls.main).toBe(4);
  });

  it("is the same script, for the designer, with the whole file in one run", () => {
    expect(GATE_WHOLE).not.toContain("{{AREAS}}");
    expect(script(GATE_WHOLE, { PAGE: "0:ds", IDS: ["0:ds"] })).toBe(script(GATE, { PAGE: "0:ds", IDS: ["0:ds"] }));
  });
});

describe("wave-figma gate-merge", () => {
  afterEach(() => vi.restoreAllMocks());

  const save = (dir: string, name: string, r: unknown) => {
    const f = join(dir, name);
    writeFileSync(f, JSON.stringify(r));
    return f;
  };

  it("checks every reply's checksum and that the parts follow the plan", async () => {
    const { figma } = file();
    const dir = mkdtempSync(join(tmpdir(), "gate-merge-"));
    const base = { PAGE: "0:ds", IDS: ["0:ds", "0:s"] };
    const planFiles = (await replies(figma, { ...base, AREAS: "plan" })).map((r, i) => save(dir, `plan.${i}.json`, r));
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    await main(["gate-chunks", "--plan", planFiles.join(","), "--size", "3"]);
    const { chunks } = JSON.parse(String(stdout.mock.calls.at(-1)?.[0])) as { chunks: string[][] };
    expect(chunks).toEqual([["2:1", "2:3", "2:5"], ["5:1", "6:1", "7:0"], ["8:1"]]);

    const files: string[] = [];
    for (const [c, ids] of chunks.entries()) for (const [p, r] of (await replies(figma, { ...base, AREAS: ids })).entries()) files.push(save(dir, `gate.${c}.${p}.json`, r));
    const out = join(dir, "gate.json");
    expect(await main(["gate-merge", ...files, "--plan", planFiles.join(","), "-o", out])).toBe(0);
    expect(JSON.parse(readFileSync(out, "utf8"))).toEqual(joined(await replies(figma, base)));

    // A part left out, or a reply that does not match its checksum, is refused.
    await expect(main(["gate-merge", ...files.slice(1), "--plan", planFiles.join(","), "-o", out])).rejects.toThrow(/plan's areas/);
    const bad = JSON.parse(readFileSync(files[0], "utf8"));
    writeFileSync(files[0], JSON.stringify({ ...bad, data: bad.data.replace("Chip", "Chop") }));
    await expect(main(["gate-merge", ...files, "--plan", planFiles.join(","), "-o", out])).rejects.toThrow(/checksum/);
  });
});
