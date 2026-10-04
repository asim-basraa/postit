import {
  checkCoverage,
  generateApi,
  parseApiDocument,
  readApi,
  renderRequirements,
  screenData,
  type ApiOperation,
  type ApiProblem,
  type PrototypeApi,
  type ScreenData,
} from "@wave/prototype";
import { assignTestIds, flowGraph, parseMockup, screenSlug, testIdTree, type FlowScreen, type SpecimenVariant, type TestIdNode } from "@wave/spec";
import type { HostResult, WaveHost } from "./host";
import { loadFlow } from "./flow";
import { describeUsage, lockedVersions, screenUsage } from "./shared";
import { ensureVersion, versionHtml } from "./versions";
import { preflightDraft, projectContext, type Draft } from "./project";

/**
 * A feature played as a prototype: its screens in order, and the mock API
 * they run against. The API is the feature's own OpenAPI document, on top of
 * the project's shared one when there is one (the feature's operations win).
 */

export type PrototypeScreen = {
  pageId: string;
  /** The version the prototype plays: a locked feature's approved version, else the current one. */
  version: number;
  slug: string;
  name: string;
  title: string;
  route: string | null;
  viewports: number[];
};

export type PrototypeView = {
  flow: { id: string; name: string };
  screens: PrototypeScreen[];
  start: string | null;
  api: PrototypeApi | null;
  /** Where the API came from, for the viewer to say. */
  sources: { feature: boolean; project: boolean };
  problems: ApiProblem[];
  requirementsId: string | null;
  /** The design system's drawn variants, so a chosen chip or card looks chosen. */
  variants?: SpecimenVariant[];
  variantCss?: string;
};

function parseMocks(raw: Record<string, string>, problems: ApiProblem[], where: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, text] of Object.entries(raw)) {
    try {
      out[name] = JSON.parse(text);
    } catch (e) {
      problems.push({ level: "error", message: `The ${where} mock file ${name} is not valid JSON: ${(e as Error).message}` });
    }
  }
  return out;
}

/** The API a feature's prototype runs against, with what is wrong with it. */
export async function featureApi(host: WaveHost, flowId: string): Promise<{ api: PrototypeApi | null; problems: ApiProblem[]; sources: PrototypeView["sources"]; requirementsId: string | null }> {
  const problems: ApiProblem[] = [];
  const sources = { feature: false, project: false };
  if (!host.api) return { api: null, problems, sources, requirementsId: null };
  const project = host.projects ? await host.projects.projectOf(flowId) : null;
  const layers: { where: string; folder: Awaited<ReturnType<NonNullable<WaveHost["api"]>["read"]>> }[] = [];
  if (project) layers.push({ where: "project", folder: await host.api.read(project.id) });
  const own = await host.api.read(flowId);
  layers.push({ where: "feature", folder: own });

  let merged: PrototypeApi | null = null;
  for (const { where, folder } of layers) {
    if (!folder?.openapi) continue;
    const doc = parseApiDocument(folder.openapi.content);
    if (!doc.ok) {
      problems.push({ level: "error", message: `The ${where}'s OpenAPI document: ${doc.error}` });
      continue;
    }
    const read = readApi(doc.doc, parseMocks(folder.mocks, problems, where));
    problems.push(...read.problems);
    sources[where as "feature" | "project"] = true;
    if (!merged) {
      merged = read.api;
      continue;
    }
    const key = (o: ApiOperation) => `${o.method} ${o.path}`;
    const replaced = new Set(read.api.operations.map(key));
    merged = {
      title: read.api.title,
      base: read.api.base || merged.base,
      operations: [...merged.operations.filter((o) => !replaced.has(key(o))), ...read.api.operations],
    };
  }
  return { api: merged, problems, sources, requirementsId: own?.requirements?.id ?? null };
}

