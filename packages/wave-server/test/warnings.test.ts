import { describe, expect, it } from "vitest";
import { FEATURE_PAGE } from "@wave/spec";
import { catalogueOverview, editScreen, flowOverview, reportFor, warningsFor, warningsMarkdown, type WaveProjects } from "../src";
import { memoryHost } from "./memory-host";

const FEATURE = `---
wave: 1
feature: lead-qualification
name: Lead qualification
fields:
  lead/name: { type: string, validate: required, label: Full name }
---

# Lead qualification
`;

const SCREEN = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>About you</title>
<meta name="wave:spec" content="1"><meta name="wave:screen" content="about-you"></head><body>
<form data-wave-id="n_form">
  <h1 data-wave-id="n_head">Who are we talking to?</h1>
  <label for="f-name" data-wave-id="n_lab">Full name</label>
  <input id="f-name" name="name" type="text" data-wave-id="n_name" data-wave-field="lead/name">
  <button type="submit" data-wave-id="n_go">Continue</button>
</form>
</body></html>`;

function setup() {
  const m = memoryHost();
  m.flows.set("f1", { name: "Lead qualification", is_flow: true });
  m.files.set("s1", { name: "About you", html: SCREEN, version: 1, flow: "f1" });
  m.docs.set(`f1/${FEATURE_PAGE}`, { id: "fm", content: FEATURE, version: 1 });
  const projects: WaveProjects = {
    projectOf: async () => ({ id: "p1", name: "Keel", path: "keel" }),
    project: async (id) => (id === "p1" ? { id, name: "Keel", path: "keel" } : null),
    setProject: async () => ({ ok: true }),
    tokens: async () => null,
    specimens: async () => [],
    screens: async () => [{ ...(await m.host.resources.screen("s1"))!, flow_id: "f1" }],
    componentsFolder: async () => null,
  };
  m.host.projects = projects;
  return m;
}

describe("warnings", () => {
  it("counts the same everywhere, reading the screen's FEATURE.md", async () => {
    const { host } = setup();
    const catalogue = (await catalogueOverview(host, "p1"))!;
    const flow = (await flowOverview(host, "f1"))!;
    const list = (await warningsFor(host, "p1"))!;
    const n = list.screens[0].mandatory;
    expect(catalogue.screens[0].mandatoryOpen).toBe(n);
    expect(flow.screens[0].mandatoryOpen).toBe(n);
    expect(catalogue.warnings[0].mandatory).toBe(n);
    expect(flow.warnings[0].mandatory).toBe(n);
    // Without FEATURE.md the field's questions would count as open: the catalogue page used to do that.
    const without = reportFor(SCREEN, "About you", null, [], "s1", null);
    const answeredInBrief = "about-you/resource/lead/name";
    expect(without.requirements.find((r) => r.qid === answeredInBrief)?.status).toBe("missing");
    expect(list.screens[0].warnings.some((w) => w.qid === answeredInBrief)).toBe(false);
    expect(catalogue.warnings[0].warnings.some((w) => w.qid === answeredInBrief)).toBe(false);
    const md = warningsMarkdown(list.title, list.screens, (s, pid) => `https://host.test/review/${s}${pid ? `?node=${pid}` : ""}`);
    expect(md).toMatch(/# Warnings: Keel/);
    expect(md).toMatch(/https:\/\/host\.test\/review\/s1\?node=n_/);
  });

  it("lists what preflight finds in the file, such as a Figma screen with no match measured", async () => {
    const { host, files } = setup();
    files.get("s1")!.html = SCREEN.replace("<title>", '<meta name="figma-source" content="figma:f/1:2"><title>');
    const w = (await warningsFor(host, "f1"))!.screens[0];
    expect(w.warnings[0]).toMatchObject({ kind: "file", code: "fidelity", level: "mandatory" });
  });

  it("is answered on the screen, and the count goes down", async () => {
    const { host } = setup();
    const before = (await warningsFor(host, "s1"))!.screens[0];
    const q = before.warnings.find((w) => w.kind === "question" && w.level === "mandatory")!;
    const r = await editScreen(host, "s1", { op: "answers", version: before.version, answers: { [q.qid!]: `waive: not needed in this test` } });
    expect(r.ok).toBe(true);
    const after = (await warningsFor(host, "f1"))!.screens[0];
    expect(after.mandatory).toBe(before.mandatory - 1);
    expect(after.warnings.some((w) => w.qid === q.qid)).toBe(false);
  });
});
