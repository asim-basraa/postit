import {
  allIds,
  newId,
  screenSlug,
  setAttributes,
  unwrap,
  upgradePrefix,
  vocabularyOf,
  wrapText,
  type Finding,
  type ScreenMeta,
  type SpecNode,
} from "@wave/spec";
import type { HostResult, VersionListing, WaveComment, WaveFlow, WaveHost, WaveScreen } from "./host";
import { loadFlow } from "./flow";
import { ensureVersion } from "./versions";

/**
 * Everything the review screen needs about one screen, in one answer.
 *
 * Read as the viewer, so a screen they cannot read is simply not found. The
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

export type ScreenView = {
  /** The host's screen record, with whatever fields the host adds. */
  node: WaveScreen;
  /** The version being shown, which is the current one unless asked otherwise. */
  version: number;
  current: boolean;
  screen: ScreenMeta;
  nodes: SpecNode[];
  findings: Finding[];
  versions: VersionListing[];
  comments: WaveComment[];
  canEdit: boolean;
  viewerId: string | null;
  isAuthor: boolean;
  flow: (WaveFlow & { screens: FlowScreenSummary[] }) | null;
  vocabulary: ReturnType<typeof vocabularyOf>;
  tokens: { page: { id: string; name: string; path: string } | null; list: TokenSummary[] };
  /** Whatever the host added with resources.extras. */
  host: Record<string, unknown>;
};

export async function loadScreenView(host: WaveHost, screenId: string, version?: number | null): Promise<ScreenView | null> {
  const node = await host.resources.screen(screenId);
  if (!node) return null;

  const current = !version || version === node.content_version;
  const v = current ? await ensureVersion(host, node) : await host.store.version(node.id, version!);
  if (!v) return null;

  // One after another, not Promise.all: a host whose client refreshes its
  // session on demand can race itself when two requests go out together.
  const canEdit = await host.resources.canEdit(node.id);
  const isAuthor = await host.resources.isAuthor(node.id);
  const versions = await host.store.versions(node.id);
  const comments = await host.comments.list(node.id);
  const folder = await host.resources.flowOf(node.id);
  const extras = host.resources.extras ? await host.resources.extras(node) : {};

  let flow: ScreenView["flow"] = null;
  let tokens: ScreenView["tokens"] = { page: null, list: [] };
  let vocabulary = vocabularyOf([
    { pageId: node.id, name: node.name, path: node.path, meta: v.screen, nodes: v.nodes, offToken: null },
  ]);

  if (folder) {
    const loaded = await loadFlow(host, folder.id);
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

  return {
    node,
    version: v.content_version,
    current,
    screen: v.screen,
    nodes: v.nodes,
    findings: v.findings,
    versions,
    comments,
    canEdit,
    viewerId: host.viewer?.id ?? null,
    isAuthor,
    flow,
    vocabulary,
    tokens,
    host: extras,
  };
}

export type EditRequest =
  | { op: "set"; version: number; pid: string; set: Record<string, string | null> }
  | { op: "wrap"; version: number; pid: string; start: number; end: number; attrs: Record<string, string> }
  | { op: "unwrap"; version: number; pid: string }
  | { op: "upgrade"; version: number };

export type EditOutcome =
  | { ok: true; version: number; id?: string; changed?: number }
  | { ok: false; error: string; status: number; version?: number };

/**
 * Writes a change into the screen's HTML as a new version.
 *
 * The version the panel was looking at has to be the current one: a change
 * made against an older copy would silently undo whatever was saved in the
 * meantime. The save goes through the host, so its locks and permissions apply.
 */
export async function editScreen(host: WaveHost, screenId: string, req: EditRequest): Promise<EditOutcome> {
  const node = await host.resources.screen(screenId);
  if (!node) return { ok: false, error: "Not found.", status: 404 };

  if (node.content_version !== req.version) {
    return {
      ok: false,
      status: 409,
      version: node.content_version,
      error: `This screen has been saved since (it is now version ${node.content_version}). The panel has reloaded it; make the change again.`,
    };
  }

  const html = await host.resources.readCurrent(node);
  if (html === null) return { ok: false, error: "Could not read the file.", status: 502 };

  let next: string;
  let createdId: string | undefined;
  let changed: number | undefined;

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
  } else if (req.op === "unwrap") {
    const r = unwrap(html, req.pid);
    if (!r.ok) return { ok: false, error: r.error, status: 400 };
    next = r.html;
  } else {
    const r = upgradePrefix(html);
    next = r.html;
    changed = r.changed;
  }

  if (next === html) return { ok: true, version: node.content_version, changed };

  const saved: HostResult<{ version: number }> = await host.resources.save(node.id, next, req.version);
  if (!saved.ok) return saved;
  return { ok: true, version: saved.version, id: createdId, changed };
}

/** Reads an edit request from untrusted JSON, or says what is wrong with it. */
export function readEditRequest(body: unknown): EditRequest | { error: string } {
  if (!body || typeof body !== "object") return { error: "Invalid JSON." };
  const b = body as Record<string, unknown>;
  const version = Number(b.version);
  if (!Number.isInteger(version)) return { error: "version is required." };
  if (b.op === "upgrade") return { op: "upgrade", version };

  const pid = typeof b.pid === "string" ? b.pid : "";
  if (!pid) return { error: "version and pid are required." };

  const strings = (v: unknown, allowNull: boolean) => {
    if (!v || typeof v !== "object") return null;
    const out: Record<string, string | null> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val.slice(0, 2000);
      else if (val === null && allowNull) out[k] = null;
      else return null;
    }
    return out;
  };

  if (b.op === "set") {
    const set = strings(b.set, true);
    return set ? { op: "set", version, pid, set } : { error: "set must map attribute names to strings or null." };
  }
  if (b.op === "wrap") {
    const attrs = strings(b.attrs, false) as Record<string, string> | null;
    const start = Number(b.start);
    const end = Number(b.end);
    if (!attrs || !Number.isInteger(start) || !Number.isInteger(end)) return { error: "wrap needs start, end and attrs." };
    return { op: "wrap", version, pid, start, end, attrs };
  }
  if (b.op === "unwrap") return { op: "unwrap", version, pid };
  return { error: "op must be set, wrap, unwrap or upgrade." };
}
