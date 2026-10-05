import { describe, expect, it } from "vitest";
import { assignTestIds, featureFile, featureFromPage, featurePage, flowGherkin, OWN_SCENARIOS, parseFeatureMd } from "../src";

const page = (slug: string, body: string) =>
  assignTestIds(`<!doctype html><html><head><meta name="wave:screen" content="${slug}"></head><body><main>${body}</main></body></html>`, slug).html;

const ABOUT = page(
  "about-you",
  `<form data-figma-name="Form">
    <div data-wave-component="Text field" data-wave-field="lead/name"><p>Full name</p><input type="text"></div>
    <div role="radiogroup" aria-label="Role" data-wave-field="lead/role">
      <label data-wave-component="Chip"><input type="radio" name="r" value="Founder"><p>Founder</p></label>
      <label data-wave-component="Chip"><input type="radio" name="r" value="Other"><p>Other</p></label>
    </div>
    <div data-wave-component="Text field" data-wave-field="lead/roleOther" data-wave-visible-if="lead/role == Other"><p>Your role</p><input type="text"></div>
    <div data-wave-component="Select"><p>Size</p><button type="button" aria-label="Size" data-wave-role="select" data-wave-field="lead/size"><p>Pick</p></button></div>
    <button data-wave-component="Button" data-wave-to="screen:done" data-wave-trigger="submit"><span>Continue</span></button>
  </form>`,
);
const DONE = page("done", `<div data-wave-component="Button" data-wave-to="screen:about-you"><p>Start again</p></div><h1>Thanks</h1>`);
const screens = [
  { slug: "about-you", name: "About you", html: ABOUT },
  { slug: "done", name: "Done", html: DONE },
];
const brief = (samples: boolean) =>
  parseFeatureMd(`---
wave: 1
feature: signup
name: Sign up
screens:
  about-you: { title: About you }
  done: { title: Done }
fields:
  lead/name: { type: string, validate: required${samples ? ", sample: Ada Lovelace" : ""} }
  lead/role: { type: enum, validate: required, options: [Founder, Other]${samples ? ", sample: Founder" : ""} }
  lead/roleOther: { type: string, validate: required, visible-if: lead/role == Other }
  lead/size: { type: enum, validate: optional${samples ? ", sample: 11–50" : ""} }
---
`).feature;

describe("the feature's Gherkin", () => {
  it("walks the happy path, filling every field with its sample, by test id", () => {
    const r = flowGherkin({ feature: "Sign up", screens, brief: brief(true) });
    expect(r.gaps).toEqual([]);
    expect(r.path).toEqual(["about-you", "done"]);
    expect(r.text).toBe(`Feature: Sign up

  Scenario: Happy path
    Given I open the "about-you" screen
    When I fill "about-you.form.DS.textField.full-name" with "Ada Lovelace"
    And I choose "about-you.form.DS.chip.founder"
    And I pick "11–50" in "about-you.form.DS.select.size"
    And I click "about-you.form.DS.button.continue"
    Then I am on the "done" screen
`);
  });

  it("never invents a value: a required field without a sample is a gap, and the path stops there", () => {
    const r = flowGherkin({ feature: "Sign up", screens, brief: brief(false) });
    expect(r.gaps.map((g) => g.message)).toEqual(["lead/name is required and has no sample in FEATURE.md.", "lead/role is required and has no sample in FEATURE.md."]);
    expect(r.text).not.toContain("I click");
    expect(r.text).toContain("# Not complete:");
  });

  it("says when a sample is not one of the drawn choices", () => {
    const b = brief(true);
    b.fields.get("lead/role")!.sample = "CEO";
    expect(flowGherkin({ feature: "Sign up", screens, brief: b }).gaps[0].message).toBe('The sample "CEO" for lead/role is not one of its drawn choices (Founder, Other).');
  });

  it("keeps scenarios people added after the marker line", () => {
    const r = flowGherkin({ feature: "Sign up", screens, brief: brief(true) });
    const first = featurePage(r, null);
    const edited = first.replace(`${OWN_SCENARIOS}\n`, `${OWN_SCENARIOS}\n\n  Scenario: Start again\n    Given I open the "done" screen\n    When I click "done.DS.button.start-again"\n    Then I am on the "about-you" screen\n`);
    const again = featureFromPage(featurePage(r, edited))!;
    expect(again).toContain("Scenario: Happy path");
    expect(again).toContain("Scenario: Start again");
    expect(again.match(/Scenario: Happy path/g)).toHaveLength(1);
  });

  it("writes flow.feature as a plain Gherkin file, keeping people's scenarios, also from the Markdown page it replaces", () => {
    const r = flowGherkin({ feature: "Sign up", screens, brief: brief(true) });
    const file = featureFile(r, null);
    expect(file).not.toContain("```");
    expect(file.split("\n")[0]).toMatch(/^# Written by Wave/);
    expect(file).toMatch(/^Feature: Sign up$/m);
    expect(featureFromPage(file)).toBe(file);
    const mine = `\n  Scenario: Start again\n    Given I open the "done" screen\n`;
    // From the Markdown page a feature had before, and from the file itself.
    const fromPage = featureFile(r, featurePage(r, null).replace(`${OWN_SCENARIOS}\n`, `${OWN_SCENARIOS}\n${mine}`));
    const fromFile = featureFile(r, file.replace(`${OWN_SCENARIOS}\n`, `${OWN_SCENARIOS}\n${mine}`));
    for (const f of [fromPage, fromFile]) {
      expect(f).toContain("Scenario: Start again");
      expect(f.match(/Scenario: Happy path/g)).toHaveLength(1);
      expect(f.match(/# Written by Wave/g)).toHaveLength(1);
    }
  });
});
