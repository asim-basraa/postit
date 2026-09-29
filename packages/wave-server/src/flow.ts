import {
  actionCatalog,
  buildHandover,
  completenessChecks,
  dataDictionary,
  describeAnchor,
  findOffToken,
  flowGraph,
  parseTokens,
  screenSlug,
  slugify,
  statesByComponent,
  type ActionEntry,
  type Check,
  type CommentAnchor,
  type ComponentStates,
  type DictionaryEntry,
  type FlowGraph,
  type FlowScreen,
  type Handover,
  type HandoverDecision,
  type TokenSet,
} from "@wave/spec";
import type { Approval, HostResult, ScreenVersion, Waiver, WaveFlow, WaveHost, WaveMember } from "./host";
import { ensureVersion } from "./versions";
import { ANSWERS_PAGE, contextFor, screenReport } from "./project";

/**
 * A flow: the screens of one journey, reviewed and approved together and
 * handed over as one package. What the container is (a folder, a test, a
 * project) is the host's business.
 */

export type FlowTokens = {
  page: { id: string; name: string; path: string; content_version: number; review_status: string | null } | null;
  set: TokenSet | null;
};

/**
 * The flow's token file: the JSON member its screens name with wave:tokens, or
 * failing that the first JSON member that is DTCG.
 */
export function pickTokens(members: WaveMember[], wanted: (string | null)[]): FlowTokens {
  const json = members.filter((m) => m.kind === "tokens");
  const names = wanted.filter(Boolean).map((w) => w!.toLowerCase());
  const byName = json.find((m) => names.includes(m.name.toLowerCase()) || names.includes(m.path.split("/").pop()!.toLowerCase()));
  for (const candidate of byName ? [byName, ...json] : json) {
    const set = parseTokens(candidate.content ?? "");
    if (set) {
      const { id, name, path, content_version, review_status } = candidate;
      return { page: { id, name, path, content_version, review_status }, set };
    }
  }
  return { page: null, set: null };
}

export type LoadedFlow = {
  members: WaveMember[];
  screens: FlowScreen[];
  versions: Map<string, ScreenVersion>;
  tokens: FlowTokens;
};

/** Every screen of a flow with its current index, and the flow's tokens. */
export async function loadFlow(host: WaveHost, flowId: string): Promise<LoadedFlow> {
  const members = await host.resources.members(flowId);
  const versions = new Map<string, ScreenVersion>();
  for (const m of members) {
    if (m.kind !== "screen") continue;
    const screen = await host.resources.screen(m.id);
    if (!screen) continue;
    // The host may have moved things on while fetching (adopting inline HTML).
    m.content_version = screen.content_version;
    const v = await ensureVersion(host, screen);
    if (v) versions.set(m.id, v);
  }
  const tokens = pickTokens(members, [...versions.values()].map((v) => v.screen.tokens));

  const screens: FlowScreen[] = members
    .filter((m) => m.kind === "screen" && versions.has(m.id))
    .map((m) => {
      const v = versions.get(m.id)!;
      return {
        pageId: m.id,
        name: m.name,
        path: m.path,
        meta: v.screen,
        nodes: v.nodes,
        offToken: tokens.set ? findOffToken(v.extras.css ?? [], tokens.set) : null,
        unidentifiedInteractive: v.extras.unidentified ?? [],
      };
    });

  return { members, screens, versions, tokens };
}

// Overview ----------------------------------------------------------------------

export type ScreenRow = {
  pageId: string;
  name: string;
  path: string;
  slug: string;
  title: string | null;
  route: string | null;
  version: number;
  reviewStatus: "in_review" | "approved" | null;
  approvedCurrent: boolean;
  open: number;
  addressed: number;
  findings: number;
  errors: number;
  checks: number;
  /** Mandatory fields not yet answered or waived. */
  mandatoryOpen: number;
  recommendedOpen: number;
};

export type FlowOverview = {
  flow: WaveFlow;
  screens: ScreenRow[];
  tokens: { id: string; name: string; path: string; version: number; approvedCurrent: boolean; count: number } | null;
  unresolvedTokenRefs: string[];
  dictionary: DictionaryEntry[];
  actions: ActionEntry[];
  graph: FlowGraph;
  states: ComponentStates[];
  checks: (Check & { waiver: Waiver | null })[];
  waivers: Waiver[];
  approval: (Approval & { current: boolean }) | null;
  /** What still stands between this flow and approval. */
  blockers: string[];
};

