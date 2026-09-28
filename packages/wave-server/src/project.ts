import {
  applyAnswers,
  catalogueUsage,
  dryRun,
  evaluateScreen,
  parseMockup,
  parseSheet,
  parseSpecimen,
  parseTokens,
  preflightHtml,
  renderAnswerSheet,
  renderQuestionSheet,
  screenSlug,
  validateTokenDocument,
  type Catalogue,
  type CatalogueComponent,
  type ParsedMockup,
  type PreflightReport,
  type Requirement,
  type ScreenRequirements,
  type TokenReport,
  type TokenSet,
} from "@wave/spec";
import type { WaveAsset, WaveHost, WaveProject, WaveScreen } from "./host";

/**
 * Everything Wave knows about a project: its tokens, its catalogue and where
 * its assets live, gathered once per request and used to check every screen.
 */

export type ProjectContext = {
  project: WaveProject;
  tokens: TokenSet | null;
  tokenReport: TokenReport | null;
  tokensPageId: string | null;
  catalogue: Catalogue | null;
  assetBase: string | null;
};

const cache = new WeakMap<WaveHost, Map<string, Promise<ProjectContext | null>>>();

export function projectContext(host: WaveHost, projectId: string): Promise<ProjectContext | null> {
  let m = cache.get(host);
  if (!m) cache.set(host, (m = new Map()));
  const hit = m.get(projectId);
  if (hit) return hit;
  const p = loadProjectContext(host, projectId);
  m.set(projectId, p);
  return p;
}

async function loadProjectContext(host: WaveHost, projectId: string): Promise<ProjectContext | null> {
  const projects = host.projects;
  if (!projects) return null;
  const project = await projects.project(projectId);
  if (!project) return null;
  const file = await projects.tokens(project.id);
  const tokenReport = file ? validateTokenDocument(file.content) : null;
  const tokens = file ? parseTokens(file.content) : null;

  const components: CatalogueComponent[] = [];
  for (const s of await projects.specimens(project.id)) {
    const html = await host.resources.readCurrent(s);
    if (!html) continue;
    const parsed = parseMockup(html);
    const def = parseSpecimen(html, parsed);
    if (def) components.push({ ...def, pageId: s.id, pagePath: s.path, version: s.content_version });
  }
  return {
    project,
    tokens,
    tokenReport,
    tokensPageId: file?.id ?? null,
    catalogue: components.length ? { components } : null,
    assetBase: host.assets ? host.assets.baseUrl(project.id) : null,
  };
}

/** The project context for a screen, feature or folder, or null outside a project. */
export async function contextFor(host: WaveHost, id: string): Promise<ProjectContext | null> {
  const project = host.projects ? await host.projects.projectOf(id) : null;
  return project ? projectContext(host, project.id) : null;
}

export type ScreenReport = ScreenRequirements & { parsed: ParsedMockup; slug: string };

/** One screen's requirements, checked against its project when it has one. */
export function reportFor(html: string, name: string, ctx: ProjectContext | null, others: { slug: string; id: string }[] = [], selfId?: string): ScreenReport {
  const parsed = parseMockup(html);
  const slug = screenSlug({ meta: parsed.screen, name });
  const report = evaluateScreen(
    parsed,
    slug,
    ctx
      ? { html, tokens: ctx.tokens, assetBase: ctx.assetBase, catalogue: parsed.screen.component ? undefined : ctx.catalogue }
      : { html },
  );
  const clash = others.find((o) => o.slug === slug && o.id !== selfId);
  if (clash && !parsed.screen.component) {
    report.requirements.push({
      qid: `${slug}/screen/unique-slug`,
      screen: slug,
      pid: null,
      address: slug,
      type: "screen",
      field: "unique-slug",
      label: "Screen slug is taken",
      question: `Another screen in this project is already called ${slug}. Give this one a different wave:screen.`,
      tab: "identity",
      owner: "design",
      level: "mandatory",
      status: "missing",
      value: null,
      proposal: null,
      waivedReason: null,
      write: { kind: "check" },
    });
    report.counts.mandatoryOpen++;
  }
  return { ...report, parsed, slug };
}

