import { describe, expect, it } from "vitest";
import { assignTestIds, checkTestIds, preflightHtml, testIdTree } from "../src";

const screen = `<!doctype html><html><head><meta name="wave:spec" content="1"><meta name="wave:screen" content="budget-timing"></head><body>
<div class="page" data-wave-id="n_root">
  <header data-wave-component="Header" data-wave-id="n_h"><span>Keel</span></header>
  <form data-wave-id="n_f" data-figma-name="Form">
    <div role="radiogroup" aria-label="Currency" data-wave-component="Segmented control" data-wave-field="lead/currency">
      <label data-wave-component="Segment item" data-wave-state="selected"><input type="radio" name="c" value="USD"><p>USD</p></label>
      <label data-wave-component="Segment item"><input type="radio" name="c" value="EUR"><p>EUR</p></label>
    </div>
    <div data-wave-component="Chip"><p>$25–50k</p></div>
    <div data-wave-component="Select"><p>Company size</p><button type="button" aria-label="Company size" data-wave-field="lead/companySize" data-wave-options="1–10|11–50"><p>Pick</p></button></div>
    <div data-wave-component="Button" data-wave-variant="secondary" data-wave-to="back"><p>Back</p></div>
    <p hidden data-wave-state="error" data-wave-state-of="n_x">Pick one</p>
  </form>
  <div data-wave-component="Success mark"><svg></svg></div>
</div>
</body></html>`;

const ids = (html: string) => [...html.matchAll(/data-testid="([^"]+)"/g)].map((m) => m[1]);

describe("test ids", () => {
  it("names the screen, its sections and its design-system components", () => {
    const r = assignTestIds(screen, "budget-timing");
    expect(r.problems).toEqual([]);
    expect(ids(r.html)).toEqual([
      "budget-timing",
      "budget-timing.DS.header.keel",
      "budget-timing.form",
      "budget-timing.form.DS.segmentedControl.currency",
      "budget-timing.form.DS.segmentItem.usd",
      "budget-timing.form.DS.segmentItem.eur",
      "budget-timing.form.DS.chip.25-50k",
      "budget-timing.form.DS.select.company-size",
      "budget-timing.form.DS.button.back",
    ]);
    // Only attributes are added: the rest of the file is byte for byte the same.
    expect(r.html.replace(/ data-testid="[^"]+"/g, "")).toBe(screen);
  });

  it("keeps a test id once given, even when the label changes", () => {
    const once = assignTestIds(screen, "budget-timing").html;
    const renamed = once.replace("<p>Back</p>", "<p>Go back</p>");
    expect(assignTestIds(renamed, "budget-timing")).toMatchObject({ added: 0, problems: [] });
    expect(ids(renamed)).toContain("budget-timing.form.DS.button.back");
  });

  it("does not give one id twice: the design names them apart", () => {
    const twice = screen.replace("<p>Back</p>", "<p>EUR</p>").replace('data-wave-component="Button"', 'data-wave-component="Segment item"');
    const r = assignTestIds(twice, "budget-timing");
    expect(r.problems.map((p) => p.code)).toEqual(["testid-duplicate"]);
    expect(ids(r.html).filter((x) => x === "budget-timing.form.DS.segmentItem.eur")).toHaveLength(1);
  });

  it("is checked in preflight: a duplicate or another screen's id blocks", () => {
    const wrong = assignTestIds(screen, "budget-timing").html.replace('data-testid="budget-timing.form.DS.chip.25-50k"', 'data-testid="about-you.form.DS.chip.25-50k"');
    expect(checkTestIds(wrong, "budget-timing").map((p) => p.code)).toEqual(["testid-prefix"]);
    expect(preflightHtml(wrong, "Budget and timing").issues.map((i) => i.code)).toContain("testid-prefix");
  });

  it("lists them as a tree whose levels are the id's parts", () => {
    const tree = testIdTree(assignTestIds(screen, "budget-timing").html, "budget-timing")!;
    expect(tree.testId).toBe("budget-timing");
    const form = tree.children!.find((c) => c.kind === "section")!;
    expect(form.testId).toBe("budget-timing.form");
    expect(form.children!.map((c) => c.testId.split(".").slice(2).join("."))).toEqual(["DS.segmentedControl.currency", "DS.segmentItem.usd", "DS.segmentItem.eur", "DS.chip.25-50k", "DS.select.company-size", "DS.button.back"]);
    expect(form.children!.find((c) => c.ds === "DS.select")).toMatchObject({ component: "Select", field: "lead/companySize", options: ["1–10", "11–50"] });
    expect(form.children!.find((c) => c.testId.endsWith("usd"))).toMatchObject({ state: "selected", partOf: "budget-timing.form.DS.segmentedControl.currency" });
  });
});