async function screenHtml(host: WaveHost, flowId: string): Promise<{ pageId: string; name: string; html: string }[]> {
  const out: { pageId: string; name: string; html: string }[] = [];
  for (const m of (await host.resources.members(flowId)).filter((x) => x.kind === "screen")) {
    const screen = await host.resources.screen(m.id);
    const html = screen ? await host.resources.readCurrent(screen) : null;
    if (html !== null) out.push({ pageId: m.id, name: m.name, html });
  }
  return out;
}

/** Everything the prototype viewer needs for one feature. */
export async function prototypeOf(host: WaveHost, flowId: string): Promise<PrototypeView | null> {
  const flow = await host.resources.flow(flowId);
  if (!flow) return null;
  const loaded = await loadFlow(host, flowId);
  // A locked feature plays the versions it approved; later versions belong to other features.
  const locked = await lockedVersions(host, flowId);
  const flowScreens: FlowScreen[] = [];
  const playVersion = new Map<string, number>();
  for (const s of loaded.screens) {
    const at = locked?.get(s.pageId);
    const current = loaded.versions.get(s.pageId)?.content_version;
    if (at !== undefined && at !== current) {
      const old = await host.store.version(s.pageId, at);
      if (old) {
        flowScreens.push({ ...s, meta: old.screen, nodes: old.nodes });
        playVersion.set(s.pageId, at);
        continue;
      }
    }
    flowScreens.push(s);
    playVersion.set(s.pageId, current ?? 1);
  }
  const screens: PrototypeScreen[] = flowScreens.map((s) => prototypeScreen(s, playVersion.get(s.pageId)!));

  // Start where nothing leads in; failing that, the first screen.
  const graph = flowGraph(flowScreens);
  const incoming = new Set(graph.edges.filter((e) => e.from !== e.to).map((e) => e.to));
  const start = screens.find((s) => !incoming.has(s.slug))?.slug ?? screens[0]?.slug ?? null;

  const { api, problems, sources, requirementsId } = await featureApi(host, flowId);
  if (api) {
    const html = await screenHtml(host, flowId);
    problems.push(...checkCoverage(api, html.map((h) => screenData({ name: h.name, html: h.html }))));
  } else if (screens.length) {
    problems.push({
      level: "warning",
      message: "This feature has no mock API, so the prototype shows the design's sample data. Actions that would reach the backend show their loading state, then succeed or fail as the bar's switch says. To serve data, generate an API from the screens (wave_generate_api) or upload an OpenAPI file.",
    });
  }
  const project = host.projects ? await host.projects.projectOf(flowId) : null;
  const ctx = project ? await projectContext(host, project.id) : null;
  return { flow: { id: flow.id, name: flow.name }, screens, start, api, sources, problems, requirementsId, variants: ctx?.variants ?? [], variantCss: ctx?.variantCss ?? "" };
}

function prototypeScreen(s: FlowScreen, version: number): PrototypeScreen {
  return {
    pageId: s.pageId,
    version,
    slug: screenSlug(s),
    name: s.name,
    title: s.meta.title || s.meta.documentTitle || s.name,
    route: s.meta.route,
    viewports: (s.meta.viewports ?? "")
      .split(/[\s,]+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 200 && n <= 4000),
  };
}

/**
 * The master prototype of a project: every screen of every feature, each at
 * the latest version its review approved. Screens never approved are left
 * out. It runs on the project's own mock API, when it has one.
 */
