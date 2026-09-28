import type { SupabaseClient } from "@supabase/supabase-js";
import { recordScreenVersion, type WaveComment, type WaveHost, type WaveMember, type WaveScreen } from "@wave/server";
import { supabaseWaveStore } from "@wave/db";
import { createClient } from "@/lib/supabase/server";
import { putArtifact, putSnapshot, readArtifact, removeArtifact } from "@/lib/artifacts";

/**
 * Post-it as a Wave host.
 *
 * A screen is an HTML page, a flow is a folder marked is_flow, the viewer is
 * the signed-in person and every permission is the one Post-it already has
 * (can_read, can_edit, the page review). Made per request, from the client of
 * whoever is asking: the browser's cookies or an MCP session's token.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = SupabaseClient<any, any, any>;

type NodeRow = {
  id: string;
  name: string;
  path: string;
  space_id: string;
  content_version: number;
  content_type: string | null;
  artifact_key: string | null;
  artifact_token: string | null;
  content: string | null;
  spaces?: { slug: string } | { slug: string }[] | null;
};

/** A Post-it page as Wave sees it. The extra fields are what Post-it's own screens use. */
export type PostitScreen = WaveScreen & {
  space_id: string;
  space_slug: string;
  artifact_token: string | null;
  artifact_key: string | null;
};

const SCREEN_SELECT = "id, name, path, space_id, content_version, content_type, artifact_key, artifact_token, content, spaces(slug)";

export async function postitWave(client?: Db): Promise<WaveHost> {
  const db = client ?? ((await createClient()) as Db);
  const { data: auth } = await db.auth.getUser();
  const user = auth.user;
  const store = supabaseWaveStore(db);
  const screens = new Map<string, PostitScreen>();

  const blobs: WaveHost["blobs"] = {
    putSnapshot,
    read: readArtifact,
    remove: removeArtifact,
  };

  const host: WaveHost = {
    viewer: user ? { id: user.id, label: user.email ?? null } : null,
    store,
    blobs,

    resources: {
      async screen(id) {
        const cached = screens.get(id);
        if (cached) return cached;
        const { data } = await db.from("nodes").select(SCREEN_SELECT).eq("id", id).maybeSingle();
        const row = data as NodeRow | null;
        if (!row || row.content_type !== "html") return null;
        await adoptInlineHtml(host, db, row);
        const slug = Array.isArray(row.spaces) ? row.spaces[0]?.slug : row.spaces?.slug;
        const screen: PostitScreen = {
          id: row.id,
          name: row.name,
          path: row.path,
          content_version: row.content_version,
          space_id: row.space_id,
          space_slug: slug ?? "",
          artifact_token: row.artifact_token,
          artifact_key: row.artifact_key,
        };
        screens.set(id, screen);
        return screen;
      },

      async readCurrent(screen) {
        const key = (screen as PostitScreen).artifact_key;
        return key ? readArtifact(key) : null;
      },

      async save(screenId, html, baseVersion) {
        // Imported here: lib/nodes imports this module for its own saves.
        const { saveNodeContent } = await import("@/lib/nodes");
        screens.delete(screenId);
        const saved = await saveNodeContent(screenId, html, baseVersion, db as Awaited<ReturnType<typeof createClient>>);
        return saved.ok ? { ok: true, version: saved.node.content_version } : saved;
      },

      async flowOf(screenId) {
        const { data: node } = await db.from("nodes").select("parent_id").eq("id", screenId).maybeSingle();
        const parentId = (node as { parent_id: string | null } | null)?.parent_id;
        if (!parentId) return null;
        const flow = await host.resources.flow(parentId);
        return flow?.is_flow ? flow : null;
      },

      async flow(id) {
        const { data } = await db
          .from("nodes")
          .select("id, name, path, space_id, is_flow, kind")
          .eq("id", id)
          .maybeSingle();
        const row = data as { id: string; name: string; path: string; space_id: string; is_flow: boolean; kind: string } | null;
        if (!row || row.kind !== "folder") return null;
        return { id: row.id, name: row.name, path: row.path, space_id: row.space_id, is_flow: row.is_flow };
      },

      async setFlow(id, isFlow) {
        const { data, error } = await db
          .from("nodes")
          .update({ is_flow: isFlow })
          .eq("id", id)
          .eq("kind", "folder")
          .select("id")
          .maybeSingle();
        if (error) return { ok: false, error: error.message, status: 400 };
        if (!data) return { ok: false, error: "Not found.", status: 404 };
        return { ok: true };
      },

      async members(flowId) {
        const { data } = await db
          .from("nodes")
          .select("id, name, path, content_version, content_type, review_status, review_version, content")
          .eq("parent_id", flowId)
          .eq("kind", "file")
          .in("content_type", ["html", "json"])
          .order("name", { ascending: true });
        type Row = {
          id: string;
          name: string;
          path: string;
          content_version: number;
          content_type: string;
          review_status: "in_review" | "approved" | null;
          review_version: number | null;
          content: string | null;
        };
        return ((data as Row[] | null) ?? []).map(
          (r): WaveMember => ({
            id: r.id,
            name: r.name,
            path: r.path,
            kind: r.content_type === "html" ? "screen" : "tokens",
            content_version: r.content_version,
            review_status: r.review_status,
            approved_current: r.review_status === "approved" && r.review_version === r.content_version,
            content: r.content_type === "json" ? r.content : null,
          }),
        );
      },

      async canEdit(id) {
        const { data } = await db
          .rpc("node_capabilities", { p_node_id: id })
          .maybeSingle<{ can_edit: boolean; can_admin: boolean }>();
        return data?.can_edit === true;
      },

      async isAuthor(screenId) {
        const { data } = await db.rpc("node_review", { p_node_id: screenId }).maybeSingle<{ may_ask: boolean }>();
        return data?.may_ask === true;
      },

      async extras(screen) {
        const { data } = await db.rpc("node_review", { p_node_id: screen.id }).maybeSingle();
        return { review: data ?? null };
      },
    },

    comments: {
      async list(screenId) {
        const { data, error } = await db.rpc("node_comments", { p_node_id: screenId });
        if (error) console.error("node_comments failed for %s: %s", screenId, error.message);
        return (data as WaveComment[] | null) ?? [];
      },

      async statuses(screenIds) {
        if (screenIds.length === 0) return [];
        const { data } = await db
          .from("comments")
          .select("node_id, status")
          .in("node_id", screenIds)
          .is("parent_id", null)
          .is("deleted_at", null);
        return ((data as { node_id: string; status: WaveComment["status"] }[] | null) ?? []).map((c) => ({
          screen_id: c.node_id,
          status: c.status,
        }));
      },

      async setStatus(commentId, status, note, version) {
        const { error } = await db.rpc("set_comment_status", {
          p_comment_id: commentId,
          p_status: status,
          p_note: note,
          p_version: version,
        });
        if (!error) return { ok: true };
        return /not found/i.test(error.message)
          ? { ok: false, error: "Not found.", status: 404 }
          : { ok: false, error: error.message, status: 403 };
      },
    },
  };

  return host;
}

