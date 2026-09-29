import type { SupabaseClient } from "@supabase/supabase-js";
import { recordScreenVersion, type WaveAsset, type WaveComment, type WaveHost, type WaveMember, type WaveScreen } from "@wave/server";
import { ASSET_MAX_BYTES, sniffAsset } from "@wave/spec/assets";
import { supabaseWaveStore } from "@wave/db";
import { createClient } from "@/lib/supabase/server";
import { assetKey, putArtifact, putAssetObject, putSnapshot, readArtifact, readAssetObject, removeArtifact } from "@/lib/artifacts";

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

/** The public origin assets are served from. */
export function siteOrigin(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

type FolderRow = { id: string; name: string; path: string; space_id: string; is_project: boolean; kind: string };

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

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

  const folderAt = async (spaceId: string, path: string) => {
    const { data } = await db.from("nodes").select("id, name, path, space_id, is_project, kind").eq("space_id", spaceId).eq("path", path).maybeSingle();
    return (data as FolderRow | null) ?? null;
  };

  /** A folder under a parent, made if it is missing. */
  const ensureFolder = async (parent: { id: string; space_id: string; path: string }, name: string) => {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const existing = await folderAt(parent.space_id, `${parent.path}/${slug}`);
    if (existing) return existing;
    const id = crypto.randomUUID();
    const { error } = await db.from("nodes").insert({ id, space_id: parent.space_id, parent_id: parent.id, kind: "folder", name });
    if (error) return null;
    return folderAt(parent.space_id, `${parent.path}/${slug}`);
  };

  /** A file in a folder, by slug. */
  const fileIn = async (folderId: string, slug: string) => {
    const { data } = await db
      .from("nodes")
      .select("id, content, content_version, content_type")
      .eq("parent_id", folderId)
      .eq("slug", slug)
      .eq("kind", "file")
      .maybeSingle();
    return data as { id: string; content: string | null; content_version: number; content_type: string } | null;
  };

  /** Creates a text page (article or JSON), or saves new content into the one with that slug. */
  const upsertPage = async (folderId: string, slug: string, title: string, content: string, contentType: "article" | "json"): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> => {
    const existing = await fileIn(folderId, slug);
    if (existing) {
      if ((existing.content ?? "") === content) return { ok: true, id: existing.id };
      const { saveNodeContent } = await import("@/lib/nodes");
      const saved = await saveNodeContent(existing.id, content, existing.content_version, db as Awaited<ReturnType<typeof createClient>>);
      return saved.ok ? { ok: true, id: existing.id } : saved;
    }
    const { data: parent } = await db.from("nodes").select("id, space_id").eq("id", folderId).maybeSingle();
    const p = parent as { id: string; space_id: string } | null;
    if (!p) return { ok: false, error: "Not found.", status: 404 };
    const id = crypto.randomUUID();
    const { error } = await db.from("nodes").insert({ id, space_id: p.space_id, parent_id: p.id, kind: "file", name: title, content, content_type: contentType });
    return error ? { ok: false, error: error.message, status: 403 } : { ok: true, id };
  };

  const folderRow = async (id: string) => {
    const { data } = await db.from("nodes").select("id, name, path, space_id, is_project, kind").eq("id", id).maybeSingle();
    const row = data as FolderRow | null;
    return row && row.kind === "folder" ? row : null;
  };

  const projectRow = async (id: string) => {
    const { data } = await db.from("nodes").select("id, name, path, space_id, is_project, kind").eq("id", id).maybeSingle();
    const row = data as FolderRow | null;
    return row && row.kind === "folder" && row.is_project ? row : null;
  };

  const host: WaveHost = {
    viewer: user ? { id: user.id, label: user.email ?? null } : null,
    store,
    blobs,

    projects: {
      async projectOf(id) {
        const { data } = await db.from("nodes").select("id, space_id, path, kind, is_project").eq("id", id).maybeSingle();
        const node = data as { id: string; space_id: string; path: string; kind: string; is_project: boolean } | null;
        if (!node) return null;
        const parts = node.path.split("/");
        const prefixes = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
        const { data: rows } = await db
          .from("nodes")
          .select("id, name, path, space_id, is_project, kind")
          .eq("space_id", node.space_id)
          .eq("kind", "folder")
          .eq("is_project", true)
          .in("path", prefixes);
        const found = ((rows as FolderRow[] | null) ?? []).sort((a, b) => b.path.length - a.path.length)[0];
        return found ? { id: found.id, name: found.name, path: found.path, space_id: found.space_id } : null;
      },

      async project(id) {
        const row = await projectRow(id);
        return row ? { id: row.id, name: row.name, path: row.path, space_id: row.space_id } : null;
      },

      async setProject(id, isProject) {
        const { data, error } = await db
          .from("nodes")
          .update({ is_project: isProject })
          .eq("id", id)
          .eq("kind", "folder")
          .select("id, name, path, space_id")
          .maybeSingle();
        if (error) return { ok: false, error: /nodes_project_not_flow/.test(error.message) ? "A feature (flow) cannot also be a project." : error.message, status: 400 };
        if (!data) return { ok: false, error: "Not found.", status: 404 };
        if (isProject) {
          const ds = await ensureFolder(data as FolderRow, "design-system");
          if (ds) await ensureFolder(ds, "components");
        }
        return { ok: true };
      },

      async tokens(projectId) {
        const p = await projectRow(projectId);
        if (!p) return null;
        const { data } = await db
          .from("nodes")
          .select("id, content, content_version, content_type")
          .eq("space_id", p.space_id)
          .eq("path", `${p.path}/design-system/tokens`)
          .maybeSingle();
        const row = data as { id: string; content: string | null; content_version: number; content_type: string } | null;
        return row && row.content_type === "json" && row.content ? { id: row.id, content: row.content, version: row.content_version } : null;
      },

      async specimens(projectId) {
        const p = await projectRow(projectId);
        if (!p) return [];
        const { data } = await db
          .from("nodes")
          .select("id")
          .eq("space_id", p.space_id)
          .eq("kind", "file")
          .eq("content_type", "html")
          .like("path", `${p.path}/design-system/components/%`)
          .order("name");
        const out: WaveScreen[] = [];
        for (const r of (data as { id: string }[] | null) ?? []) {
          const s = await host.resources.screen(r.id);
          if (s) out.push(s);
        }
        return out;
      },

      async screens(projectId) {
        const p = await projectRow(projectId);
        if (!p) return [];
        const { data } = await db
          .from("nodes")
          .select("id, path, parent_id")
          .eq("space_id", p.space_id)
          .eq("kind", "file")
          .eq("content_type", "html")
          .like("path", `${p.path}/%`)
          .not("path", "like", `${p.path}/design-system/%`)
          .order("path");
        const rows = (data as { id: string; path: string; parent_id: string | null }[] | null) ?? [];
        const parents = [...new Set(rows.map((r) => r.parent_id).filter(Boolean) as string[])];
        const { data: flows } = parents.length
          ? await db.from("nodes").select("id, is_flow").in("id", parents)
          : { data: [] as { id: string; is_flow: boolean }[] };
        const isFlow = new Map(((flows as { id: string; is_flow: boolean }[] | null) ?? []).map((f) => [f.id, f.is_flow]));
        const out: (WaveScreen & { flow_id: string | null })[] = [];
        for (const r of rows) {
          const s = await host.resources.screen(r.id);
          if (s) out.push({ ...s, flow_id: r.parent_id && isFlow.get(r.parent_id) ? r.parent_id : null });
        }
        return out;
      },

      async componentsFolder(projectId) {
        const p = await projectRow(projectId);
        if (!p) return null;
        const ds = await ensureFolder(p, "design-system");
        const c = ds ? await ensureFolder(ds, "components") : null;
        return c ? { id: c.id, path: c.path } : null;
      },
    },

    assets: {
      baseUrl: (projectId) => `${siteOrigin()}/a/${projectId}/`,

      async put(projectId, name, bytes) {
        if (!user) return { ok: false, error: "Not found.", status: 404 };
        if (bytes.byteLength > ASSET_MAX_BYTES) return { ok: false, error: "That file is over 10 MB.", status: 413 };
        const type = sniffAsset(bytes);
        if (!type) return { ok: false, error: "Only images (PNG, JPEG, GIF, WebP, AVIF, SVG, ICO) and fonts (WOFF2, WOFF, TTF, OTF) can be uploaded.", status: 415 };
        const project = await projectRow(projectId);
        if (!project) return { ok: false, error: "Not found.", status: 404 };
        const hash = await sha256(bytes);
        const toAsset = (r: { hash: string; ext: string; mime: string; bytes: number; name: string; created_at: string }): WaveAsset => ({
          ...r,
          url: `${siteOrigin()}/a/${projectId}/${r.hash}.${r.ext}`,
        });
        const { data: existing } = await db
          .from("wave_assets")
          .select("hash, ext, mime, bytes, name, created_at")
          .eq("project_id", projectId)
          .eq("hash", hash)
          .maybeSingle();
        if (existing) return { ok: true, asset: toAsset(existing as never), existing: true };
        const key = assetKey(projectId, hash, type.ext);
        if (!(await putAssetObject(key, bytes, type.mime))) return { ok: false, error: "Could not store that file.", status: 502 };
        const row = { project_id: projectId, hash, ext: type.ext, mime: type.mime, bytes: bytes.byteLength, name: name.slice(0, 200), created_by: user.id };
        const { error } = await db.from("wave_assets").insert(row);
        if (error) {
          await removeArtifact(key);
          return { ok: false, error: /row-level/i.test(error.message) ? "Only somebody who can edit this project can upload to it." : error.message, status: 403 };
        }
        return { ok: true, asset: toAsset({ ...row, created_at: new Date().toISOString() }), existing: false };
      },

      async list(projectId) {
        const { data } = await db
          .from("wave_assets")
          .select("hash, ext, mime, bytes, name, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false });
        return ((data as { hash: string; ext: string; mime: string; bytes: number; name: string; created_at: string }[] | null) ?? []).map((r) => ({
          ...r,
          url: `${siteOrigin()}/a/${projectId}/${r.hash}.${r.ext}`,
        }));
      },

      read: (projectId, hash, ext) => readAssetObject(assetKey(projectId, hash, ext)),
    },

    documents: {
      async read(folderId, name) {
        const { data } = await db
          .from("nodes")
          .select("id, content, content_version")
          .eq("parent_id", folderId)
          .eq("slug", name)
          .eq("kind", "file")
          .maybeSingle();
        const row = data as { id: string; content: string | null; content_version: number } | null;
        return row ? { id: row.id, content: row.content ?? "", version: row.content_version } : null;
      },

      async write(folderId, name, content) {
        const title = name === "wave-questions" ? "Wave questions" : name === "wave-answers" ? "Wave answers" : name;
        return upsertPage(folderId, name, title, content, "article");
      },
    },

    // A feature's (or project's) mock API lives in its api/ folder: the
    // OpenAPI document, a mocks/ folder of response bodies, and the data
    // requirements page. A subfolder, so none of it is mistaken for a screen
    // or a token file of the flow.
    api: {
      async read(folderId) {
        const folder = await folderRow(folderId);
        if (!folder) return null;
        const api = await folderAt(folder.space_id, `${folder.path}/api`);
        if (!api) return null;
        const openapi = await fileIn(api.id, "openapi");
        const req = await fileIn(api.id, "data-requirements");
        const mocksFolder = await folderAt(folder.space_id, `${folder.path}/api/mocks`);
        const mocks: Record<string, string> = {};
        if (mocksFolder) {
          const { data } = await db.from("nodes").select("name, content").eq("parent_id", mocksFolder.id).eq("kind", "file").eq("content_type", "json");
          for (const m of (data as { name: string; content: string | null }[] | null) ?? []) mocks[m.name] = m.content ?? "";
        }
        return {
          openapi: openapi && openapi.content ? { id: openapi.id, content: openapi.content, version: openapi.content_version } : null,
          mocks,
          requirements: req ? { id: req.id, content: req.content ?? "" } : null,
        };
      },

      async write(folderId, files) {
        const folder = await folderRow(folderId);
        if (!folder) return { ok: false, error: "Not found.", status: 404 };
        const api = await ensureFolder(folder, "api");
        if (!api) return { ok: false, error: "Could not make the api folder.", status: 403 };
        const written: string[] = [];
        if (files.openapi !== undefined) {
          const r = await upsertPage(api.id, "openapi", "openapi", files.openapi, "json");
          if (!r.ok) return r;
          written.push("api/openapi");
        }
        if (files.requirements !== undefined) {
          const r = await upsertPage(api.id, "data-requirements", "Data requirements", files.requirements, "article");
          if (!r.ok) return r;
          written.push("api/data-requirements");
        }
        if (files.mocks && Object.keys(files.mocks).length) {
          const mocks = await ensureFolder(api, "mocks");
          if (!mocks) return { ok: false, error: "Could not make the mocks folder.", status: 403 };
          for (const [name, body] of Object.entries(files.mocks)) {
            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
            if (body === null) {
              const existing = await fileIn(mocks.id, slug);
              if (existing) {
                // A JSON page has no stored file of its own, so the row is all there is.
                const { error } = await db.from("nodes").delete().eq("id", existing.id);
                if (error) return { ok: false, error: error.message, status: 403 };
                written.push(`api/mocks/${name} (removed)`);
              }
              continue;
            }
            const r = await upsertPage(mocks.id, slug, name, body, "json");
            if (!r.ok) return r;
            written.push(`api/mocks/${name}`);
          }
        }
        return { ok: true, written };
      },
    },

    links: {
      screen: (id) => `${siteOrigin()}/review/${id}`,
      prototype: (id) => `${siteOrigin()}/prototype/${id}`,
    },

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

      async put(folderId, name, html) {
        const folder = await folderRow(folderId);
        if (!folder) return { ok: false, error: "Not found.", status: 404 };
        const { data: rows } = await db
          .from("nodes")
          .select("id, name, content_version, content_type")
          .eq("parent_id", folderId)
          .eq("kind", "file")
          .ilike("name", name.replace(/[%_\\]/g, "\\$&"));
        const existing = ((rows as { id: string; name: string; content_version: number; content_type: string }[] | null) ?? [])[0];
        if (existing) {
          if (existing.content_type !== "html") return { ok: false, error: `${existing.name} is not an HTML screen.`, status: 409 };
          const saved = await host.resources.save(existing.id, html, existing.content_version);
          return saved.ok ? { ok: true, id: existing.id, version: saved.version, created: false } : saved;
        }
        const artifact = await putArtifact(html);
        if (!artifact) return { ok: false, error: "Could not store that file.", status: 502 };
        const id = crypto.randomUUID();
        const { error } = await db.from("nodes").insert({
          id,
          space_id: folder.space_id,
          parent_id: folder.id,
          kind: "file",
          name,
          content_type: "html",
          content: null,
          artifact_key: artifact.key,
          artifact_token: artifact.token,
        });
        if (error) {
          await removeArtifact(artifact.key);
          return { ok: false, error: error.message, status: 403 };
        }
        const { data: row } = await db.from("nodes").select("content_version").eq("id", id).maybeSingle();
        const version = (row as { content_version: number } | null)?.content_version ?? 1;
        await recordScreenVersion(host, id, version, html);
        return { ok: true, id, version, created: true };
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
