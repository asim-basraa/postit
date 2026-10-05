import { describe, expect, it } from "vitest";
import { carryIds } from "../src";

describe("carrying ids when Figma reports a layer under a new id", () => {
  it("matches by variant, tag and words when that match is unique", () => {
    const before = `<div data-figma-variant="1:1"><p data-figma-id="2:1" data-wave-id="n_a">Title</p></div><div data-figma-variant="1:2"><p data-figma-id="2:1" data-wave-id="n_b">Title</p><p data-figma-id="2:2" data-wave-id="n_c">Body</p></div>`;
    const after = `<div data-figma-variant="1:1"><p data-figma-id="2:1">Title</p></div><div data-figma-variant="1:2"><p data-figma-id="3:1">Title</p><p data-figma-id="3:2">Body</p></div>`;
    const r = carryIds(after, before);
    expect(r.vanished).toEqual([]);
    expect(r.html).toContain('data-figma-id="3:1" data-wave-id="n_b"');
    expect(r.html).toContain('data-figma-id="3:2" data-wave-id="n_c"');
  });

  it("leaves an ambiguous match alone", () => {
    const before = `<div data-figma-variant="1:2"><p data-figma-id="2:1" data-wave-id="n_b">Same</p></div>`;
    const after = `<div data-figma-variant="1:2"><p data-figma-id="3:1">Same</p><p data-figma-id="3:2">Same</p></div>`;
    expect(carryIds(after, before).vanished).toEqual(["n_b"]);
  });
});
