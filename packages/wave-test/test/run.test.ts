import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assignTestIds, flowGherkin, parseFeatureMd } from "@wave/spec";
import { chromium } from "playwright";
import { AppTarget, checkIds, parseFeature, PrototypeTarget, runFeature, runReport } from "../src";

const CHROMIUM = "/opt/pw-browsers/chromium";

const css = `.chip{display:inline-flex;padding:4px 8px;border:1px solid #ccc}.chip-on{background:#111;color:#fff}.sr{position:absolute;width:1px;height:1px;opacity:0}`;
const page = (slug: string, body: string) =>
  assignTestIds(`<!doctype html><html><head><meta name="wave:screen" content="${slug}"><style>${css}</style></head><body><main>${body}</main></body></html>`, slug).html;

const ABOUT = page(
  "about-you",
  `<form data-figma-name="Form">
    <div data-wave-component="Text field"><p>Full name</p><input type="text" data-wave-field="lead/name" data-wave-validate="required"></div>
    <div role="radiogroup" aria-label="Role" data-wave-field="lead/role" data-wave-validate="required">
      <label class="chip" data-wave-component="Chip"><input class="sr" type="radio" name="r" value="Founder" data-wave-insert><p>Founder</p></label>
      <label class="chip" data-wave-component="Chip"><input class="sr" type="radio" name="r" value="Other" data-wave-insert><p>Other</p></label>
    </div>
    <button type="submit" data-wave-component="Button" data-wave-action="lead/save" data-wave-trigger="submit" data-wave-to="screen:done"><span>Continue</span></button>
  </form>`,
);
const DONE = page("done", `<h1 data-wave-component="Heading" data-wave-bind="lead/name">Thanks</h1><div data-wave-component="Button" data-wave-to="back"><p>Back</p></div>`);
const chipSpecimen = { component: "Chip", variant: "default", state: "", html: '<label class="chip" data-wave-component="Chip"><input class="sr" type="radio" data-wave-insert><p>A</p></label>' };
const chipOn = { component: "Chip", variant: "default", state: "selected", html: '<label class="chip chip-on" data-wave-component="Chip" data-wave-state="selected"><input class="sr" type="radio" data-wave-insert><p>A</p></label>' };
const bundle = { screens: [{ slug: "about-you", html: ABOUT }, { slug: "done", html: DONE }], api: null, variants: [chipSpecimen, chipOn], variantCss: css };

const brief = parseFeatureMd(`---
wave: 1
feature: signup
name: Sign up
screens:
  about-you: { title: About you }
  done: { title: Done }
fields:
  lead/name: { type: string, validate: required, sample: Ada Lovelace }
  lead/role: { type: enum, validate: required, options: [Founder, Other], sample: Founder }
---
`).feature;

describe("the Gherkin parser", () => {
  it("reads features, backgrounds and scenarios, with And and But taking the step before's keyword", () => {
    const { feature, problems } = parseFeature(`@tag\nFeature: Sign up\n  Some words.\n  Background:\n    Given I open the "a" screen\n  Scenario: One\n    When I click "a.DS.button.go"\n    And I click "a.DS.button.again"\n    Then I am on the "b" screen\n    But "b.DS.text.x" is hidden\n`);
    expect(problems).toEqual([]);
    expect(feature.background.map((s) => s.keyword)).toEqual(["Given"]);
    expect(feature.scenarios[0].steps.map((s) => s.keyword)).toEqual(["When", "When", "Then", "Then"]);
  });
});