export async function projectPrototypeOf(host: WaveHost, projectId: string): Promise<PrototypeView | null> {
  if (!host.projects) return null;
  const project = await host.projects.project(projectId);
  if (!project) return null;
  const flowScreens: FlowScreen[] = [];
  const versions = new Map<string, number>();
  const problems: ApiProblem[] = [];
  let left = 0;
  for (const s of await host.projects.screens(projectId)) {
    const at = s.approved_version ?? null;
    if (!at) {
      left++;
      continue;
    }
    const v = at === s.content_version ? await ensureVersion(host, s) : await host.store.version(s.id, at);
    if (!v) continue;
    flowScreens.push({ pageId: s.id, name: s.name, path: s.path, meta: v.screen, nodes: v.nodes, offToken: null, unidentifiedInteractive: [] });
    versions.set(s.id, at);
  }
  if (left) problems.push({ level: "warning", message: `${left} screen${left === 1 ? " has" : "s have"} no approved version yet and ${left === 1 ? "is" : "are"} left out.` });
  if (!flowScreens.length) problems.push({ level: "warning", message: "No screen in this project has been approved yet." });
  const graph = flowGraph(flowScreens);
  const incoming = new Set(graph.edges.filter((e) => e.from !== e.to).map((e) => e.to));
  const screens = flowScreens.map((s) => prototypeScreen(s, versions.get(s.pageId)!));
  const start = screens.find((s) => !incoming.has(s.slug))?.slug ?? screens[0]?.slug ?? null;
  let api: PrototypeApi | null = null;
  if (host.api) {
    const folder = await host.api.read(project.id);
    if (folder?.openapi) {
      const doc = parseApiDocument(folder.openapi.content);
      if (doc.ok) {
        const read = readApi(doc.doc, parseMocks(folder.mocks, problems, "project"));
        api = read.api;
        problems.push(...read.problems);
      } else problems.push({ level: "error", message: `The project's OpenAPI document: ${doc.error}` });
    }
  }
  const ctx = await projectContext(host, project.id);
  return {
    flow: { id: project.id, name: `${project.name}: all features` },
    screens,
    start,
    api,
    sources: { feature: false, project: !!api },
    problems,
    requirementsId: null,
    variants: ctx?.variants ?? [],
    variantCss: ctx?.variantCss ?? "",
  };
}

/** The HTML a prototype frame plays: the version the view says, refused for anything else. */
export async function prototypeScreenHtml(host: WaveHost, view: PrototypeView, screenId: string): Promise<string | null> {
  const s = view.screens.find((x) => x.pageId === screenId);
  if (!s) return null;
  const screen = await host.resources.screen(screenId);
  return screen ? versionHtml(host, screen, s.version) : null;
}

export type ApiDraft = { openapi: Record<string, unknown>; requirements: string; screens: ScreenData[]; saved: string[] | null };

/**
 * A first mock API made from the feature's screens. Saved only when asked,
 * and never over an existing document unless `overwrite`.
 */
export async function draftFeatureApi(host: WaveHost, flowId: string, opts: { save?: boolean; overwrite?: boolean } = {}): Promise<HostResult<ApiDraft>> {
  const flow = await host.resources.flow(flowId);
  if (!flow) return { ok: false, error: "Not found.", status: 404 };
  const html = await screenHtml(host, flowId);
  if (!html.length) return { ok: false, error: "The feature has no screens to make an API from.", status: 409 };
  const g = generateApi(flow.name, html.map((h) => ({ name: h.name, html: h.html })));
  const { api, problems } = readApi(g.openapi as never);
  const requirements = renderRequirements(flow.name, g.screens, api, [...problems, ...checkCoverage(api, g.screens)]);
  let saved: string[] | null = null;
  if (opts.save) {
    if (!host.api) return { ok: false, error: "This host does not keep API files.", status: 501 };
    if (!(await host.resources.canEdit(flowId))) return { ok: false, error: "You cannot change this feature.", status: 403 };
  if (await lockedVersions(host, flowId)) {
    return { ok: false, error: `${flow.name} is approved and locked at the versions it approved. Make the change in a new feature (it may use these screens with wave_use_screen), or reopen this one (wave_reopen_flow).`, status: 409 };
  }
  // Screens this feature uses from another feature are saved where they live, as a new version.
  const members = await host.resources.members(flowId);
    const existing = await host.api.read(flowId);
    if (existing?.openapi && !opts.overwrite) {
      return { ok: false, error: "The feature already has an OpenAPI document. Pass overwrite to replace it, or edit it and save it with wave_save_api.", status: 409 };
    }
    const w = await host.api.write(flowId, { openapi: JSON.stringify(g.openapi, null, 2), requirements });
    if (!w.ok) return w;
    saved = w.written;
  }
  return { ok: true, openapi: g.openapi, requirements, screens: g.screens, saved };
}

