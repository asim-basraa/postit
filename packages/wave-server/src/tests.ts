import { featureFromPage, featurePage, flowGherkin, parseMockup, screenSlug, type GherkinGap } from "@wave/spec";
import type { HostResult, WaveHost } from "./host";
import { featureBrief } from "./project";

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