/** The slugs of every screen already in a project, for uniqueness and destinations. */
async function projectSlugs(host: WaveHost, projectId: string): Promise<{ id: string; slug: string; nodes: { id: string; slug: string | null }[] }[]> {
  if (!host.projects) return [];
  const out = [];
  for (const s of await host.projects.screens(projectId)) {
    const html = await host.resources.readCurrent(s);
    if (!html) continue;
    const parsed = parseMockup(html);
    out.push({ id: s.id, slug: screenSlug({ meta: parsed.screen, name: s.name }), nodes: parsed.nodes.map((n) => ({ id: n.id, slug: n.slug })) });
  }
  return out;
}

/** An uploaded screen's report, in its project's context. */
export async function screenReport(host: WaveHost, screen: WaveScreen, html?: string): Promise<ScreenReport | null> {
  const source = html ?? (await host.resources.readCurrent(screen));
  if (source === null) return null;
  const ctx = await contextFor(host, screen.id);
  const others = ctx ? await projectSlugs(host, ctx.project.id) : [];
  return reportFor(source, screen.name, ctx, others, screen.id);
}

// Catalogue --------------------------------------------------------------------------------

export type CatalogueOverview = {
  project: WaveProject;
  tokens: { pageId: string | null; count: number; typeCounts: TokenReport["typeCounts"]; problems: TokenReport["problems"] };
  components: (CatalogueComponent & { usage: UsageRow[] })[];
  /** Components used on screens that the catalogue does not have. */
  unknown: { component: string; usage: UsageRow[] }[];
  assets: (WaveAsset & { usedBy: { screenId: string; screen: string }[] })[];
  screens: { id: string; name: string; slug: string; flow_id: string | null; mandatoryOpen: number }[];
};

export type UsageRow = { screenId: string; screen: string; pid: string; address: string; component: string; variant: string; status: string };

export async function catalogueOverview(host: WaveHost, projectId: string): Promise<CatalogueOverview | null> {
  const ctx = await projectContext(host, projectId);
  if (!ctx || !host.projects) return null;
  const screens = await host.projects.screens(projectId);
  const slugs = await projectSlugs(host, projectId);
  const usage = new Map<string, UsageRow[]>();
  const assetUse = new Map<string, { screenId: string; screen: string }[]>();
  const screenRows: CatalogueOverview["screens"] = [];
  for (const s of screens) {
    const html = await host.resources.readCurrent(s);
    if (!html) continue;
    const r = reportFor(html, s.name, ctx, slugs, s.id);
    screenRows.push({ id: s.id, name: s.name, slug: r.slug, flow_id: s.flow_id, mandatoryOpen: r.counts.mandatoryOpen });
    for (const row of catalogueUsage(html, r.parsed, ctx.catalogue ?? { components: [] }, r.slug)) {
      const list = usage.get(row.component.toLowerCase()) ?? [];
      list.push({ screenId: s.id, screen: r.slug, pid: row.pid, address: r.elements.find((e) => e.pid === row.pid)?.address ?? row.pid, component: row.component, variant: row.variant, status: row.status });
      usage.set(row.component.toLowerCase(), list);
    }
    for (const a of r.parsed.assets) {
      if (!ctx.assetBase || !a.url.startsWith(ctx.assetBase)) continue;
      const key = a.url.slice(ctx.assetBase.length).split(".")[0];
      const list = assetUse.get(key) ?? [];
      if (!list.some((x) => x.screenId === s.id)) list.push({ screenId: s.id, screen: r.slug });
      assetUse.set(key, list);
    }
  }
  const known = new Set((ctx.catalogue?.components ?? []).map((c) => c.name.toLowerCase()));
  const assets = host.assets ? await host.assets.list(projectId) : [];
  return {
    project: ctx.project,
    tokens: {
      pageId: ctx.tokensPageId,
      count: ctx.tokenReport?.count ?? 0,
      typeCounts: ctx.tokenReport?.typeCounts ?? {},
      problems: ctx.tokenReport?.problems ?? (ctx.tokensPageId ? [] : [{ path: "", message: "The project has no token file (design-system/tokens)." }]),
    },
    components: (ctx.catalogue?.components ?? []).map((c) => ({ ...c, usage: usage.get(c.name.toLowerCase()) ?? [] })),
    unknown: [...usage.entries()].filter(([k]) => !known.has(k)).map(([, rows]) => ({ component: rows[0]?.component ?? "", usage: rows })),
    assets: assets.map((a) => ({ ...a, usedBy: assetUse.get(a.hash) ?? [] })),
    screens: screenRows,
  };
}

// Dry run, preflight, applying answers -----------------------------------------------------

