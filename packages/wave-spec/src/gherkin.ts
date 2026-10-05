import { attrOf, isElement, parseDocument, walk, type Element } from "./parse";
import { parseDestination, targetScreen } from "./destination";
import type { FeatureBrief } from "./briefs";
import { TESTID_ATTR } from "./testids";

/**
 * A feature's end-to-end scenario, written from its screens and FEATURE.md.
 *
 * The happy path: from the screen nothing leads to, every required field
 * filled with its FEATURE.md sample, each forward action clicked, each screen
 * arrived at, to the last. Every step names an element by its test id, so the
 * same scenario runs the prototype and the built app.
 *
 * Wave writes only what the design and the brief say. A required field with no
 * sample, or a sample that is not one of the drawn choices, is a gap: the
 * scenario stops short of it and says so, for the FEATURE.md interview.
 */

export type GherkinScreen = { slug: string; name: string; html: string };

export type GherkinGap = { screen: string; field: string | null; message: string };

export type GherkinResult = { text: string; steps: number; gaps: GherkinGap[]; path: string[] };

/** The line after which scenarios people add are kept when Wave writes the happy path again. */
export const OWN_SCENARIOS = "# Your scenarios (kept when Wave writes the happy path again)";

const w = (el: Element, key: string) => attrOf(el, `data-wave-${key}`) ?? attrOf(el, `data-pi-${key}`);
const q = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
const parentOf = (el: Element): Element | null => (el.parentNode && isElement(el.parentNode) ? el.parentNode : null);

function ancestors(el: Element): Element[] {
  const out: Element[] = [];
  for (let p: Element | null = el; p; p = parentOf(p)) out.push(p);
  return out;
}

/** Hidden when the screen opens: drawn hidden, a state, or shown only on a condition. */
const hiddenAtStart = (el: Element) =>
  ancestors(el).some((a) => attrOf(a, "hidden") !== null || !!w(a, "visible-if") || !!w(a, "state-of") || ((w(a, "state") ?? "default") !== "default" && !w(a, "component")));

/** The test id an element is reached by: its own, or its component's. */
function testIdOf(el: Element): string | null {
  for (const a of ancestors(el)) {
    const t = attrOf(a, TESTID_ATTR);
    if (t && t.includes(".DS.")) return t;
  }
  return null;
}

const isTextControl = (el: Element) =>
  el.tagName === "textarea" || (el.tagName === "input" && !["radio", "checkbox", "hidden", "submit", "button"].includes(attrOf(el, "type") ?? "text"));
const isSelect = (el: Element) => w(el, "role") === "select" || attrOf(el, "aria-haspopup") === "listbox";

function choiceValue(input: Element): string {
  const v = attrOf(input, "value");
  if (v && v !== "on") return v;
  const label = ancestors(input).find((a) => a.tagName === "label");
  return label ? text(label) : "";
}

