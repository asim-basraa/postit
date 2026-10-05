import { describe, expect, it } from "vitest";
import { buildDtcg } from "../src";

const styles = { text: [], effects: [] };

describe("text variables", () => {
  it("leaves prototype-state text variables out of the tokens, with a note", () => {
    const listing = ["P|font/family/geist|S|Geist", "P|budget/chip-1|S|Default", "S|space/1|F|4"].join("\n");
    const r = buildDtcg(listing, styles);
    expect(JSON.stringify(r.doc)).not.toContain("chip-1");
    expect((r.doc as any).font.family.geist.$type).toBe("fontFamily");
    expect(r.notes.some((n) => n.startsWith("budget/chip-1: a text variable"))).toBe(true);
  });
});
