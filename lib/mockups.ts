import type { SupabaseClient } from "@supabase/supabase-js";
import {
  findOffToken,
  parseMockup,
  parseTokens,
  screenSlug,
  type Finding,
  type FlowScreen,
  type ScreenMeta,
  type SpecNode,
  type TokenSet,
} from "@postit/mockup-spec";
import { putSnapshot, readArtifact, removeArtifact } from "@/lib/artifacts";

/**
 * What each version of an HTML mockup says about itself.
 *
 * Every save of an HTML page, from any door (the editor, an upload, an MCP
 * tool, an attribute edit in the review panel), comes through
 * recordMockupRevision. It keeps a copy of that version's bytes and what the
 * spec parser read out of them. The copy is what makes old versions, comparison
 * and frozen approvals possible, since the page's own file is overwritten in
 * place; the index is a cache, rebuilt from the copy whenever it is missing.
 *
 * Takes the database client as an argument because the two doors hold
 * different ones: the browser's comes from its cookies, an MCP session's from
 * its token. Both act as the person, so RLS decides either way.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

export type MockupRevision = {
  id: string;
  node_id: string;
  content_version: number;
  snapshot_key: string | null;
  screen: ScreenMeta;
  nodes: SpecNode[];
  findings: Finding[];
  extras: { css?: string[]; unidentified?: { tag: string; text: string }[] };
  created_at: string;
  updated_at: string;
};

/** Stored CSS is capped: it only feeds the off-token check, and a page is not a stylesheet archive. */
const CSS_CAP = 200_000;

const REVISION_SELECT =
  "id, node_id, content_version, snapshot_key, screen, nodes, findings, extras, created_at, updated_at";

export async function revisionAt(
  db: Db,
  nodeId: string,
  version: number,
): Promise<MockupRevision | null> {
  const { data } = await db
    .from("mockup_revisions")
    .select(REVISION_SELECT)
    .eq("node_id", nodeId)
    .eq("content_version", version)
    .maybeSingle();
  return (data as MockupRevision | null) ?? null;
}

