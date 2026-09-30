import { describe, expect, it } from "vitest";
import {
  applyAnswers,
  designMdTemplate,
  dryRun,
  evaluateScreen,
  featureMdTemplate,
  groupQuestions,
  missingDesignSections,
  parseDesignMd,
  parseFeatureMd,
  parseMockup,
  parseSheet,
  renderQuestionSheet,
} from "../src";

const DESIGN = `---
wave: 1
name: Keel
lang: en
viewports: [390, 1280]
access: public
icons: inline
content:
  copy: final
  source: code
analytics:
  controls: none
  page-views: none
flags: none
responsive: stack
forms:
  validate-on: submit
  dirty-guard: off
data:
  empty: hide
  overflow: wrap
---

# Keel design

## Product

A studio.
`;

const FEATURE = `---
wave: 1
feature: lead-qualification
name: Lead qualification
screens:
  about-you: { title: About you, route: /start, access: public }
fields:
  lead/name: { type: string, validate: required, label: Full name }
  lead/role: { type: enum, validate: required, options: [Founder, Other], default: none }
  lead/roleOther: { validate: required, visible-if: lead/role == Other }
data:
  lead/firstName: { type: string, source: the saved lead, description: First name }
actions:
  lead/save-about:
    screen: about-you
    trigger: submit
    effect: api/leads/save
    to: screen:your-project
    failure: node:about-you/error-count
---

# Lead qualification
`;

const SCREEN = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>About you</title>
<meta name="wave:spec" content="1"><meta name="wave:screen" content="about-you"><meta name="wave:flow" content="lead-qualification"></head><body>
<form data-wave-id="n_form">
  <h1 data-wave-id="n_head">First, who are we talking to?</h1>
  <p data-wave-id="n_hi">Hello <span data-wave-id="n_first" data-wave-bind="lead/firstName">Maya</span></p>
  <label for="f-name" data-wave-id="n_lab">Full name</label>
  <input id="f-name" name="name" type="text" data-wave-id="n_name" data-wave-field="lead/name">
  <p data-wave-id="n_nerr" data-wave-state-of="n_name" data-wave-state="error" hidden>Add your name.</p>
  <fieldset role="radiogroup" aria-label="Your role" data-wave-id="n_role" data-wave-field="lead/role">
    <div data-wave-id="n_chips" class="k-chip-group">
      <button type="button" role="radio" aria-checked="false" data-wave-id="n_c1">Founder</button>
      <button type="button" role="radio" aria-checked="false" data-wave-id="n_c2">Other</button>
    </div>
  </fieldset>
  <span data-wave-id="n_count" data-wave-slug="error-count"></span>
  <button type="submit" data-wave-id="n_go"><span data-wave-id="n_go_t">Continue</span></button>
  <button type="submit" data-wave-id="n_go2"><span data-wave-id="n_go2_t">Continue</span></button>
