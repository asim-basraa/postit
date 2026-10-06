import { describe, expect, it } from "vitest";
import { readinessReport, readReadinessRecord, type GateReport } from "../src";

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

  it("puts its version and the date checked at the top", () => {
    const r = readinessReport(gate({}), { title: "Acme readiness", version: 3, checkedAt: "2026-10-06T10:00:00Z" });
    expect(r.markdown.startsWith("# Acme readiness\n\n**Version 3**, checked 2026-10-06. It replaces version 2; act on this one.\n")).toBe(true);
    expect(readinessReport(gate({}), { version: 1, checkedAt: "2026-10-06T10:00:00Z" }).markdown).toContain("**Version 1**, checked 2026-10-06.\n");
  });

  it("lists what was fixed and any regression since the version it replaces", () => {
    const at = "2026-10-06T10:00:00Z";
    const v1 = readinessReport(
      gate({
        "color.unbound": { count: 2, nodes: [["2:1", "Fill", "", "Button"], ["3:1", "Title", "", "Checkout"]] },
        "text.style": { count: 1, nodes: [["3:2", "Price", "", "Checkout"]] },
      }, { Button: "2:0", Checkout: "3:0" }),
      {
        version: 1,
        checkedAt: at,
        fidelity: [{ name: "Button", node: "2:0", score: 1.2, pass: false }, { name: "Card", node: "4:0", score: 0.1, pass: true }],
        behaviour: [{ name: "Checkout", result: { pass: false, notices: [], controls: [{ kind: "radio", name: "Plan", figma: "3:9", pass: false, detail: "" }, { kind: "select", name: "Country", figma: "3:8", pass: true, detail: "" }] } }],
        fontsMissing: ["Brand Sans"],
      },
    );
    // The record is in the page, hidden from readers.
    expect(readReadinessRecord(v1.markdown)?.version).toBe(1);
    expect(renderedText(v1.markdown)).not.toContain("wave:readiness");

    const v2 = readinessReport(
      gate({
        "color.unbound": { count: 1, nodes: [["3:1", "Title", "", "Checkout"]] },
        "layer.mask": { count: 1, nodes: [["2:5", "Mask", "", "Button"]] },
      }, { Button: "2:0", Checkout: "3:0" }),
      {
        previous: v1.markdown,
        checkedAt: at,
        fidelity: [{ name: "Button", node: "2:0", score: 0.1, pass: true }, { name: "Card", node: "4:0", score: 2, pass: false }, { name: "Header", node: "5:0", score: 3, pass: false }],
        behaviour: [{ name: "Checkout", result: { pass: false, notices: [], controls: [{ kind: "radio", name: "Plan", figma: "3:9", pass: true, detail: "" }, { kind: "select", name: "Country", figma: "3:8", pass: false, detail: "" }] } }],
        fontsMissing: [],
      },
    );
    const md = v2.markdown;
    expect(v2.version).toBe(2);
    expect(md).toContain("**Version 2**, checked 2026-10-06. It replaces version 1; act on this one.");
    expect(md).toContain("## Since version 1");
    // Fixed: the colour in Button, the text style in Checkout, Button's match, the Plan radio, the font.
    expect(md).toContain("- **Colour without a variable** in [Button](https://www.figma.com/design/FILE?node-id=2-0): the layer is fixed ([Fill](https://www.figma.com/design/FILE?node-id=2-1)).");
    expect(md).toMatch(/- \*\*[^*]+\*\* in \[Checkout\]\([^)]*\): the layer is fixed \(\[Price\]/);
    expect(md).toContain("now matches Figma (1.200% difference before, 0.100% now)");
    expect(md).toContain("Checkout: [Plan](https://www.figma.com/design/FILE?node-id=3-9) now responds in the prototype.");
    expect(md).toContain("- Font **Brand Sans** is now available to Wave.");
    expect(v2.fixed).toBe(5);
    // Regressions: a new blocking layer in Button, Card no longer matches, Country stopped responding.
    expect(md).toContain("**Regressions** (3)");
    expect(md).toContain("in version 1 and no longer does (0.100% difference before, 2.000% now)");
    expect(md).toContain("responded in the prototype in version 1 and now does nothing.");
    expect(v2.regressions).toBe(3);
    // A page checked for the first time is not a regression.
    expect(md).toMatch(/\*\*Checked for the first time\*\* \(1\)[\s\S]*\[Header\]/);
    // Fixed comes before the corrections still open.
    expect(md.indexOf("## Since version 1")).toBeLessThan(md.indexOf("**Not ready for Wave.**"));
  });

  it("says what changed cannot be listed when the last report has no record", () => {
    const r = readinessReport(gate({}), { previous: "# Old\n\n**Version 4**, checked 2026-10-01.\n" });
    expect(r.version).toBe(5);
    expect(r.markdown).toContain("has no findings record");
    expect(r.fixed).toBeNull();
  });
});

function renderedText(md: string): string {
  return md.replace(/<!--[\s\S]*?-->/g, "");
}