async function previousRevision(db: Db, nodeId: string, version: number) {
  const { data } = await db
    .from("mockup_revisions")
    .select("nodes")
    .eq("node_id", nodeId)
    .lt("content_version", version)
    .order("content_version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { nodes: SpecNode[] } | null) ?? null;
}

/** Versions of a mockup that have a stored copy, newest first. */
export async function listMockupVersions(
  db: Db,
  nodeId: string,
): Promise<{ content_version: number; created_at: string; updated_at: string }[]> {
  const { data } = await db
    .from("mockup_revisions")
    .select("content_version, created_at, updated_at")
    .eq("node_id", nodeId)
    .order("content_version", { ascending: false });
  return (data as { content_version: number; created_at: string; updated_at: string }[] | null) ?? [];
}

/**
 * Records one version. Never fails the save that called it: a missing index is
 * rebuilt the next time anybody looks, and refusing somebody's work because a
 * cache could not be written would be the wrong way round.
 */
export async function recordMockupRevision(
  db: Db,
  nodeId: string,
  version: number,
  html: string,
): Promise<{ findings: Finding[]; revision: MockupRevision | null }> {
  try {
    const previous = await previousRevision(db, nodeId, version);
    // The same version recorded again (an append grows a file without moving
    // its version) replaces the copy; the old one would otherwise be left in
    // the bucket with nothing pointing at it.
    const same = await revisionAt(db, nodeId, version);
    const parsed = parseMockup(html, previous ?? undefined);
    const snapshot = await putSnapshot(nodeId, version, html);

    let cssTotal = 0;
    const css: string[] = [];
    for (const block of parsed.css) {
      if (cssTotal + block.length > CSS_CAP) break;
      css.push(block);
      cssTotal += block.length;
    }

    const row = {
      node_id: nodeId,
      content_version: version,
      snapshot_key: snapshot,
      screen: parsed.screen,
      nodes: parsed.nodes,
      findings: parsed.findings,
      extras: { css, unidentified: parsed.unidentifiedInteractive },
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await db
      .from("mockup_revisions")
      .upsert(row, { onConflict: "node_id,content_version" })
      .select(REVISION_SELECT)
      .maybeSingle();

    if (error) console.error("mockup revision failed for %s: %s", nodeId, error.message);
    else if (same?.snapshot_key && same.snapshot_key !== snapshot) await removeArtifact(same.snapshot_key);
    return { findings: parsed.findings, revision: (data as MockupRevision | null) ?? null };
  } catch (e) {
    console.error("mockup revision failed for %s: %s", nodeId, (e as Error).message);
    return { findings: [], revision: null };
  }
}

type HtmlNode = {
  id: string;
  name: string;
  path: string;
  content_version: number;
  artifact_key: string | null;
  content_type: string | null;
};

/**
 * The index of a page's current version, making it if it is missing: a page
 * saved before this existed, or a save whose index failed to write.
 */
export async function ensureRevision(db: Db, node: HtmlNode): Promise<MockupRevision | null> {
  const existing = await revisionAt(db, node.id, node.content_version);
  if (existing?.snapshot_key) return existing;
  if (!node.artifact_key) return existing;
  const html = await readArtifact(node.artifact_key);
  if (html === null) return existing;
  const { revision } = await recordMockupRevision(db, node.id, node.content_version, html);
  if (revision) return revision;

  // A reader who may not edit cannot write the index, but can still be shown
  // one, read from the bytes they are already allowed to see.
  const parsed = parseMockup(html);
  return {
    id: "",
    node_id: node.id,
    content_version: node.content_version,
    snapshot_key: null,
    screen: parsed.screen,
    nodes: parsed.nodes,
    findings: parsed.findings,
    extras: { css: parsed.css, unidentified: parsed.unidentifiedInteractive },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

/** The bytes of one version, or null. */
export async function versionHtml(
  db: Db,
  node: HtmlNode,
  version: number,
): Promise<string | null> {
  if (version === node.content_version && node.artifact_key) {
    return readArtifact(node.artifact_key);
  }
  const rev = await revisionAt(db, node.id, version);
  return rev?.snapshot_key ? readArtifact(rev.snapshot_key) : null;
}

/** Findings as a few lines of text, for an MCP answer. */
export function describeFindings(findings: Finding[]): string {
  if (findings.length === 0) return "Validation: no findings.";
  const order = { error: 0, warn: 1, info: 2 } as const;
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  return [
    `Validation: ${findings.length} finding${findings.length === 1 ? "" : "s"}.`,
    ...sorted.map((f) => `- [${f.severity}] ${f.code}${f.pid ? ` (${f.pid})` : ""}: ${f.message}`),
  ].join("\n");
}

// Flows --------------------------------------------------------------------------

export type FlowFolder = {
  id: string;
  name: string;
  path: string;
  space_id: string;
  is_flow: boolean;
};

export type FlowMember = HtmlNode & {
  review_status: "in_review" | "approved" | null;
  content: string | null;
};

export type FlowTokens = {
  page: { id: string; name: string; path: string; content_version: number; review_status: string | null } | null;
  set: TokenSet | null;
};

export async function flowOf(db: Db, nodeId: string): Promise<FlowFolder | null> {
  const { data: node } = await db
    .from("nodes")
    .select("parent_id")
    .eq("id", nodeId)
    .maybeSingle();
  const parentId = (node as { parent_id: string | null } | null)?.parent_id;
  if (!parentId) return null;
  const { data } = await db
    .from("nodes")
    .select("id, name, path, space_id, is_flow")
    .eq("id", parentId)
    .maybeSingle();
  const folder = data as FlowFolder | null;
  return folder?.is_flow ? folder : null;
}

export async function flowMembers(db: Db, folderId: string): Promise<FlowMember[]> {
  const { data } = await db
    .from("nodes")
    .select("id, name, path, content_version, artifact_key, content_type, review_status, content")
    .eq("parent_id", folderId)
    .eq("kind", "file")
    .in("content_type", ["html", "json"])
    .order("name", { ascending: true });
  return (data as FlowMember[] | null) ?? [];
}

/**
 * The flow's token page: the JSON page its screens name with pi:tokens, or
 * failing that the first JSON page in it that is DTCG.
 */
export function pickTokens(members: FlowMember[], wanted: (string | null)[]): FlowTokens {
  const json = members.filter((m) => m.content_type === "json");
  const names = wanted.filter(Boolean).map((w) => w!.toLowerCase());
  const byName = json.find((m) => names.includes(m.name.toLowerCase()) || names.includes(m.path.split("/").pop()!.toLowerCase()));
  for (const candidate of byName ? [byName, ...json] : json) {
    const set = parseTokens(candidate.content ?? "");
    if (set) {
      return {
        page: {
          id: candidate.id,
          name: candidate.name,
          path: candidate.path,
          content_version: candidate.content_version,
          review_status: candidate.review_status,
        },
        set,
      };
    }
  }
  return { page: null, set: null };
}

export type LoadedFlow = {
  members: FlowMember[];
  screens: FlowScreen[];
  revisions: Map<string, MockupRevision>;
  tokens: FlowTokens;
};

/** Every screen of a flow with its current index, and the flow's tokens. */
export async function loadFlow(db: Db, folderId: string): Promise<LoadedFlow> {
  const members = await flowMembers(db, folderId);
  const revisions = new Map<string, MockupRevision>();
  for (const m of members) {
    if (m.content_type !== "html") continue;
    const rev = await ensureRevision(db, m);
    if (rev) revisions.set(m.id, rev);
  }
  const tokens = pickTokens(
    members,
    [...revisions.values()].map((r) => r.screen.tokens),
  );

  const screens: FlowScreen[] = members
    .filter((m) => m.content_type === "html" && revisions.has(m.id))
    .map((m) => {
      const rev = revisions.get(m.id)!;
      return {
        pageId: m.id,
        name: m.name,
        path: m.path,
        meta: rev.screen,
        nodes: rev.nodes,
        offToken: tokens.set ? findOffToken(rev.extras.css ?? [], tokens.set) : null,
        unidentifiedInteractive: rev.extras.unidentified ?? [],
      };
    });

  return { members, screens, revisions, tokens };
}

export { screenSlug };
