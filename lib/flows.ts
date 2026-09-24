import {
  actionCatalog,
  buildHandover,
  completenessChecks,
  dataDictionary,
  flowGraph,
  screenSlug,
  statesByComponent,
  type ActionEntry,
  type Check,
  type ComponentStates,
  type DictionaryEntry,
  type FlowGraph,
  type Handover,
  type HandoverDecision,
} from "@postit/mockup-spec";
import { createClient } from "@/lib/supabase/server";
import { readArtifact } from "@/lib/artifacts";
import { loadFlow, type Db, type FlowFolder } from "@/lib/mockups";
import { describeAnchor, type Comment } from "@/lib/comment-threads";

/**
 * A flow: a folder whose HTML pages are the screens of one journey, reviewed
 * and approved together and handed over as one package.
 */

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
};

export type Waiver = { id: string; check_key: string; message: string; note: string; by_email: string | null; created_at: string };

export type Approval = {
  id: string;
  approved_by_email: string | null;
  approved_at: string;
  members: { node_id: string; name: string; path: string; content_version: number; snapshot_key: string | null }[];
  tokens: { node_id: string; name: string; content_version: number; content: string | null }[];
  waivers: { key: string; message: string; note: string; by: string | null }[];
};

export type FlowOverview = {
  folder: FlowFolder;
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

export async function getFolder(db: Db, folderId: string): Promise<FlowFolder | null> {
  const { data } = await db
    .from("nodes")
    .select("id, name, path, space_id, is_flow, kind")
    .eq("id", folderId)
    .maybeSingle();
  const row = data as (FlowFolder & { kind: string }) | null;
  return row && row.kind === "folder" ? row : null;
}

/** Marks a folder as a flow, or stops it being one. The update policy decides who may. */
export async function setFlow(
  folderId: string,
  isFlow: boolean,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("nodes")
    .update({ is_flow: isFlow })
    .eq("id", folderId)
    .eq("kind", "folder")
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, error: error.message, status: 400 };
  if (!data) return { ok: false, error: "Not found.", status: 404 };
  return { ok: true };
}

async function commentStatuses(db: Db, pageIds: string[]) {
  if (pageIds.length === 0) return [];
  const { data } = await db
    .from("comments")
    .select("node_id, status")
    .in("node_id", pageIds)
    .is("parent_id", null)
    .is("deleted_at", null);
  return (data as { node_id: string; status: string | null }[] | null) ?? [];
}

export async function flowWaivers(db: Db, folderId: string): Promise<Waiver[]> {
  const { data } = await db.rpc("flow_waivers", { p_folder_id: folderId });
  return (data as Waiver[] | null) ?? [];
}

export async function latestApproval(db: Db, folderId: string): Promise<Approval | null> {
  const { data } = await db.rpc("flow_approval", { p_folder_id: folderId }).maybeSingle();
  return (data as Approval | null) ?? null;
}

