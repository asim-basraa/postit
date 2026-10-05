import { describe, expect, it } from "vitest";
import { specimenRoots, specimenTags } from "../src/specimen-roots";

describe("a specimen's variant roots", () => {
  it("reads a published specimen, whose wrapper carries its Wave id before the variant", () => {
    const page = `<div data-wave-id="n_1" data-figma-variant="2:1"><div class="flex rounded-md" data-figma-id="2:1"></div></div><div data-figma-variant="2:2"><label class="flex" data-figma-id="2:2"></label></div>`;
    expect(specimenRoots([page])).toEqual({ "2:1": "flex rounded-md", "2:2": "flex" });
  });

  it("reads each root's tag as Figma's code wrote it, before the upgrade", () => {
    const page = `<div data-figma-variant="2:1"><label class="flex" data-wave-tag="div" data-figma-id="2:1"></label></div><div data-figma-variant="2:2"><button class="flex"></button></div>`;
    expect(specimenTags([page])).toEqual({ "2:1": "div", "2:2": "button" });
  });
});
