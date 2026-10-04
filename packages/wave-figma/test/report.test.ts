import { describe, expect, it } from "vitest";
import { readinessReport, type GateReport } from "../src";

const gate = (hits: GateReport["hits"], areas?: Record<string, string>): GateReport => ({ file: "FILE", pages: ["1:1"], covers: ["1:1"], areas, fonts: ["Inter"], total: 100, hits });

describe("readiness report", () => {
  it("says a file that blocks is not ready, and lists corrections by component and screen", () => {
    const r = readinessReport(
      gate({
        "color.unbound": { count: 3, nodes: [["2:1", "Fill", "fill #ff0000", "Button"], ["2:2", "Label", "fill #333333", "Button"], ["3:1", "Title", "fill #000000", "Checkout"]] },
        "text.style": { count: 1, nodes: [["3:2", "Price", "", "Checkout"]] },
        "layer.hidden": { count: 1, nodes: [["4:1", "Old badge", "", "Card"]] },
      }, { Button: "2:0", Checkout: "3:0", Card: "4:0" }),
      { title: "Acme readiness" },
    );
    expect(r.ready).toBe(false);
    expect(r.blocking).toBe(4);
    expect(r.areas).toBe(2);
    expect(r.markdown).toContain("**Not ready for Wave.**");
    expect(r.markdown).toContain("## What to change, in short");
    expect(r.markdown).toContain("- **Colour without a variable** (3): Bind the fill or stroke to a colour variable.");
    // Each component and screen links to its node, and so does each layer.
    expect(r.markdown).toContain("### [Button](https://www.figma.com/design/FILE?node-id=2-0)");
    expect(r.markdown).toContain("### [Checkout](https://www.figma.com/design/FILE?node-id=3-0)");
    expect(r.markdown).toContain("Figma file: [open in Figma](https://www.figma.com/design/FILE)");
    expect(r.markdown).toContain("[Fill](https://www.figma.com/design/FILE?node-id=2-1) (fill #ff0000)");
    // Advice alone does not block, and is under suggestions.
    expect(r.markdown).toMatch(/## Suggestions[\s\S]*### \[Card\]\(https:\/\/www\.figma\.com\/design\/FILE\?node-id=4-0\)[\s\S]*Suggestion: \*\*Hidden layer\*\*/);
  });

  it("is not ready when a page does not match Figma or a font cannot be served", () => {
    const r = readinessReport(gate({}), {
      fidelity: [
        { name: "Button", node: "2:0", score: 0.12, pass: true },
        { name: "Checkout", node: "3:0", score: 1.4, pass: false, cause: "The header wraps onto two lines in a browser." },
      ],
      fontsMissing: ["Brand Sans"],
    });
    expect(r.ready).toBe(false);
    expect(r.fidelityFailures).toBe(1);
    expect(r.markdown).toContain("| [Checkout](https://www.figma.com/design/FILE?node-id=3-0) | 1.400% | The header wraps onto two lines in a browser. |");
    expect(r.markdown).not.toContain("[Button](");
    expect(r.markdown).toContain("Brand Sans");
  });

  it("says a clean file is ready", () => {
    const r = readinessReport(gate({}), { fidelity: [{ name: "Button", score: 0.1, pass: true }] });
    expect(r.ready).toBe(true);
    expect(r.markdown).toContain("**Ready for Wave.**");
  });
});
