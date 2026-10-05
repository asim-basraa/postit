import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { behaviourCheck } from "../src";
import { chip, optionSpecimen, page, screen, selectSpecimen } from "./fixtures/behaviour";

const CHROMIUM = "/opt/pw-browsers/chromium";

describe.skipIf(!existsSync(CHROMIUM))("behaviour check", () => {
  it("opens a select's drawn menu, shows the chosen option, and shows a chosen chip", async () => {
    const r = await behaviourCheck(screen, { specimens: [selectSpecimen, optionSpecimen, page(`${chip("")}${chip("selected")}`, "Chip")], executablePath: CHROMIUM, width: 600, height: 400 });
    const by = (k: string) => r.controls.filter((c) => c.kind === k);
    expect(by("select")).toEqual([expect.objectContaining({ name: "Size", pass: true, detail: 'opens its menu, and shows "Small" when chosen' })]);
    expect(by("radio").every((c) => c.pass)).toBe(true);
    expect(r.pass).toBe(true);
  }, 60_000);

  it("fails a select with no open state drawn, and a chip with no chosen look", async () => {
    const closedOnly = page(`<div data-wave-component="Select" class="field"><p>Size</p><div class="box"><p class="ph">Pick one</p></div></div>`, "Select");
    const r = await behaviourCheck(screen, { specimens: [closedOnly, page(chip(""), "Chip")], executablePath: CHROMIUM, width: 600, height: 400 });
    expect(r.pass).toBe(false);
    expect(r.controls.find((c) => c.kind === "select")).toMatchObject({ pass: false, detail: "does not open: its component has no Open state with a Menu drawn" });
    expect(r.controls.filter((c) => c.kind === "radio").map((c) => c.pass)).toEqual([false, false]);
    expect(r.notices.join(" ")).toContain("no open state");
  }, 60_000);
});