</form>
</body></html>`;

describe("DESIGN.md", () => {
  it("reads the defaults from the front matter", () => {
    const b = parseDesignMd(DESIGN);
    expect(b.problems).toEqual([]);
    expect(b.design.viewports).toBe("390 1280");
    expect(b.design.copy).toBe("final");
    expect(b.design.validateOn).toBe("submit");
    expect(b.design.dirtyGuard).toBe("off");
    expect(missingDesignSections(b)).toContain("Voice and copy");
  });

  it("says what is wrong or missing", () => {
    expect(parseDesignMd("# no front matter").problems[0].message).toMatch(/No front matter/);
    const b = parseDesignMd("---\nname: X\ncontent:\n  copy: maybe\nforms:\n  validate-on: never\n---\n");
    expect(b.problems.map((p) => p.path)).toEqual(expect.arrayContaining(["content.copy", "forms.validate-on", "lang", "viewports"]));
  });

  it("has a template that parses cleanly", () => {
    const b = parseDesignMd(designMdTemplate("Acme"));
    expect(b.problems).toEqual([]);
    expect(missingDesignSections(b)).toEqual([]);
  });
});

describe("FEATURE.md", () => {
  it("reads screens, fields, data and actions", () => {
    const { feature, problems } = parseFeatureMd(FEATURE);
    expect(problems).toEqual([]);
    expect(feature.screens[0]).toMatchObject({ slug: "about-you", route: "/start" });
    expect(feature.fields.get("lead/role")?.options).toBe("Founder | Other");
    expect(feature.actions[0]).toMatchObject({ id: "lead/save-about", trigger: "submit", failure: "node:about-you/error-count" });
  });

  it("rejects bad destinations and paths", () => {
    const { problems } = parseFeatureMd("---\nscreens:\n  a: {}\nfields:\n  'bad path!': {}\nactions:\n  x: { to: 'somewhere', trigger: tap }\n---\n");
    expect(problems.map((p) => p.path)).toEqual(expect.arrayContaining(["fields.bad path!", "actions.x.to", "actions.x.trigger"]));
  });

  it("has a template that parses", () => {
    expect(parseFeatureMd(featureMdTemplate("checkout", "Checkout")).problems).toEqual([]);
  });
});

describe("inheritance", () => {
  const parsed = parseMockup(SCREEN);
  const bare = evaluateScreen(parsed, "about-you", { html: SCREEN });
  const full = evaluateScreen(parsed, "about-you", { html: SCREEN, design: parseDesignMd(DESIGN).design, feature: parseFeatureMd(FEATURE).feature });
  const q = (r: typeof full, qid: string) => r.requirements.find((x) => x.qid === qid);

  it("answers far more with the briefs than without", () => {
    expect(full.counts.mandatoryOpen).toBeLessThan(bare.counts.mandatoryOpen / 3);
  });

  it("names every element without asking", () => {
    expect(q(bare, "about-you/n_name/slug")).toMatchObject({ status: "answered", source: "auto", value: "name" });
    expect(q(bare, "about-you/n_go2/slug")?.value).toBe("continue-2");
  });

  it("takes fixed-text defaults from DESIGN.md", () => {
    expect(q(full, "about-you/n_head/content")).toMatchObject({ status: "answered", source: "design", value: "static" });
    expect(q(full, "about-you/n_head/copy")).toMatchObject({ value: "final", source: "design" });
    expect(q(full, "about-you/screen/viewports")).toMatchObject({ value: "390 1280", source: "design" });
  });

  it("takes fields, data, screens and actions from FEATURE.md", () => {
    expect(q(full, "about-you/n_name/validate")).toMatchObject({ value: "required", source: "feature" });
    expect(q(full, "about-you/n_role/options")).toMatchObject({ value: "Founder | Other", source: "feature" });
    expect(q(full, "about-you/screen/route")).toMatchObject({ value: "/start", source: "feature" });
    expect(q(full, "about-you/resource/lead/firstName")?.status).toBe("answered");
    for (const pid of ["n_go", "n_go2"]) {
      expect(q(full, `about-you/${pid}/effect`)).toMatchObject({ value: "api/leads/save", source: "feature" });
      expect(q(full, `about-you/${pid}/to-failure`)?.value).toBe("node:about-you/error-count");
    }
  });

  it("reads chips as a choice group and a button's words as its label", () => {
    expect(full.elements.find((e) => e.pid === "n_chips")?.type).toBe("container");
    expect(full.elements.find((e) => e.pid === "n_c1")?.type).toBe("radio");
    expect(full.elements.find((e) => e.pid === "n_go_t")?.type).toBe("label");
    expect(q(full, "about-you/n_nerr/visible-if")).toBeUndefined();
  });

  it("writes brief answers and names into the HTML when answers are applied", () => {
    const res = applyAnswers(SCREEN, full.requirements, new Map());
    expect(res.html).toMatch(/data-wave-id="n_go"[^>]*data-wave-effect="api\/leads\/save"/);
    expect(res.html).toMatch(/data-wave-id="n_name"[^>]*data-wave-slug="name"/);
    expect(res.html).toContain('content="/start"');
    // DESIGN.md policy stays in DESIGN.md.
    expect(res.html).not.toMatch(/data-wave-copy=/);
  });
});

describe("grouped question sheet", () => {
  const html = SCREEN.replace(/<button type="submit" data-wave-id="n_go2">/, '<button type="submit" data-wave-id="n_go2" data-wave-effect="api/x">').replace(
    '<button type="submit" data-wave-id="n_go">',
    '<button type="submit" data-wave-id="n_go" data-wave-effect="api/x">',
  );
  const parsed = parseMockup(html);
  const r = evaluateScreen(parsed, "about-you", { html });
  const screens = [{ slug: "about-you", label: "draft", requirements: r.requirements, nodes: parsed.nodes }];

  it("asks one question for identical ones and spreads the answer", () => {
    const open = r.requirements.filter((x) => x.level === "mandatory" && (x.status === "missing" || x.status === "proposed"));
    const groups = groupQuestions(open);
    const failure = groups.find((g) => g.items[0].field === "to-failure");
    expect(failure?.items.map((i) => i.pid)).toEqual(["n_go", "n_go2"]);
    const sheet = renderQuestionSheet("Lead", 1, screens, dryRun(screens, new Map()));
    expect(sheet).toContain("Applies to: `about-you/n_go/to-failure`, `about-you/n_go2/to-failure`");
    expect(sheet).not.toContain("[x]");
    const filled = sheet.replace(/(`group\/to-failure\/\d+`[\s\S]*?Answer:)[^\n]*/, "$1 node:about-you/error-count");
    const answers = parseSheet(filled);
    expect(answers.get("about-you/n_go/to-failure")).toBe("node:about-you/error-count");
    expect(answers.get("about-you/n_go2/to-failure")).toBe("node:about-you/error-count");
  });

  it("hides optional questions unless asked", () => {
    const run = dryRun(screens, new Map());
    expect(renderQuestionSheet("Lead", 1, screens, run)).toMatch(/optional questions are not shown/);
    expect(renderQuestionSheet("Lead", 1, screens, run, { recommended: true })).toContain("## Optional");
  });
});
