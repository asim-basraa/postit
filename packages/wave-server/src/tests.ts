import type { PrototypeApi } from "@wave/prototype";
import { featureFromPage, featurePage, flowGherkin, parseMockup, screenSlug, startScreen, type GherkinGap, type SpecimenVariant } from "@wave/spec";
import type { HostResult, WaveHost } from "./host";
import { featureBrief } from "./project";
import { prototypeOf } from "./prototype";

/**
 * A feature's end-to-end tests, as the host keeps them in the feature's tests/
 * folder: each screen's test ids as a tree (written when screens are
 * published), the Gherkin (flow-feature), and the last run's report.
 */

export const TESTS_FOLDER = "tests";
export const FEATURE_TEST_PAGE = "flow-feature";
export const REPORT_PAGE = "e2e-report";

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
  const w = await host.documents.write(flowId, FEATURE_TEST_PAGE, featurePage(generated, previous?.content ?? null), "article", TESTS_FOLDER);
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