describe.skipIf(!existsSync(CHROMIUM))("a run against the prototype", () => {
  const run = async (gherkin: string) => {
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    try {
      const target = new PrototypeTarget(await browser.newPage(), bundle);
      return await runFeature(gherkin, target, { timeout: 2_000 });
    } finally {
      await browser.close();
    }
  };

  it("plays the generated happy path through the screens, carrying what was typed", async () => {
    const gherkin = flowGherkin({ feature: "Sign up", screens: bundle.screens.map((s) => ({ ...s, name: s.slug })), brief }).text;
    const r = await run(`${gherkin}\n  Scenario: Back\n    Given I open the "about-you" screen\n    When I fill "about-you.form.DS.textField.full-name" with "Grace"\n    And I choose "about-you.form.DS.chip.other"\n    And I click "about-you.form.DS.button.continue"\n    Then I am on the "done" screen\n    And "done.DS.heading.thanks" shows "Grace"\n    When I click "done.DS.button.back"\n    Then I am on the "about-you" screen\n`);
    expect(r.scenarios.map((s) => [s.name, s.passed, s.steps.filter((x) => x.status !== "passed").map((x) => x.error)])).toEqual([
      ["Happy path", true, []],
      ["Back", true, []],
    ]);
    expect(r.passed).toBe(true);
  }, 60_000);

  it("fails at the first step that does not hold, skips the rest, and says why", async () => {
    const r = await run(`Feature: Sign up\n  Scenario: Wrong\n    Given I open the "about-you" screen\n    When I click "about-you.form.DS.button.continue"\n    Then I am on the "done" screen\n    And I click "done.DS.button.back"\n  Scenario: Unknown\n    Given I open the "about-you" screen\n    When I press "about-you.form.DS.button.continue"\n`);
    expect(r.passed).toBe(false);
    expect(r.failed).toBe(2);
    const wrong = r.scenarios[0].steps;
    // Continue with nothing filled: the prototype validates and stays.
    expect(wrong[2]).toMatchObject({ status: "failed", error: 'On the "about-you" screen, not "done".' });
    expect(wrong[3].status).toBe("skipped");
    expect(r.scenarios[1].steps[1].error).toBe(`"I press \"about-you.form.DS.button.continue\"" is not one of Wave's steps.`);
    expect(runReport(r)).toContain("**Failed.** 2 of 6 steps failed");
  }, 60_000);
});

describe.skipIf(!existsSync(CHROMIUM))("a run against a built app", () => {
  it("runs the same Gherkin on the app's routes, and checks the app carries every test id", async () => {
    const { createServer } = await import("node:http");
    // A tiny "built app": the same test ids, its own markup, real navigation.
    const pages: Record<string, string> = {
      "/start": `<html><body><main data-testid="about-you"><form action="/done" method="get" data-testid="about-you.form">
        <label data-testid="about-you.form.DS.textField.full-name">Name <input name="n"></label>
        <label data-testid="about-you.form.DS.chip.founder"><input type="radio" name="r" value="Founder">Founder</label>
        <label data-testid="about-you.form.DS.chip.other"><input type="radio" name="r" value="Other">Other</label>
        <button data-testid="about-you.form.DS.button.continue">Continue</button></form></main></body></html>`,
      "/done": `<html><body><main data-testid="done"><h1 data-testid="done.DS.heading.thanks">Thanks</h1></main></body></html>`,
    };
    const server = createServer((req, res) => {
      const body = pages[(req.url ?? "/").split("?")[0]];
      res.writeHead(body ? 200 : 404, { "content-type": "text/html" }).end(body ?? "");
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    try {
      const gherkin = flowGherkin({ feature: "Sign up", screens: bundle.screens.map((s) => ({ ...s, name: s.slug })), brief }).text;
      const target = new AppTarget(await browser.newPage(), base, { "about-you": "/start", done: "/done" });
      const r = await runFeature(gherkin, target, { timeout: 3_000 });
      expect(r.scenarios[0].steps.filter((s) => s.status !== "passed")).toEqual([]);

      // The design's Back button is not in this app: the handover check says so.
      const ids = await checkIds(await browser.newPage(), base, [
        { slug: "about-you", route: "/start", html: ABOUT },
        { slug: "done", route: "/done", html: DONE },
      ]);
      expect(ids.pass).toBe(false);
      expect(ids.screens.find((s) => s.screen === "done")?.missing).toEqual(["done.DS.button.back"]);
      expect(ids.screens.find((s) => s.screen === "about-you")?.missing).toEqual([]);
    } finally {
      await browser.close();
      server.close();
    }
  }, 60_000);
});
