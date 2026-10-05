import {
  applyAnswers,
  catalogueUsage,
  dryRun,
  evaluateScreen,
  parseMockup,
  parseSheet,
  parseSpecimen,
  specimenVariants,
  type SpecimenVariant,
  parseTokens,
  preflightHtml,
  renderAnswerSheet,
  renderQuestionSheet,
  screenSlug,
  validateTokenDocument,
  parseDesignMd,
  parseFeatureMd,
  DESIGN_PAGE,
  FEATURE_PAGE,
  DESIGN_SYSTEM_PAGE,
  DESIGN_SYSTEM_IDS,
  designSystemIdsJson,
  designSystemPage,
  type BriefProblem,
  type DesignDefaults,
  type FeatureBrief,
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
import { briefOf, warningsFrom, type BriefMemo, type ScreenWarnings } from "./warnings";

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
  /** DESIGN.md at the project root: the defaults every element inherits. */
  design: DesignDefaults | null;
  designPageId: string | null;
  designProblems: BriefProblem[];
  /** Every drawn variant of every catalogue component, and their CSS, for the prototype. */
  variants: SpecimenVariant[];
  variantCss: string;
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
  // Independent of each other, so together: the token file, every specimen's
  // file, and the project's DESIGN.md.
  const [file, specimens, designDoc] = await Promise.all([
    projects.tokens(project.id),
    projects.specimens(project.id).then((list) =>
      Promise.all(list.map(async (s) => ({ s, html: await host.resources.readCurrent(s) }))),
    ),
    host.documents ? host.documents.read(project.id, DESIGN_PAGE) : null,
  ]);
  const tokenReport = file ? validateTokenDocument(file.content) : null;
  const tokens = file ? parseTokens(file.content) : null;

  const components: CatalogueComponent[] = [];
  const variants: SpecimenVariant[] = [];
  const css: string[] = [];
  for (const { s, html } of specimens) {
    if (!html) continue;
    const parsed = parseMockup(html);
    const def = parseSpecimen(html, parsed);
    if (!def) continue;
    components.push({ ...def, pageId: s.id, pagePath: s.path, version: s.content_version });
    const drawn = specimenVariants(html, def.name);
    variants.push(...drawn.variants);
    if (drawn.variants.length) css.push(drawn.css);
  }
  const design = designDoc ? parseDesignMd(designDoc.content) : null;
  return {
    project,
    tokens,
    tokenReport,
    tokensPageId: file?.id ?? null,
    catalogue: components.length ? { components } : null,
    assetBase: host.assets ? host.assets.baseUrl(project.id) : null,
    design: design?.design ?? null,
    designPageId: designDoc?.id ?? null,
    designProblems: design?.problems ?? [],
    variants,
    variantCss: css.join("\n"),
  };
}

/** A feature's FEATURE.md, or null when it has none. */
export async function featureBrief(host: WaveHost, featureId: string | null): Promise<FeatureBrief | null> {
  if (!featureId || !host.documents) return null;
  const doc = await host.documents.read(featureId, FEATURE_PAGE);
  return doc ? parseFeatureMd(doc.content).feature : null;
}

/** The feature a target (a feature folder or a screen in one) belongs to. */
async function featureOf(host: WaveHost, targetId: string | null): Promise<string | null> {
  if (!targetId) return null;
  const flow = await host.resources.flow(targetId).catch(() => null);
  if (flow) return targetId;
  const of = await host.resources.flowOf(targetId).catch(() => null);
  return of?.id ?? null;
}

/** The project context for a screen, feature or folder, or null outside a project. */
export async function contextFor(host: WaveHost, id: string): Promise<ProjectContext | null> {
  const project = host.projects ? await host.projects.projectOf(id) : null;
  return project ? projectContext(host, project.id) : null;
}

export type ScreenReport = ScreenRequirements & { parsed: ParsedMockup; slug: string };

