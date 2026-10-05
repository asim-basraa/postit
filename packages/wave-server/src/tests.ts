import type { PrototypeApi } from "@wave/prototype";
import { featureFile, featureFromPage, flowGherkin, parseMockup, screenSlug, startScreen, type GherkinGap, type SpecimenVariant } from "@wave/spec";
import type { HostResult, WaveHost } from "./host";
import { featureBrief } from "./project";
import { prototypeOf } from "./prototype";

/**
 * A feature's end-to-end tests, as the host keeps them: in the feature's tests/
 * folder the Gherkin (flow-feature, a .feature file), the testing instructions,
 * the run reports and the match with Figma; in its catalogue/ folder each
 * screen's elements and test ids as a tree (JSON), written when screens are
 * published.
 */

export const TESTS_FOLDER = "tests";
export const CATALOGUE_FOLDER = "catalogue";
export const FEATURE_TEST_PAGE = "flow-feature";
export const TESTING_PAGE = "testing";
export const REPORT_PAGE = "e2e-report";
export const FIDELITY_PAGE = "fidelity-report";

/**
 * The feature's testing instructions: what its end-to-end tests are, where
 * each file they use is, and how to run them. In Post-it the paths are pages in
 * the feature; in a handover, files in the zip.
 */
export function testingGuide(input: { feature: string; screens: { slug: string; name: string }[]; where: "host" | "handover" }): string {
  const h = input.where === "handover";
  const gherkin = h ? "`tests/flow.feature`" : "`tests/flow-feature` (flow.feature)";
  const json = (slug: string) => (h ? `\`${CATALOGUE_FOLDER}/${slug}.json\`` : `\`${CATALOGUE_FOLDER}/${slug}\` (${slug}.json)`);
  const lines = [
    `How ${input.feature} is tested end to end, and where everything the tests use is. Written by Wave each time the feature is published.`,
    "",
    "## The files",
    "",
    "| What | Where |",
    "| --- | --- |",
    `| The scenarios, in Gherkin: Wave's happy path and any you add after its marker line | ${gherkin} |`,
    ...input.screens.map((s) => `| ${s.name}: every section and design-system component on the screen, with its test id | ${json(s.slug)} |`),
    ...(h ? [] : [
      "| The last run against the prototype | `tests/e2e-report` |",
      "| The last run against the built app | `tests/e2e-report-app` |",
      "| Each screen's match with its Figma frame, at every publish | `tests/fidelity-report` |",
    ]),
    "",
    "## Test ids",
    "",
    "Every screen root, section and design-system component carries a `data-testid`: `<screen>.<section>.<DS id>.<label>`, for example `about-you.form.DS.button.continue`. The scenarios find elements only by these ids, so the same scenarios run the prototype and the built app. The built app puts the same `data-testid` on the element that builds each one.",
    "",
    "## The catalogue JSON",
    "",
    "One file per screen: a tree of the screen's elements, as Wave Test and Wave Build read them.",
    "",
    "```json",
    "{",
    '  "testId": "about-you",',
    '  "kind": "screen",',
    '  "children": [',
    "    {",
    '      "testId": "about-you.form",',
    '      "kind": "section",',
    '      "children": [',
    "        {",
    '          "testId": "about-you.form.DS.button.continue",',
    '          "kind": "component",',
    '          "component": "Button",',
    '          "ds": "DS.primaryYesButton",',
    '          "variant": "primary-yes",',
    '          "action": "lead/save-about",',
    '          "to": "screen:your-project",',
    '          "figma": "28:1053",',
    '          "waveId": "n_51eyutse"',
    "        }",
    "      ]",
    "    }",
    "  ]",
    "}",
    "```",
    "",
    "| Key | What it is |",
    "| --- | --- |",
    "| `testId` | The element's `data-testid` |",
    "| `kind` | `screen`, `section` or `component` |",
    "| `component`, `ds`, `variant`, `state` | The design-system component, its id, the variant and the state it is drawn in |",
    "| `field`, `options` | The field a control writes (FEATURE.md) and the choices it offers |",
    "| `action`, `to` | What a control does and where it leads (`screen:<slug>`, `url:...`, `back`) |",
    "| `partOf` | The component this one is drawn inside (a segment in a segmented control) |",
    "| `figma`, `waveId` | The Figma layer it came from, and its Wave id (comments and answers point at it) |",
    "| `children` | The elements inside it |",
    "",
    "## Run the tests",
    "",
    "Ask Claude: \"Run Wave Test on " + input.feature + "\" (the Wave Test skill). It plays the scenarios against the prototype (what approving the feature waits for) or against the built app at an address, records the run and writes the report. Or, from a command line with Node 20+ and Playwright with Chromium: `wave-test run --link <upload link> --feature <feature id> --target prototype --record`.",
    "",
    "A run counts for the versions it played: when a screen or the Gherkin changes, run it again.",
    "",
  ];
  return lines.join("\n");
}

/** Every screen of a feature as it is now, with its slug. */
export async function featureScreens(host: WaveHost, flowId: string): Promise<{ pageId: string; slug: string; name: string; html: string; version: number }[]> {
  const out: { pageId: string; slug: string; name: string; html: string; version: number }[] = [];
  for (const m of (await host.resources.members(flowId)).filter((x) => x.kind === "screen")) {
    const screen = await host.resources.screen(m.id);
    const html = screen ? await host.resources.readCurrent(screen) : null;
    if (!screen || html === null) continue;
    out.push({ pageId: m.id, slug: screenSlug({ meta: parseMockup(html).screen, name: m.name }), name: m.name, html, version: screen.content_version });
  }
  return out;
}

