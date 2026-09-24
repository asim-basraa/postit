import {
  setAttributes,
  unwrap,
  vocabularyOf,
  wrapText,
  allIds,
  newId,
  screenSlug,
  type Finding,
  type ScreenMeta,
  type SpecNode,
} from "@postit/mockup-spec";
import { createClient, currentUser } from "@/lib/supabase/server";
import { nodeCapabilities, saveNodeContent } from "@/lib/nodes";
import { listComments, type Comment } from "@/lib/comments";
import { nodeReview, type Review } from "@/lib/review";
import { readArtifact } from "@/lib/artifacts";
import {
  ensureRevision,
  flowOf,
  listMockupVersions,
  loadFlow,
  revisionAt,
  adoptInlineHtml,
  type FlowFolder,
} from "@/lib/mockups";

/**
 * Everything the review screen needs about one mockup, in one answer.
 *
 * Read as the viewer, so a page they cannot read is simply not found. The
 * flow's other screens come along because the destination picker, the
 * autocomplete and the click-through all need to know what else exists.
 */

export type FlowScreenSummary = {
  pageId: string;
  name: string;
  path: string;
  slug: string;
  route: string | null;
  nodes: { id: string; slug: string | null; text: string; ancestors: string[] }[];
};

export type TokenSummary = { path: string; value: string; cssVar: string; type: string | null; normalised: string | null };

export type MockupView = {
  node: {
    id: string;
    name: string;
    path: string;
    space_id: string;
    space_slug: string;
    content_version: number;
    artifact_token: string | null;
  };
  /** The version being shown, which is the current one unless asked otherwise. */
  version: number;
  current: boolean;
  screen: ScreenMeta;
  nodes: SpecNode[];
  findings: Finding[];
  versions: { content_version: number; created_at: string; updated_at: string }[];
  comments: Comment[];
  canEdit: boolean;
  viewerId: string | null;
  isAuthor: boolean;
  review: Review | null;
  flow: (FlowFolder & { screens: FlowScreenSummary[] }) | null;
  vocabulary: ReturnType<typeof vocabularyOf>;
  tokens: { page: { id: string; name: string; path: string } | null; list: TokenSummary[] };
};

type Row = {
  id: string;
  name: string;
  path: string;
  space_id: string;
  content_version: number;
  content_type: string | null;
  artifact_key: string | null;
  artifact_token: string | null;
  content: string | null;
  spaces: { slug: string } | { slug: string }[] | null;
};

export async function getMockupNode(nodeId: string): Promise<Row | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("nodes")
    .select("id, name, path, space_id, content_version, content_type, artifact_key, artifact_token, content, spaces(slug)")
    .eq("id", nodeId)
    .maybeSingle();
  const row = data as Row | null;
  if (!row || row.content_type !== "html") return null;
  await adoptInlineHtml(supabase, row);
  return row;
}

export async function loadMockupView(nodeId: string, version?: number | null): Promise<MockupView | null> {
  const supabase = await createClient();
  const node = await getMockupNode(nodeId);
  if (!node) return null;

  const current = !version || version === node.content_version;
  const revision = current
    ? await ensureRevision(supabase, node)
    : await revisionAt(supabase, node.id, version!);
  if (!revision) return null;

  const [{ canEdit }, user, versions, comments, review, folder] = [
    await nodeCapabilities(node.id),
    await currentUser(),
    await listMockupVersions(supabase, node.id),
    await listComments(node.id),
    await nodeReview(node.id),
    await flowOf(supabase, node.id),
  ];

  let flow: MockupView["flow"] = null;
  let tokens: MockupView["tokens"] = { page: null, list: [] };
  let vocabulary = vocabularyOf([
    { pageId: node.id, name: node.name, path: node.path, meta: revision.screen, nodes: revision.nodes, offToken: null },
  ]);

  if (folder) {
    const loaded = await loadFlow(supabase, folder.id);
    flow = {
      ...folder,
      screens: loaded.screens.map((s) => ({
        pageId: s.pageId,
        name: s.name,
        path: s.path,
        slug: screenSlug(s),
        route: s.meta.route,
        nodes: s.nodes.map((n) => ({ id: n.id, slug: n.slug, text: n.text, ancestors: n.ancestors })),
      })),
    };
    vocabulary = vocabularyOf(loaded.screens);
    if (loaded.tokens.set) {
      tokens = {
        page: loaded.tokens.page,
        list: loaded.tokens.set.tokens.map((t) => ({
          path: t.path,
          value: t.value,
          cssVar: t.cssVar,
          type: t.type,
          normalised: t.normalised,
        })),
      };
    }
  }

  const spaceSlug = Array.isArray(node.spaces) ? node.spaces[0]?.slug : node.spaces?.slug;

  return {
    node: {
      id: node.id,
      name: node.name,
      path: node.path,
      space_id: node.space_id,
      space_slug: spaceSlug ?? "",
      content_version: node.content_version,
      artifact_token: node.artifact_token,
    },
    version: revision.content_version,
    current,
    screen: revision.screen,
    nodes: revision.nodes,
    findings: revision.findings,
    versions,
    comments,
    canEdit,
    viewerId: user?.id ?? null,
    isAuthor: review?.may_ask ?? false,
    review,
    flow,
    vocabulary,
    tokens,
  };
}

export type EditRequest =
  | { op: "set"; version: number; pid: string; set: Record<string, string | null> }
  | { op: "wrap"; version: number; pid: string; start: number; end: number; attrs: Record<string, string> }
  | { op: "unwrap"; version: number; pid: string };

export type EditOutcome =
  | { ok: true; version: number; id?: string }
  | { ok: false; error: string; status: number; version?: number };

/**
 * Writes a change into the mockup's HTML as a new version.
 *
 * The version the panel was looking at has to be the current one: a change made
 * against an older copy would silently undo whatever Claude Design saved in the
 * meantime. The save itself goes through the ordinary path, so the same lock,
 * the same permission check and the same revision recording apply.
 */
export async function editMockup(nodeId: string, req: EditRequest): Promise<EditOutcome> {
  const node = await getMockupNode(nodeId);
  if (!node || !node.artifact_key) return { ok: false, error: "Not found.", status: 404 };

  if (node.content_version !== req.version) {
    return {
      ok: false,
      status: 409,
      version: node.content_version,
      error: `This screen has been saved since (it is now version ${node.content_version}). The panel has reloaded it; make the change again.`,
    };
  }

  const html = await readArtifact(node.artifact_key);
  if (html === null) return { ok: false, error: "Could not read the file.", status: 502 };

  let next: string;
  let createdId: string | undefined;

  if (req.op === "set") {
    const r = setAttributes(html, req.pid, req.set);
    if (!r.ok) return { ok: false, error: r.error, status: 400 };
    next = r.html;
  } else if (req.op === "wrap") {
    const taken = allIds(html);
    let id = newId();
    while (taken.has(id)) id = newId();
    const r = wrapText(html, req.pid, req.start, req.end, req.attrs, () => id);
    if (!r.ok) return { ok: false, error: r.error, status: 400 };
    next = r.html;
    createdId = r.id;
  } else {
    const r = unwrap(html, req.pid);
    if (!r.ok) return { ok: false, error: r.error, status: 400 };
    next = r.html;
  }

  if (next === html) return { ok: true, version: node.content_version };

  const saved = await saveNodeContent(node.id, next, req.version);
  if (!saved.ok) return { ok: false, error: saved.error, status: saved.status };
  return { ok: true, version: saved.node.content_version, id: createdId };
}