function text(el: Element): string {
  let s = "";
  for (const d of walk(el)) for (const c of d.childNodes) if (c.nodeName === "#text" && "value" in c) s += ` ${c.value}`;
  for (const c of el.childNodes) if (c.nodeName === "#text" && "value" in c) s += ` ${c.value}`;
  return s.replace(/\s+/g, " ").trim();
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

type Planned = { steps: string[]; gaps: GherkinGap[]; next: string | null };

/** One screen's steps: its fields in order, then the action that goes forward. */
function screenSteps(screen: GherkinScreen, brief: FeatureBrief | null, slugs: string[], visited: Set<string>): Planned {
  const doc = parseDocument(screen.html);
  const all = [...walk(doc)];
  const steps: string[] = [];
  const gaps: GherkinGap[] = [];
  const done = new Set<string>();

  for (const el of all) {
    const path = w(el, "field");
    if (!path || done.has(path) || hiddenAtStart(el)) continue;
    done.add(path);
    const spec = brief?.fields.get(path) ?? null;
    const validate = `${spec?.validate ?? ""};${w(el, "validate") ?? ""}`;
    const required = /(^|;)\s*required/.test(validate);
    const sample = spec?.sample ?? null;
    if (!sample) {
      if (required) gaps.push({ screen: screen.slug, field: path, message: `${path} is required and has no sample in FEATURE.md.` });
      continue;
    }
    const inputs = [el, ...walk(el)].filter((d) => d.tagName === "input" && ["radio", "checkbox"].includes(attrOf(d, "type") ?? ""));
    if (isSelect(el)) {
      const tid = testIdOf(el);
      if (!tid) gaps.push({ screen: screen.slug, field: path, message: `The select for ${path} has no test id.` });
      else steps.push(`When I pick "${q(sample)}" in "${tid}"`);
    } else if (inputs.length) {
      for (const want of sample.split(",").map((s) => s.trim()).filter(Boolean)) {
        const input = inputs.find((i) => same(choiceValue(i), want));
        const tid = input ? testIdOf(input) : null;
        if (!input) gaps.push({ screen: screen.slug, field: path, message: `The sample "${want}" for ${path} is not one of its drawn choices (${inputs.map(choiceValue).join(", ")}).` });
        else if (!tid) gaps.push({ screen: screen.slug, field: path, message: `The choice "${want}" for ${path} has no test id.` });
        else steps.push(`When I choose "${tid}"`);
      }
    } else {
      const control = isTextControl(el) ? el : [...walk(el)].find(isTextControl);
      const tid = control ? testIdOf(control) : null;
      if (!control) gaps.push({ screen: screen.slug, field: path, message: `${path} has no field to type into.` });
      else if (!tid) gaps.push({ screen: screen.slug, field: path, message: `The field for ${path} has no test id.` });
      else steps.push(`When I fill "${tid}" with "${q(sample)}"`);
    }
  }

  // Forward: an action to a screen not yet visited. A submit in the form first, then the last one drawn.
  const forward = all
    .filter((el) => !hiddenAtStart(el))
    .map((el) => {
      let to = w(el, "to");
      const action = w(el, "action");
      if (!to && action && brief) to = brief.actions.find((a) => a.id === action.replace(/^action\//, ""))?.to ?? null;
      if (!to) return null;
      const target = targetScreen(parseDestination(to), screen.slug);
      if (!target || target === screen.slug || !slugs.includes(target) || visited.has(target)) return null;
      const submit = w(el, "trigger") === "submit" || attrOf(el, "type") === "submit" || ancestors(el).some((a) => a.tagName === "form");
      return { el, target, submit };
    })
    .filter((x): x is { el: Element; target: string; submit: boolean } => !!x);
  const pick = forward.filter((f) => f.submit).pop() ?? forward.pop() ?? null;
  if (!pick) return { steps, gaps, next: null };
  const tid = testIdOf(pick.el);
  if (!tid) {
    gaps.push({ screen: screen.slug, field: null, message: `The action that goes to ${pick.target} has no test id.` });
    return { steps, gaps, next: null };
  }
  // A gap before the action means the screen would refuse it: stop here.
  if (gaps.length) return { steps, gaps, next: null };
  steps.push(`When I click "${tid}"`, `Then I am on the "${pick.target}" screen`);
  return { steps, gaps, next: pick.target };
}

/** The screen a feature starts on: the one nothing leads forward to, else the brief's first. */
export function startScreen(screens: GherkinScreen[], brief: FeatureBrief | null): string | null {
  const slugs = screens.map((s) => s.slug);
  const incoming = new Set<string>();
  for (const s of screens) {
    for (const el of walk(parseDocument(s.html))) {
      const to = w(el, "to");
      if (!to) continue;
      const t = targetScreen(parseDestination(to), s.slug);
      if (t && t !== s.slug && slugs.includes(t)) incoming.add(t);
    }
  }
  const order = brief?.screens.length ? brief.screens.map((s) => s.slug).filter((s) => slugs.includes(s)) : slugs;
  return order.find((s) => !incoming.has(s)) ?? order[0] ?? null;
}

/** The feature's happy path as Gherkin, with what keeps it from being complete. */
export function flowGherkin(input: { feature: string; screens: GherkinScreen[]; brief: FeatureBrief | null; start?: string | null }): GherkinResult {
  const slugs = input.screens.map((s) => s.slug);
  const start = input.start ?? startScreen(input.screens, input.brief);
  const lines = [`Feature: ${input.feature}`, "", "  Scenario: Happy path"];
  const gaps: GherkinGap[] = [];
  const path: string[] = [];
  let steps = 0;
  if (start) {
    lines.push(`    Given I open the "${start}" screen`);
    steps++;
    const visited = new Set<string>();
    for (let at: string | null = start; at && !visited.has(at); ) {
      visited.add(at);
      path.push(at);
      const screen = input.screens.find((s) => s.slug === at);
      if (!screen) break;
      const r = screenSteps(screen, input.brief, slugs, visited);
      gaps.push(...r.gaps);
      for (const [i, s] of r.steps.entries()) lines.push(`    ${i === 0 || /^Then/.test(s) ? s : s.replace(/^(When|Then) /, "And ")}`);
      steps += r.steps.length;
      at = r.next;
    }
  }
  if (gaps.length) {
    lines.push("", "    # Not complete:");
    for (const g of gaps) lines.push(`    #   ${g.screen}: ${g.message}`);
  }
  return { text: lines.join("\n") + "\n", steps, gaps, path };
}

/**
 * The Gherkin in the feature's flow.feature: the file itself, or (in a feature
 * published before it was a file of its own) the first gherkin code block of a
 * Markdown page.
 */
export function featureFromPage(content: string): string | null {
  const m = /```gherkin\n([\s\S]*?)```/.exec(content);
  if (m) return m[1];
  return /^\s*(#|@|Feature:)/.test(content) && /^\s*Feature:/m.test(content) ? content : null;
}

/**
 * The feature's flow.feature file: plain Gherkin, Wave's happy path and any
 * scenarios people added after the marker line in the file before. What it is
 * and how complete it is are Gherkin comments at the top.
 */
export function featureFile(generated: GherkinResult, previous: string | null): string {
  const kept = previous ? (featureFromPage(previous) ?? "").split(OWN_SCENARIOS)[1] ?? "" : "";
  const note = generated.gaps.length
    ? `Not complete: ${generated.gaps.length} gap${generated.gaps.length === 1 ? "" : "s"}, listed at the end of the happy path and answered in FEATURE.md.`
    : `The happy path, ${generated.steps} steps through ${generated.path.join(", ")}.`;
  const head = [
    "# Written by Wave from the feature's screens and FEATURE.md each time the feature is published.",
    "# Steps name elements by test id; the same scenarios run the prototype and the built app.",
    "# Add your own scenarios after the marker line; Wave keeps them.",
    `# ${note}`,
    "",
  ].join("\n");
  const body = generated.text.replace(/^(#[^\n]*\n)+\n?/, "");
  return `${head}${body}\n${OWN_SCENARIOS}\n${kept.replace(/^\n+/, "")}`.replace(/\n{3,}$/, "\n\n").trimEnd() + "\n";
}

/**
 * The flow.feature page: Wave's happy path, and any scenarios people added
 * after the marker line in the page before.
 */
export function featurePage(generated: GherkinResult, previous: string | null): string {
  const kept = previous ? (featureFromPage(previous) ?? "").split(OWN_SCENARIOS)[1] ?? "" : "";
  const body = `${generated.text}\n${OWN_SCENARIOS}\n${kept.replace(/^\n+/, "")}`.replace(/\n{3,}$/, "\n\n");
  const note = generated.gaps.length
    ? `Not complete: ${generated.gaps.length} gap${generated.gaps.length === 1 ? "" : "s"} below, answered in FEATURE.md.`
    : `The happy path, ${generated.steps} steps through ${generated.path.join(", ")}.`;
  return [
    "Written by Wave from the feature's screens and FEATURE.md each time the feature is published. Steps name elements by test id; the same scenarios run the prototype and the built app. Add your own scenarios after the marker line; Wave keeps them.",
    "",
    note,
    "",
    "```gherkin",
    body.trimEnd(),
    "```",
    "",
  ].join("\n");
}