export type Draft = { name: string; html: string };

export type DryRunOutcome = {
  pass: boolean;
  run: number;
  sheet: string;
  answerSheet: string | null;
  counts: ReturnType<typeof dryRun>["counts"];
  written: { questions: string | null; answers: string | null };
};

export const QUESTIONS_PAGE = "wave-questions";
export const ANSWERS_PAGE = "wave-answers";

function fingerprint(html: string): string {
  let h = 2166136261;
  for (let i = 0; i < html.length; i++) h = Math.imul(h ^ html.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * A dry run over draft screens for a feature. Nothing is uploaded. The
 * question sheet is merged with the answers already in it, and saved back to
 * the feature folder when the host keeps documents; a passing run also writes
 * the answer sheet.
 */
export async function dryRunFeature(host: WaveHost, featureId: string, drafts: Draft[], sheetText?: string | null): Promise<DryRunOutcome | { error: string }> {
  const feature = await host.resources.flow(featureId);
  if (!feature) return { error: "Not found." };
  const ctx = await contextFor(host, featureId);
  const others = ctx ? await projectSlugs(host, ctx.project.id) : [];
  const existing = host.documents ? await host.documents.read(featureId, QUESTIONS_PAGE) : null;
  const previousSheet = sheetText ?? existing?.content ?? "";
  const answers = parseSheet(previousSheet);
  const run = (Number(/dry run (\d+)/.exec(previousSheet)?.[1] ?? 0) || 0) + 1;

  const reports = drafts.map((d) => ({ d, r: reportFor(d.html, d.name, ctx, others) }));
  // A draft may replace an uploaded screen of the same slug; that is not a clash.
  for (const x of reports) {
    const idx = x.r.requirements.findIndex((q) => q.field === "unique-slug");
    if (idx >= 0 && reports.filter((y) => y.r.slug === x.r.slug).length === 1) {
      const clash = others.find((o) => o.slug === x.r.slug);
      if (clash && (await host.resources.flowOf(clash.id))?.id === featureId) {
        x.r.requirements.splice(idx, 1);
      }
    }
  }
  const screens = reports.map(({ d, r }) => ({ slug: r.slug, label: `draft ${fingerprint(d.html)}`, requirements: r.requirements, nodes: r.parsed.nodes }));
  // Destinations may also point at screens already uploaded in the project.
  const context = [...screens, ...others.filter((o) => !screens.some((s) => s.slug === o.slug)).map((o) => ({ slug: o.slug, label: "uploaded", requirements: [] as Requirement[], nodes: o.nodes }))];
  const result = dryRun(context, answers);
  const sheet = renderQuestionSheet(feature.name, run, screens, result);
  const answerSheet = result.pass ? renderAnswerSheet(feature.name, reports.map(({ d, r }) => ({ slug: r.slug, fingerprint: fingerprint(d.html) })), result) : null;

  const written = { questions: null as string | null, answers: null as string | null };
  if (host.documents) {
    const q = await host.documents.write(featureId, QUESTIONS_PAGE, sheet);
    if (q.ok) written.questions = q.id;
    if (answerSheet) {
      const a = await host.documents.write(featureId, ANSWERS_PAGE, answerSheet);
      if (a.ok) written.answers = a.id;
    }
  }
  return { pass: result.pass, run, sheet, answerSheet, counts: result.counts, written };
}

/** Preflight for a draft, in the context of the project it will go into. */
export async function preflightDraft(host: WaveHost, targetId: string | null, draft: Draft): Promise<PreflightReport> {
  const ctx = targetId ? await contextFor(host, targetId) : null;
  return preflightHtml(draft.html, draft.name, ctx ? { tokens: ctx.tokens, assetBase: ctx.assetBase, catalogue: ctx.catalogue } : {});
}

/** Writes answers (from a sheet or a map) into a draft's HTML, in its project's context. */
export async function applyAnswersToDraft(
  host: WaveHost,
  targetId: string | null,
  draft: Draft,
  answers: Map<string, string>,
): Promise<{ html: string; applied: string[]; skipped: { qid: string; reason: string }[]; report: ScreenReport }> {
  const ctx = targetId ? await contextFor(host, targetId) : null;
  const before = reportFor(draft.html, draft.name, ctx);
  const res = applyAnswers(draft.html, before.requirements, answers);
  return { ...res, report: reportFor(res.html, draft.name, ctx) };
}

export { parseSheet };