export async function flowOverview(host: WaveHost, flowId: string): Promise<FlowOverview | null> {
  const flow = await host.resources.flow(flowId);
  if (!flow || !flow.is_flow) return null;

  const loaded = await loadFlow(host, flowId);
  const statuses = await host.comments.statuses(loaded.members.map((m) => m.id));
  const waivers = await host.store.waivers(flowId);
  const waiverByKey = new Map(waivers.map((w) => [w.check_key, w]));
  const checks = completenessChecks(loaded.screens).map((c) => ({ ...c, waiver: waiverByKey.get(c.key) ?? null }));
  const approvedCurrent = new Map(loaded.members.map((m) => [m.id, m.approved_current]));

  const screens: ScreenRow[] = loaded.screens.map((s) => {
    const member = loaded.members.find((m) => m.id === s.pageId)!;
    const v = loaded.versions.get(s.pageId)!;
    const mine = statuses.filter((c) => c.screen_id === s.pageId);
    return {
      pageId: s.pageId,
      name: s.name,
      path: s.path,
      slug: screenSlug(s),
      title: s.meta.title,
      route: s.meta.route,
      version: member.content_version,
      reviewStatus: member.review_status,
      approvedCurrent: member.approved_current,
      open: mine.filter((c) => c.status === "open").length,
      addressed: mine.filter((c) => c.status === "addressed").length,
      findings: v.findings.length,
      errors: v.findings.filter((f) => f.severity === "error").length,
      checks: checks.filter((c) => c.pageId === s.pageId && !c.waiver).length,
      mandatoryOpen: 0,
      recommendedOpen: 0,
    };
  });
  for (const row of screens) {
    const screen = await host.resources.screen(row.pageId);
    const r = screen ? await screenReport(host, screen) : null;
    if (r) {
      row.mandatoryOpen = r.counts.mandatoryOpen;
      row.recommendedOpen = r.counts.recommendedOpen;
    }
  }

  const tokens = loaded.tokens.page
    ? {
        id: loaded.tokens.page.id,
        name: loaded.tokens.page.name,
        path: loaded.tokens.page.path,
        version: loaded.tokens.page.content_version,
        approvedCurrent: approvedCurrent.get(loaded.tokens.page.id) ?? false,
        count: loaded.tokens.set?.tokens.length ?? 0,
      }
    : null;

  const unresolvedTokenRefs = [
    ...new Set(
      loaded.screens
        .map((s) => s.meta.tokens)
        .filter((t): t is string => !!t)
        .filter((t) => !tokens || (t.toLowerCase() !== tokens.name.toLowerCase() && t.toLowerCase() !== tokens.path.split("/").pop()!.toLowerCase())),
    ),
  ];

  const approval = await host.store.latestApproval(flowId);
  let approvalState: FlowOverview["approval"] = null;
  if (approval) {
    const json = loaded.members.filter((m) => m.kind === "tokens");
    const current =
      approval.members.length === screens.length &&
      approval.members.every((m) => screens.find((s) => s.pageId === m.screen_id)?.version === m.content_version) &&
      approval.tokens.every((t) => json.find((m) => m.id === t.resource_id)?.content_version === t.content_version) &&
      json.length === approval.tokens.length;
    approvalState = { ...approval, current };
  }

  const blockers: string[] = [];
  if (screens.length === 0) blockers.push("The flow has no screens yet.");
  for (const s of screens) {
    if (!s.approvedCurrent) blockers.push(`${s.name} is not approved at its current version.`);
    if (s.open) blockers.push(`${s.name} has ${s.open} open comment${s.open === 1 ? "" : "s"}.`);
    if (s.addressed) blockers.push(`${s.name} has ${s.addressed} addressed comment${s.addressed === 1 ? "" : "s"} waiting to be confirmed.`);
    if (s.mandatoryOpen) blockers.push(`${s.name} has ${s.mandatoryOpen} mandatory field${s.mandatoryOpen === 1 ? "" : "s"} missing.`);
  }
  for (const m of loaded.members.filter((m) => m.kind === "tokens")) {
    if (!m.approved_current) blockers.push(`${m.name} is not approved at its current version.`);
  }

  return {
    flow,
    screens,
    tokens,
    unresolvedTokenRefs,
    dictionary: dataDictionary(loaded.screens),
    actions: actionCatalog(loaded.screens),
    graph: flowGraph(loaded.screens),
    states: statesByComponent(loaded.screens),
    checks,
    waivers,
    approval: approvalState,
    blockers,
  };
}

// Waivers, approval, handover ------------------------------------------------------

export async function addWaiver(host: WaveHost, flowId: string, key: string, message: string, note: string): Promise<HostResult> {
  if (!note.trim()) return { ok: false, error: "Say why this is acceptable.", status: 400 };
  if (!host.viewer) return { ok: false, error: "Not found.", status: 404 };
  return host.store.putWaiver(flowId, { key, message: message.slice(0, 1000), note: note.trim().slice(0, 2000) });
}

export function removeWaiver(host: WaveHost, flowId: string, key: string): Promise<HostResult> {
  return host.store.deleteWaiver(flowId, key);
}

export async function approveFlow(host: WaveHost, flowId: string): Promise<HostResult> {
  // Make sure every screen's current version has a stored copy to freeze.
  await loadFlow(host, flowId);
  const overview = await flowOverview(host, flowId);
  if (!overview) return { ok: false, error: "Not found.", status: 404 };
  const missing = overview.screens.filter((s) => s.mandatoryOpen > 0);
  if (missing.length) {
    return {
      ok: false,
      error: `Mandatory fields are still missing: ${missing.map((s) => `${s.name} (${s.mandatoryOpen})`).join(", ")}. Answer or waive them first.`,
      status: 409,
    };
  }
  return host.store.approve(flowId);
}

