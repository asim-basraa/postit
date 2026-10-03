import { describe, expect, it } from "vitest";
import { applyUpgrade, errorElement, errorParts, linkStates, withErrorParts } from "../src";
import { serializeOuter } from "parse5";

// A Text field set: Default shows no message, Error shows the Helper property's words.
const comp = {
  name: "Text field",
  properties: {
    Helper: { type: "TEXT", default: "Enter a valid email" },
    State: { type: "VARIANT", default: "Default", options: ["Default", "Error"] },
    Size: { type: "VARIANT", default: "Full", options: ["Full", "Half"] },
  },
  variants: [
    { id: "1:1", variant: { State: "Default", Size: "Full" } },
    { id: "1:2", variant: { State: "Error", Size: "Full" } },
    { id: "1:3", variant: { State: "Default", Size: "Half" } },
  ],
};
const field = (msg: string) => `<div class="field"><label>Email</label><div class="box"><p>name@x.com</p></div>${msg}</div>`;
const specimen = `<!doctype html><html><body>
<div data-figma-variant="1:1">${field("")}</div>
<div data-figma-variant="1:2">${field('<p class="err" data-figma-id="1:9" data-figma-text="t3">Enter a valid email</p>')}</div>
<div data-figma-variant="1:3">${field("")}</div>
</body></html>`;

describe("error states drawn in Figma", () => {
  it("finds the layer only the Error variant shows, for every other variant", () => {
    const parts = errorParts([comp], [specimen]);
    expect(Object.keys(parts).sort()).toEqual(["1:1", "1:3"]);
    expect(parts["1:1"].prop).toBe("Helper");
    expect(parts["1:1"].html).toContain('class="err"');
  });

  it("draws an instance's own words, hidden, without the specimen's ids", () => {
    const parts = errorParts([comp], [specimen]);
    const el = errorElement(parts["1:1"], "Enter your work email", "5:1")!;
    const html = serializeOuter(el);
    expect(html).toContain(">Enter your work email<");
    expect(html).toMatch(/hidden="" data-wave-state="error" data-figma-state-of="5:1"/);
    expect(html).not.toMatch(/data-figma-(id|text)=/);
    expect(errorElement(parts["1:1"], "  ", "5:1")).toBeNull();
  });

  it("puts the part in every non-error variant of the specimen, and it no longer counts as shown", () => {
    const parts = errorParts([comp], [specimen]);
    const r = withErrorParts(specimen, parts, { Helper: "Enter a valid email" });
    expect(r.added).toBe(2);
    expect(Object.keys(errorParts([comp], [r.html])).sort()).toEqual(["1:1", "1:3"]);
  });

  it("points each error part at its field once ids exist", () => {
    const page = `<!doctype html><html><body><div data-figma-instance="5:1"><input data-wave-id="n_abcd"><p hidden data-wave-state="error" data-figma-state-of="5:1">x</p></div><p data-figma-state-of="9:9">y</p></body></html>`;
    const r = linkStates(page);
    expect(r.linked).toBe(1);
    expect(r.unresolved).toEqual(["9:9"]);
    expect(r.html).toContain('data-wave-state-of="n_abcd"');
    expect(r.html.replace('data-wave-state-of="n_abcd"', 'data-figma-state-of="5:1"')).toBe(page);
  });
});

describe("upgrade plans", () => {
  it("address elements without a Figma id by tag inside a scope", () => {
    const page = `<!doctype html><html><head></head><body><div data-figma-id="2:1"><svg></svg></div><div data-figma-id="2:2"><svg></svg></div></body></html>`;
    const r = applyUpgrade(page, [{ op: "attrs", id: "2:1 svg", attrs: { "aria-hidden": "true" } }]);
    expect((r.html.match(/aria-hidden="true"/g) ?? []).length).toBe(1);
  });
});
