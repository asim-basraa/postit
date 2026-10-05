import { describe, expect, it } from "vitest";
import { checkFidelity, fidelityReport, preflightHtml, readFidelity, stampFidelity } from "../src";

const PAGE = `<!doctype html><html><head><meta name="wave:spec" content="1">
<meta name="wave:screen" content="about-you">
<meta name="figma-source" content="figma:abc/1:2">
</head><body><h1 data-wave-id="n_head0001">About you</h1></body></html>`;

const measured = (structural: number) => ({ width: 1440, height: 900, raw: { percent: structural + 0.3 }, structural: { percent: structural } });

describe("the Figma match upload gate", () => {
  it("refuses a Figma screen with no measurement, and lets other pages through", () => {
    expect(checkFidelity(PAGE)).toMatchObject({ figma: true, pass: false });
    expect(checkFidelity(PAGE.replace(/<meta name="figma-source"[^>]*>/, ""))).toMatchObject({ figma: false, pass: true });
    // A specimen is measured in its own stage.
    expect(checkFidelity(PAGE.replace('<meta name="wave:screen" content="about-you">', '<meta name="wave:component" content="Button">')).figma).toBe(false);
    expect(preflightHtml(PAGE, "About you").issues.map((i) => i.code)).toContain("fidelity");
  });

  it("stamps the measurement, passes at 99% and refuses below", () => {
    const good = stampFidelity(PAGE, measured(0.445), { at: "2026-10-05T10:00:00Z" });
    expect(good.stamp).toMatchObject({ match: 99.555, structural: 0.445, raw: 0.745, reference: "figma:abc/1:2", width: 1440 });
    expect(readFidelity(good.html)).toEqual(good.stamp);
    expect(checkFidelity(good.html).pass).toBe(true);
    expect(good.html.indexOf("wave:fidelity")).toBeGreaterThan(good.html.indexOf("figma-source"));
    // Stamping again replaces the stamp.
    const bad = stampFidelity(good.html, measured(1.2));
    expect(bad.html.match(/wave:fidelity/g)).toHaveLength(1);
    expect(checkFidelity(bad.html)).toMatchObject({ pass: false });
    expect(checkFidelity(bad.html).reason).toMatch(/98\.8%/);
  });

  it("refuses a page changed after it was measured, but not for Wave attributes or test ids", () => {
    const { html } = stampFidelity(PAGE, measured(0.2));
    expect(checkFidelity(html.replace("About you", "About them")).reason).toMatch(/changed after/);
    expect(checkFidelity(html.replace("<h1 ", '<h1 data-testid="about-you.title" data-wave-bind="user/name" ')).pass).toBe(true);
  });

  it("logs each screen newest first and keeps the history", () => {
    const { stamp } = stampFidelity(PAGE, measured(0.2), { at: "2026-10-05T10:00:00Z" });
    const first = fidelityReport("Lead qualification", [{ screen: "About you", version: 2, stamp, published: true, reason: null, when: "2026-10-05 10:01" }], null);
    const second = fidelityReport("Lead qualification", [{ screen: "Qualified", version: null, stamp: null, published: false, reason: "no measurement", when: "2026-10-05 11:00" }], first);
    const rows = second.split("\n").filter((l) => /^\| 2026/.test(l));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/Qualified .*Refused: no measurement/);
    expect(rows[1]).toMatch(/About you \| v2 \| 99\.8% \| 0\.2% .*Uploaded/);
  });
});