/**
 * The handover for a flow's latest approval, built from what was frozen.
 * Refused with the reason when there is no approval that still stands.
 */
export async function flowHandover(
  host: WaveHost,
  flowId: string,
): Promise<{ ok: true; handover: Handover; approval: Approval; flow: WaveFlow } | { ok: false; error: string; blockers?: string[] }> {
  const overview = await flowOverview(host, flowId);
  if (!overview) return { ok: false, error: "Not found." };
  const approval = overview.approval;
  if (!approval) return { ok: false, error: "This flow has not been approved.", blockers: overview.blockers };
  if (!approval.current) {
    return {
      ok: false,
      error: "This flow was approved, but a screen or its tokens have changed since. It needs approving again.",
      blockers: overview.blockers,
    };
  }

  const screens = [];
  for (const m of approval.members) {
    const html = m.snapshot_key ? await host.blobs.read(m.snapshot_key) : null;
    if (html === null) return { ok: false, error: `The stored copy of ${m.name} could not be read.` };
    screens.push({ pageId: m.screen_id, name: m.name, version: m.content_version, html });
  }

  const tokenFile = approval.tokens.find((t) => t.content && t.resource_id === overview.tokens?.id) ?? approval.tokens[0];

  const decisions: HandoverDecision[] = [];
  for (const m of approval.members) {
    for (const c of await host.comments.list(m.screen_id)) {
      if (c.parent_id || c.deleted) continue;
      if (c.status !== "resolved" && c.status !== "wont_fix") continue;
      decisions.push({
        status: c.status,
        screen: overview.screens.find((s) => s.pageId === m.screen_id)?.slug ?? m.name,
        anchor: describeAnchor((c.anchor as CommentAnchor | null) ?? null),
        body: c.body,
        note: c.status_note ?? null,
        author: c.author_email,
      });
    }
  }

  const handover = buildHandover({
    flowName: overview.flow.name,
    flowPath: overview.flow.path,
    approvedBy: approval.approved_by_email,
    approvedAt: approval.approved_at,
    screens,
    tokens: tokenFile?.content ? { name: tokenFile.name, version: tokenFile.content_version, json: tokenFile.content } : null,
    decisions,
    waivers: approval.waivers.map((w) => ({ key: w.key, message: w.message, note: w.note, by: w.by })),
  });

  await addProjectFiles(host, flowId, screens, handover);
  return { ok: true, handover, approval, flow: overview.flow };
}

/** Assets, component specimens and the answer sheet, added to a handover. */
async function addProjectFiles(host: WaveHost, flowId: string, screens: { html: string }[], handover: Handover) {
  const ctx = await contextFor(host, flowId);
  const files = handover.files as { name: string; content: string | Uint8Array }[];
  if (ctx?.assetBase && host.assets?.read) {
    const manifest: Record<string, string> = {};
    for (const s of screens) {
      for (const m of s.html.matchAll(/https?:\/\/[^\s"'()]+\/a\/[0-9a-f-]{36}\/([0-9a-f]{64})\.([a-z0-9]{2,5})/g)) {
        if (!m[0].startsWith(ctx.assetBase) || manifest[m[0]]) continue;
        const bytes = await host.assets.read(ctx.project.id, m[1], m[2]);
        if (!bytes) continue;
        const name = `assets/${m[1]}.${m[2]}`;
        files.push({ name, content: bytes });
        manifest[m[0]] = name;
      }
    }
    if (Object.keys(manifest).length) files.push({ name: "assets/manifest.json", content: JSON.stringify(manifest, null, 2) });
  }
  if (ctx?.catalogue) {
    const used = new Set<string>();
    for (const s of screens) for (const m of s.html.matchAll(/data-(?:wave|pi)-component="([^"]+)"/g)) used.add(m[1].toLowerCase());
    for (const c of ctx.catalogue.components) {
      if (!used.has(c.name.toLowerCase())) continue;
      const page = await host.resources.screen(c.pageId);
      const html = page ? await host.resources.readCurrent(page) : null;
      if (html) files.push({ name: `components/${slugify(c.name)}.html`, content: html });
    }
  }
  if (host.documents) {
    const answers = await host.documents.read(flowId, ANSWERS_PAGE);
    if (answers) files.push({ name: "wave-answers.md", content: answers.content });
  }
  // The mock API the prototype ran on: the contract the build starts from, and
  // ready to serve in development with MSW.
  if (host.api) {
    const project = host.projects ? await host.projects.projectOf(flowId) : null;
    for (const [prefix, folderId] of [["api/project/", project?.id ?? null], ["api/", flowId]] as const) {
      if (!folderId) continue;
      const folder = await host.api.read(folderId);
      if (!folder) continue;
      if (folder.openapi) files.push({ name: `${prefix}openapi.${folder.openapi.content.trim().startsWith("{") ? "json" : "yaml"}`, content: folder.openapi.content });
      for (const [name, body] of Object.entries(folder.mocks)) files.push({ name: `${prefix}mocks/${name}.json`, content: body });
      if (folderId === flowId && folder.requirements) files.push({ name: "api/data-requirements.md", content: folder.requirements.content });
    }
  }
}