/**
 * Moves an HTML page whose bytes are still in the content column into a file.
 *
 * Every HTML page is supposed to be a file with an address; one written
 * straight into the database (a seed, a restore, an older version of the
 * product) is not. The first person who may edit it and opens it moves it,
 * through the ordinary update policy, so a reader cannot. Mutates the row.
 */
export async function adoptInlineHtml(
  host: WaveHost,
  db: Db,
  node: Pick<NodeRow, "id" | "content_type" | "artifact_key" | "content" | "content_version"> & { artifact_token?: string | null },
): Promise<void> {
  if (node.content_type !== "html" || node.artifact_key || !node.content) return;
  const artifact = await putArtifact(node.content);
  if (!artifact) return;
  const { data } = await db
    .from("nodes")
    .update({ content: null, artifact_key: artifact.key, artifact_token: artifact.token })
    .eq("id", node.id)
    .is("artifact_key", null)
    .select("id")
    .maybeSingle();
  if (!data) {
    await removeArtifact(artifact.key);
    return;
  }
  const html = node.content;
  node.artifact_key = artifact.key;
  node.artifact_token = artifact.token;
  node.content = null;
  await recordScreenVersion(host, node.id, node.content_version, html);
}

/** Records a version of a Post-it HTML page, for the save paths that do not hold a host. */
export async function recordMockupVersion(db: Db, nodeId: string, version: number, html: string) {
  return recordScreenVersion(await postitWave(db), nodeId, version, html);
}