/** One screen's requirements, checked against its project when it has one. */
export function reportFor(
  html: string,
  name: string,
  ctx: ProjectContext | null,
  others: { slug: string; id: string }[] = [],
  selfId?: string,
  feature: FeatureBrief | null = null,
): ScreenReport {
  const parsed = parseMockup(html);
  const slug = screenSlug({ meta: parsed.screen, name });
  const report = evaluateScreen(
    parsed,
    slug,
    ctx
      ? { html, tokens: ctx.tokens, assetBase: ctx.assetBase, catalogue: parsed.screen.component ? undefined : ctx.catalogue, design: ctx.design, feature }
      : { html, feature },
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
export type ProjectSlugs = { id: string; slug: string; nodes: { id: string; slug: string | null }[] }[];

async function projectSlugs(host: WaveHost, projectId: string): Promise<ProjectSlugs> {
  if (!host.projects) return [];
  const screens = await host.projects.screens(projectId);
  // Every screen's file at once rather than one after another.
  const htmls = await Promise.all(screens.map((s) => host.resources.readCurrent(s)));
  return slugsFrom(screens, htmls);
}

function slugsFrom(screens: WaveScreen[], htmls: (string | null)[]): ProjectSlugs {
  const out: ProjectSlugs = [];
  screens.forEach((s, i) => {
    const html = htmls[i];
    if (!html) return;
    const parsed = parseMockup(html);
    out.push({ id: s.id, slug: screenSlug({ meta: parsed.screen, name: s.name }), nodes: parsed.nodes.map((n) => ({ id: n.id, slug: n.slug })) });
  });
  return out;
}

/**
 * Slugs for each project, read once by whoever holds the map. A flow overview
 * reports on every screen, and each report needs the whole project's slugs:
 * without this, a flow of N screens read N x N files.
 */
export type SlugMemo = Map<string, Promise<ProjectSlugs>>;

function memoSlugs(host: WaveHost, projectId: string, memo?: SlugMemo): Promise<ProjectSlugs> {
  if (!memo) return projectSlugs(host, projectId);
  let hit = memo.get(projectId);
  if (!hit) memo.set(projectId, (hit = projectSlugs(host, projectId)));
  return hit;
}

/** An uploaded screen's report, in its project's context. */
export async function screenReport(host: WaveHost, screen: WaveScreen, html?: string, memo?: SlugMemo): Promise<ScreenReport | null> {
  const source = html ?? (await host.resources.readCurrent(screen));
  if (source === null) return null;
  const ctx = await contextFor(host, screen.id);
  const others = ctx ? await memoSlugs(host, ctx.project.id, memo) : [];
  const brief = await featureBrief(host, await featureOf(host, screen.id));
  return reportFor(source, screen.name, ctx, others, screen.id, brief);
}

// Catalogue --------------------------------------------------------------------------------

export type CatalogueOverview = {
  project: WaveProject;
  tokens: { pageId: string | null; count: number; typeCounts: TokenReport["typeCounts"]; problems: TokenReport["problems"] };
  components: (CatalogueComponent & { usage: UsageRow[] })[];
  /** Components used on screens that the catalogue does not have. */
  unknown: { component: string; usage: UsageRow[] }[];
  assets: (WaveAsset & { usedBy: { screenId: string; screen: string }[] })[];
  screens: { id: string; name: string; slug: string; flow_id: string | null; mandatoryOpen: number; recommendedOpen: number }[];
  /** Every screen's open questions and file findings, mandatory first. */
  warnings: ScreenWarnings[];
};

export type UsageRow = { screenId: string; screen: string; pid: string; address: string; component: string; variant: string; status: string };

export async function catalogueOverview(host: WaveHost, projectId: string): Promise<CatalogueOverview | null> {
  if (!host.projects) return null;
  const projects = host.projects;
  // The project's context (its specimens) and its screens do not wait for each
  // other. Each screen's file is read once, here, and the project's slugs are
  // made from the same reads rather than by reading every file a second time.
  const [ctx, [screens, htmls]] = await Promise.all([
    projectContext(host, projectId),
    projects.screens(projectId).then(async (list) => [list, await Promise.all(list.map((s) => host.resources.readCurrent(s)))] as const),
  ]);
  if (!ctx) return null;
  const slugs = slugsFrom(screens, htmls);
  const usage = new Map<string, UsageRow[]>();
  const assetUse = new Map<string, { screenId: string; screen: string }[]>();
  const screenRows: CatalogueOverview["screens"] = [];
  const warnings: ScreenWarnings[] = [];
  const briefs: BriefMemo = new Map();
  for (const [i, s] of screens.entries()) {
    const html = htmls[i];
    if (!html) continue;
    // With the screen's own FEATURE.md, as preflight reads it: answers given there are answers.
    const r = reportFor(html, s.name, ctx, slugs, s.id, await briefOf(host, s.flow_id, briefs));
    const w = warningsFrom(r, html, s, s.flow_id);
    warnings.push(w);
    screenRows.push({ id: s.id, name: s.name, slug: r.slug, flow_id: s.flow_id, mandatoryOpen: w.mandatory, recommendedOpen: w.recommended });
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
    warnings,
  };
}

// The design-system page -------------------------------------------------------------------

export type DesignSystemPageOutcome = {
  page: { id: string; path: string };
  ids: { id: string; path: string };
  components: number;
  proposed: string[];
};

/**
 * Writes the project's design-system page (the table of every component's
 * design-system id and its variants' ids) and the same table as JSON, both
 * from the catalogue's specimens, into the design-system folder. The page's
 * own opening and its Notes are kept; the rest is regenerated, so run it
 * whenever a specimen is published, changed or approved.
 */
export async function writeDesignSystemPage(host: WaveHost, projectId: string): Promise<DesignSystemPageOutcome | { error: string }> {
  const projects = host.projects;
  if (!projects?.designSystemFolder || !host.documents) return { error: "This host cannot write the design-system page." };
  const project = await projects.project(projectId);
  if (!project) return { error: "Not found, or not a project." };
  const ctx = await projectContext(host, project.id);
  const components = ctx?.catalogue?.components ?? [];
  if (!components.length) return { error: "The project has no component specimens yet (design-system/components)." };
  const folder = await projects.designSystemFolder(project.id);
  if (!folder) return { error: "Could not find or create the design-system folder." };

  const rows = components.map((c) => ({
    ...c,
    page: folder.pageBase ? `${folder.pageBase}${c.pagePath}` : null,
    review: host.links ? host.links.screen(c.pageId) : null,
  }));
  const json = JSON.stringify(designSystemIdsJson(project.name, rows), null, 2) + "\n";
  const ids = await host.documents.write(folder.id, DESIGN_SYSTEM_IDS, json, "json");
  if (!ids.ok) return { error: ids.error };
  const previous = await host.documents.read(folder.id, DESIGN_SYSTEM_PAGE);
  const idsPath = `${folder.path}/${DESIGN_SYSTEM_IDS}`;
  const md = designSystemPage(project.name, rows, { idsLink: `[[${idsPath}|${DESIGN_SYSTEM_IDS}]]`, previous: previous?.content ?? null });
  const page = await host.documents.write(folder.id, DESIGN_SYSTEM_PAGE, md);
  if (!page.ok) return { error: page.error };
  return {
    page: { id: page.id, path: `${folder.path}/${DESIGN_SYSTEM_PAGE}` },
    ids: { id: ids.id, path: idsPath },
    components: components.length,
    proposed: components.filter((c) => c.status !== "approved").map((c) => c.name),
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

  const brief = await featureBrief(host, featureId);
  const reports = drafts.map((d) => ({ d, r: reportFor(d.html, d.name, ctx, others, undefined, brief) }));
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
  const feature = await featureBrief(host, await featureOf(host, targetId));
  return preflightHtml(draft.html, draft.name, ctx ? { tokens: ctx.tokens, assetBase: ctx.assetBase, catalogue: ctx.catalogue, design: ctx.design, feature } : { feature });
}

/** Writes answers (from a sheet or a map) into a draft's HTML, in its project's context. */
export async function applyAnswersToDraft(
  host: WaveHost,
  targetId: string | null,
  draft: Draft,
  answers: Map<string, string>,
): Promise<{ html: string; applied: string[]; skipped: { qid: string; reason: string }[]; report: ScreenReport }> {
  const ctx = targetId ? await contextFor(host, targetId) : null;
  const feature = await featureBrief(host, await featureOf(host, targetId));
  const before = reportFor(draft.html, draft.name, ctx, [], undefined, feature);
  const res = applyAnswers(draft.html, before.requirements, answers);
  return { ...res, report: reportFor(res.html, draft.name, ctx, [], undefined, feature) };
}

export { parseSheet };