/**
 * Writes (or rewrites) the feature's Gherkin from its screens and FEATURE.md.
 * Scenarios people added after the marker line are kept.
 */
export async function writeFlowFeature(host: WaveHost, flowId: string): Promise<HostResult<{ id: string; steps: number; gaps: GherkinGap[]; path: string[] }>> {
  if (!host.documents) return { ok: false, error: "This host does not keep feature documents.", status: 501 };
  const flow = await host.resources.flow(flowId);
  if (!flow) return { ok: false, error: "Not found.", status: 404 };
  const screens = await featureScreens(host, flowId);
  const brief = await featureBrief(host, flowId);
  const generated = flowGherkin({ feature: brief?.name ?? flow.name, screens, brief });
  const previous = await host.documents.read(flowId, FEATURE_TEST_PAGE, TESTS_FOLDER);
  const w = await host.documents.write(flowId, FEATURE_TEST_PAGE, featureFile(generated, previous?.content ?? null), "feature", TESTS_FOLDER);
  if (!w.ok) return w;
  return { ok: true, id: w.id, steps: generated.steps, gaps: generated.gaps, path: generated.path };
}

/** The feature's Gherkin as it stands, with the page it is on. */
export async function readFlowFeature(host: WaveHost, flowId: string): Promise<{ id: string; version: number; gherkin: string } | null> {
  if (!host.documents) return null;
  const page = await host.documents.read(flowId, FEATURE_TEST_PAGE, TESTS_FOLDER);
  if (!page) return null;
  const gherkin = featureFromPage(page.content);
  return gherkin === null ? null : { id: page.id, version: page.version, gherkin };
}

/** Everything Wave Test needs to run a feature's Gherkin against its prototype, or against the app. */
export type TestBundle = {
  feature: { id: string; name: string };
  gherkin: string | null;
  featureVersion: number | null;
  start: string | null;
  screens: { pageId: string; slug: string; name: string; route: string | null; version: number; html: string }[];
  api: PrototypeApi | null;
  variants: SpecimenVariant[];
  variantCss: string;
};

export async function testBundle(host: WaveHost, flowId: string): Promise<TestBundle | null> {
  const flow = await host.resources.flow(flowId);
  if (!flow) return null;
  const view = await prototypeOf(host, flowId);
  const screens = await featureScreens(host, flowId);
  const brief = await featureBrief(host, flowId);
  const page = await readFlowFeature(host, flowId);
  const routeOf = (slug: string, html: string) => brief?.screens.find((s) => s.slug === slug)?.route ?? parseMockup(html).screen.route ?? null;
  return {
    feature: { id: flowId, name: brief?.name ?? flow.name },
    gherkin: page?.gherkin ?? null,
    featureVersion: page?.version ?? null,
    start: startScreen(screens, brief),
    screens: screens.map((s) => ({ pageId: s.pageId, slug: s.slug, name: s.name, route: routeOf(s.slug, s.html), version: s.version, html: s.html })),
    api: view?.api ?? null,
    variants: view?.variants ?? [],
    variantCss: view?.variantCss ?? "",
  };
}

/**
 * Publishes a run's report in the feature's tests/ folder and records the run
 * at the versions the feature has now. Against the prototype, the run is what
 * approval waits for.
 */
export async function recordTestRun(
  host: WaveHost,
  flowId: string,
  run: {
    target: string;
    passed: boolean;
    steps: number;
    failed: number;
    report: string;
    /** The versions the run played (from its bundle): screen page id to version, and the Gherkin's. */
    ran?: { screens: Record<string, number>; feature: number | null };
  },
): Promise<HostResult<{ id: string; reportId: string | null; current: boolean }>> {
  if (!host.store.recordTestRun) return { ok: false, error: "This host does not record test runs.", status: 501 };
  if (!(await host.resources.canEdit(flowId))) return { ok: false, error: "You cannot change this feature.", status: 403 };
  // A run counts for the versions it played. If the feature changed meanwhile, it is not recorded.
  if (run.ran) {
    const now = await featureScreens(host, flowId);
    const page = await readFlowFeature(host, flowId);
    const same =
      now.length === Object.keys(run.ran.screens).length &&
      now.every((s) => run.ran!.screens[s.pageId] === s.version) &&
      (page?.version ?? null) === run.ran.feature;
    if (!same) return { ok: false, error: "The feature changed while the tests ran (a screen or the Gherkin has a newer version). Run Wave Test again.", status: 409 };
  }
  const target = run.target.trim() || "prototype";
  let reportId: string | null = null;
  if (host.documents && run.report.trim()) {
    const w = await host.documents.write(flowId, target === "prototype" ? REPORT_PAGE : `${REPORT_PAGE}-app`, run.report, "article", TESTS_FOLDER);
    if (w.ok) reportId = w.id;
  }
  const r = await host.store.recordTestRun(flowId, { target, passed: run.passed, steps: run.steps, failed: run.failed, reportId });
  if (!r.ok) return r;
  const latest = host.store.latestTestRun ? await host.store.latestTestRun(flowId, target) : null;
  return { ok: true, id: r.id, reportId, current: latest?.current ?? true };
}