/**
 * Saves an OpenAPI document and mock files for a feature, after checking them,
 * and rewrites the data requirements page to match.
 */
export async function saveFeatureApi(
  host: WaveHost,
  flowId: string,
  input: { openapi?: string | null; mocks?: Record<string, unknown> | null },
): Promise<HostResult<{ written: string[]; problems: ApiProblem[] }>> {
  if (!host.api) return { ok: false, error: "This host does not keep API files.", status: 501 };
  const flow = await host.resources.flow(flowId);
  if (!flow) return { ok: false, error: "Not found.", status: 404 };
  if (!(await host.resources.canEdit(flowId))) return { ok: false, error: "You cannot change this feature.", status: 403 };
  if (await lockedVersions(host, flowId)) {
    return { ok: false, error: `${flow.name} is approved and locked at the versions it approved. Make the change in a new feature (it may use these screens with wave_use_screen), or reopen this one (wave_reopen_flow).`, status: 409 };
  }
  // Screens this feature uses from another feature are saved where they live, as a new version.
  const members = await host.resources.members(flowId);

  const files: { openapi?: string; mocks?: Record<string, string | null>; requirements?: string } = {};
  if (typeof input.openapi === "string") {
    const doc = parseApiDocument(input.openapi);
    if (!doc.ok) return { ok: false, error: doc.error, status: 400 };
    // Kept as JSON whatever it came as: Post-it pages hold JSON, and so does the handover.
    files.openapi = JSON.stringify(doc.doc, null, 2);
  }
  if (input.mocks) {
    files.mocks = {};
    for (const [name, value] of Object.entries(input.mocks)) {
      if (!/^[A-Za-z0-9_.-]{1,100}$/.test(name)) return { ok: false, error: `Mock file names are operationIds (letters, digits, _ . -): ${name}`, status: 400 };
      if (value === null) {
        files.mocks[name] = null;
        continue;
      }
      let body = value;
      if (typeof value === "string") {
        try {
          body = JSON.parse(value);
        } catch (e) {
          return { ok: false, error: `The mock file ${name} is not valid JSON: ${(e as Error).message}`, status: 400 };
        }
      }
      files.mocks[name] = JSON.stringify(body, null, 2);
    }
  }
  if (!files.openapi && !files.mocks) return { ok: false, error: "Give an openapi document, mock files, or both.", status: 400 };

  const first = await host.api.write(flowId, files);
  if (!first.ok) return first;

  // The requirements page describes what is saved now.
  const { api, problems } = await featureApi(host, flowId);
  const html = await screenHtml(host, flowId);
  const screens = html.map((h) => screenData({ name: h.name, html: h.html }));
  const all = [...problems, ...(api ? checkCoverage(api, screens) : [])];
  const req = await host.api.write(flowId, { requirements: renderRequirements(flow.name, screens, api, all) });
  return { ok: true, written: [...first.written, ...(req.ok ? req.written : [])], problems: all };
}

export type PublishedScreen = {
  name: string;
  id: string | null;
  version: number | null;
  created: boolean;
  error: string | null;
  mandatoryOpen: number;
  issues: string[];
  /** For a screen other features show too: what the new version does to each of them. */
  usage: string[];
};

/**
 * Publishes a whole flow in one go: every screen (created, or a new version of
 * the one with the same name), then its OpenAPI document and mock files.
 * Each screen is preflighted and the result reported; the designer has
 * already confirmed the upload in the conversation.
 */