export async function flowOverview(db: Db, folderId: string): Promise<FlowOverview | null> {
  const folder = await getFolder(db, folderId);
  if (!folder || !folder.is_flow) return null;

  const loaded = await loadFlow(db, folderId);
  const statuses = await commentStatuses(db, loaded.members.map((m) => m.id));
  const waivers = await flowWaivers(db, folderId);
  const waiverByKey = new Map(waivers.map((w) => [w.check_key, w]));
  const checks = completenessChecks(loaded.screens).map((c) => ({ ...c, waiver: waiverByKey.get(c.key) ?? null }));

  const screens: ScreenRow[] = loaded.screens.map((s) => {
    const member = loaded.members.find((m) => m.id === s.pageId)!;
    const rev = loaded.revisions.get(s.pageId)!;
    const mine = statuses.filter((c) => c.node_id === s.pageId);
    return {
      pageId: s.pageId,
      name: s.name,
      path: s.path,
      slug: screenSlug(s),
      title: s.meta.title,
      route: s.meta.route,
      version: member.content_version,
      reviewStatus: member.review_status,
      approvedCurrent: false,
      open: mine.filter((c) => c.status === "open").length,
      addressed: mine.filter((c) => c.status === "addressed").length,
      findings: rev.findings.length,
      errors: rev.findings.filter((f) => f.severity === "error").length,
      checks: checks.filter((c) => c.pageId === s.pageId && !c.waiver).length,
    };
  });

  // Whether each page's approval is of the version it is at now. Asked of the
  // database rather than inferred, since review_version is not in the node row
  // the tree reads.
  const { data: reviewRows } = await db
    .from("nodes")
    .select("id, review_status, review_version, content_version")
    .eq("parent_id", folderId)
    .eq("kind", "file");
  const reviewed = new Map(
    ((reviewRows as { id: string; review_status: string | null; review_version: number | null; content_version: number }[] | null) ?? []).map((r) => [
      r.id,
      r.review_status === "approved" && r.review_version === r.content_version,
    ]),
  );
  for (const s of screens) s.approvedCurrent = reviewed.get(s.pageId) ?? false;

  const tokens = loaded.tokens.page
    ? {
        id: loaded.tokens.page.id,
        name: loaded.tokens.page.name,
        path: loaded.tokens.page.path,
        version: loaded.tokens.page.content_version,
        approvedCurrent: reviewed.get(loaded.tokens.page.id) ?? false,
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

  const approval = await latestApproval(db, folderId);
  let approvalState: FlowOverview["approval"] = null;
  if (approval) {
    const current =
      approval.members.length === screens.length &&
      approval.members.every((m) => screens.find((s) => s.pageId === m.node_id)?.version === m.content_version) &&
      approval.tokens.every((t) => loaded.members.find((m) => m.id === t.node_id)?.content_version === t.content_version) &&
      loaded.members.filter((m) => m.content_type === "json").length === approval.tokens.length;
    approvalState = { ...approval, current };
  }

  const blockers: string[] = [];
  if (screens.length === 0) blockers.push("The flow has no screens yet.");
  for (const s of screens) {
    if (!s.approvedCurrent) blockers.push(`${s.name} is not approved at its current version.`);
    if (s.open) blockers.push(`${s.name} has ${s.open} open comment${s.open === 1 ? "" : "s"}.`);
    if (s.addressed) blockers.push(`${s.name} has ${s.addressed} addressed comment${s.addressed === 1 ? "" : "s"} waiting to be confirmed.`);
  }
  for (const m of loaded.members.filter((m) => m.content_type === "json")) {
    if (!reviewed.get(m.id)) blockers.push(`${m.name} is not approved at its current version.`);
  }

  return {
    folder,
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

export async function addWaiver(
  folderId: string,
  key: string,
  message: string,
  note: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  if (!note.trim()) return { ok: false, error: "Say why this is acceptable.", status: 400 };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not found.", status: 404 };
  const { error } = await supabase.from("mockup_waivers").upsert(
    { folder_id: folderId, check_key: key, message: message.slice(0, 1000), note: note.trim().slice(0, 2000), created_by: user.id },
    { onConflict: "folder_id,check_key" },
  );
  if (error) return { ok: false, error: /row-level/i.test(error.message) ? "Only somebody who can edit this flow can waive a check." : error.message, status: 403 };
  return { ok: true };
}

export async function removeWaiver(folderId: string, key: string) {
  const supabase = await createClient();
  const { error } = await supabase.from("mockup_waivers").delete().eq("folder_id", folderId).eq("check_key", key);
  return error ? { ok: false as const, error: error.message, status: 400 } : { ok: true as const };
}

export async function approveFlow(db: Db, folderId: string) {
  // Make sure every screen's current version has a stored copy to freeze.
  await loadFlow(db, folderId);
  const { error } = await db.rpc("approve_flow", { p_folder_id: folderId });
  if (!error) return { ok: true as const };
  if (/not found/i.test(error.message)) return { ok: false as const, error: "Not found.", status: 404 };
  return { ok: false as const, error: error.message, status: 409 };
}

/**
 * The handover for a flow's latest approval, built from what was frozen.
 * Null with a reason when there is no approval that still stands.
 */
export async function flowHandover(
  db: Db,
  folderId: string,
): Promise<{ ok: true; handover: Handover; approval: Approval; folder: FlowFolder } | { ok: false; error: string; blockers?: string[] }> {
  const overview = await flowOverview(db, folderId);
  if (!overview) return { ok: false, error: "Not found." };
  const approval = overview.approval;
  if (!approval) {
    return { ok: false, error: "This flow has not been approved.", blockers: overview.blockers };
  }
  if (!approval.current) {
    return {
      ok: false,
      error: "This flow was approved, but a screen or its tokens have changed since. It needs approving again.",
      blockers: overview.blockers,
    };
  }

  const screens = [];
  for (const m of approval.members) {
    const html = m.snapshot_key ? await readArtifact(m.snapshot_key) : null;
    if (html === null) return { ok: false, error: `The stored copy of ${m.name} could not be read.` };
    screens.push({ pageId: m.node_id, name: m.name, version: m.content_version, html });
  }

  const tokenPage = approval.tokens.find((t) => t.content && t.node_id === overview.tokens?.id) ?? approval.tokens[0];

  const decisions: HandoverDecision[] = [];
  for (const m of approval.members) {
    const { data } = await db.rpc("node_comments", { p_node_id: m.node_id });
    for (const c of (data as Comment[] | null) ?? []) {
      if (c.parent_id || c.deleted) continue;
      if (c.status !== "resolved" && c.status !== "wont_fix") continue;
      decisions.push({
        status: c.status,
        screen: overview.screens.find((s) => s.pageId === m.node_id)?.slug ?? m.name,
        anchor: describeAnchor(c.anchor ?? null),
        body: c.body,
        note: c.status_note ?? null,
        author: c.author_email,
      });
    }
  }

  const handover = buildHandover({
    flowName: overview.folder.name,
    flowPath: overview.folder.path,
    approvedBy: approval.approved_by_email,
    approvedAt: approval.approved_at,
    screens,
    tokens: tokenPage?.content ? { name: tokenPage.name, version: tokenPage.content_version, json: tokenPage.content } : null,
    decisions,
    waivers: approval.waivers.map((w) => ({ key: w.key, message: w.message, note: w.note, by: w.by })),
  });

  return { ok: true, handover, approval, folder: overview.folder };
}