export async function publishFlow(
  host: WaveHost,
  flowId: string,
  input: { screens: Draft[]; openapi?: string | null; mocks?: Record<string, unknown> | null },
): Promise<HostResult<{ screens: PublishedScreen[]; api: { written: string[]; problems: ApiProblem[] } | null; tests: string[] }>> {
  if (!host.resources.put) return { ok: false, error: "This host cannot publish screens in a batch; upload them one by one.", status: 501 };
  const flow = await host.resources.flow(flowId);
  if (!flow) return { ok: false, error: "Not found.", status: 404 };
  if (!flow.is_flow) return { ok: false, error: "That folder is not a feature (flow). Mark it with set_flow first.", status: 409 };
  if (!(await host.resources.canEdit(flowId))) return { ok: false, error: "You cannot change this feature.", status: 403 };
  if (await lockedVersions(host, flowId)) {
    return { ok: false, error: `${flow.name} is approved and locked at the versions it approved. Make the change in a new feature (it may use these screens with wave_use_screen), or reopen this one (wave_reopen_flow).`, status: 409 };
  }
  // Screens this feature uses from another feature are saved where they live, as a new version.
  const members = await host.resources.members(flowId);
  const names = new Set<string>();
  for (const s of input.screens) {
    const key = s.name.trim().toLowerCase();
    if (!key) return { ok: false, error: "Every screen needs a name.", status: 400 };
    if (names.has(key)) return { ok: false, error: `Two screens are called ${s.name}.`, status: 400 };
    names.add(key);
  }

  const results: PublishedScreen[] = [];
  const trees: Record<string, TestIdNode> = {};
  for (const raw of input.screens) {
    // Every screen root, section and design-system component gets its test id here, once.
    const slug = screenSlug({ meta: parseMockup(raw.html).screen, name: raw.name });
    const tid = assignTestIds(raw.html, slug);
    const s = { ...raw, html: tid.html };
    const tree = testIdTree(s.html, slug);
    if (tree) trees[slug] = tree;
    const pre = await preflightDraft(host, flowId, s);
    const member = members.find((m) => m.kind === "screen" && m.name.trim().toLowerCase() === s.name.trim().toLowerCase());
    const home = member ? await host.resources.flowOf(member.id) : null;
    let put: HostResult<{ id: string; version: number; created: boolean }>;
    if (member && home && home.id !== flowId) {
      const saved = await host.resources.save(member.id, s.html, member.content_version);
      put = saved.ok ? { ok: true, id: member.id, version: saved.version, created: false } : saved;
    } else {
      put = await host.resources.put(flowId, s.name, s.html);
    }
    const usage = put.ok && !put.created ? describeUsage(s.name, await screenUsage(host, put.id), put.version) : [];
    results.push({
      name: s.name,
      id: put.ok ? put.id : null,
      version: put.ok ? put.version : null,
      created: put.ok ? put.created : false,
      error: put.ok ? null : put.error,
      mandatoryOpen: pre.counts.mandatoryOpen,
      issues: pre.issues.filter((i) => i.level === "mandatory").map((i) => i.message),
      usage,
    });
  }
  // Each screen's test ids as a tree, in the feature's tests/ folder.
  const tests: string[] = [];
  if (host.documents) {
    for (const [slug, tree] of Object.entries(trees)) {
      const w = await host.documents.write(flowId, `${slug}-components`, JSON.stringify(tree, null, 2) + "\n", "json", "tests");
      if (w.ok) tests.push(`tests/${slug}-components`);
    }
  }
  let api: { written: string[]; problems: ApiProblem[] } | null = null;
  if (input.openapi || input.mocks) {
    const r = await saveFeatureApi(host, flowId, { openapi: input.openapi ?? null, mocks: input.mocks ?? null });
    api = r.ok ? { written: r.written, problems: r.problems } : { written: [], problems: [{ level: "error", message: r.error }] };
  }
  return { ok: true, screens: results, api, tests };
}
