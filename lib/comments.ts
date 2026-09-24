import { createClient } from "@/lib/supabase/server";
import type { Comment } from "@/lib/comment-threads";

import type { CommentAnchor, CommentStatus } from "@/lib/comment-threads";

export type { Comment, CommentThread, CommentAnchor, CommentStatus } from "@/lib/comment-threads";
export { buildThreads } from "@/lib/comment-threads";

/**
 * The longest a comment may be.
 *
 * Named rather than inlined because the MCP server enforces the same bound on
 * its own insert, and two copies of a number is how the two doors end up
 * disagreeing about what fits.
 */
export const COMMENT_LIMIT = 10_000;

export type CommentResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * The conversation on a page.
 *
 * Through node_comments because profiles are private: a reader can see only
 * their own row, so joining for an author's name directly would return nothing.
 * The function applies the same condition the select policy does, so it
 * discloses nothing the table would not.
 */
export async function listComments(nodeId: string): Promise<Comment[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("node_comments", {
    p_node_id: nodeId,
  });

  // A refused call and an empty conversation used to be the same answer here,
  // which made a failure look exactly like a page nobody has commented on. It
  // is still an empty list to the reader — there is nothing useful to say to
  // them — but it no longer passes in silence.
  if (error) {
    console.error("node_comments failed for %s: %s", nodeId, error.message);
  }

  return (data as Comment[] | null) ?? [];
}

export async function addComment(
  nodeId: string,
  body: string,
  parentId: string | null = null,
  where: { anchor?: CommentAnchor | null; contentVersion?: number | null } = {},
): Promise<CommentResult> {
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Say something first.", status: 400 };
  if (trimmed.length > COMMENT_LIMIT) {
    return { ok: false, error: "That comment is too long.", status: 400 };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not found.", status: 404 };

  const { error } = await supabase.from("comments").insert({
    node_id: nodeId,
    author_id: user.id,
    parent_id: parentId,
    body: trimmed,
    // A reply is about whatever its comment is about.
    anchor: parentId ? null : (where.anchor ?? null),
    content_version: parentId ? null : (where.contentVersion ?? null),
  });

  if (!error) return { ok: true };

  if (/replied to|same page/i.test(error.message)) {
    return { ok: false, error: "You cannot reply to a reply.", status: 400 };
  }

  // Anything else, a policy refusal included, is not-found: a caller learns
  // nothing about pages they cannot read.
  return { ok: false, error: "Not found.", status: 404 };
}

/**
 * Withdraws a comment.
 *
 * The policy decides who may: its author, or an administrator of the page.
 * There is no check here, because a second copy of that rule is a second thing
 * to get wrong.
 */
export async function removeComment(id: string): Promise<CommentResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_comment", { p_comment_id: id });
  if (error) return { ok: false, error: "Not found.", status: 404 };
  return { ok: true };
}

/**
 * Moves a comment through review. Who may do which is the database's to decide;
 * its refusals are written to be read, so they are passed on as they are.
 */
export async function setCommentStatus(
  id: string,
  status: CommentStatus,
  note: string | null,
  version: number | null,
): Promise<CommentResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_comment_status", {
    p_comment_id: id,
    p_status: status,
    p_note: note,
    p_version: version,
  });
  if (!error) return { ok: true };
  if (/not found/i.test(error.message)) return { ok: false, error: "Not found.", status: 404 };
  return { ok: false, error: error.message, status: 409 };
}

/** Points an orphaned comment at something that exists. */
export async function reattachComment(
  id: string,
  anchor: CommentAnchor,
  version: number | null,
): Promise<CommentResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("reattach_comment", {
    p_comment_id: id,
    p_anchor: anchor,
    p_version: version,
  });
  if (!error) return { ok: true };
  if (/not found/i.test(error.message)) return { ok: false, error: "Not found.", status: 404 };
  return { ok: false, error: error.message, status: 409 };
}

/** Validates an anchor arriving from a client, returning null when it is not one. */
export function readAnchor(value: unknown): CommentAnchor | null {
  if (!value || typeof value !== "object") return null;
  const a = value as Record<string, unknown>;
  const str = (v: unknown, max = 500) => (typeof v === "string" && v.length <= max ? v : null);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  switch (a.kind) {
    case "node": {
      const pid = str(a.pid, 100);
      return pid ? { kind: "node", pid, slug: str(a.slug, 200), text: str(a.text, 300) ?? undefined } : null;
    }
    case "range": {
      const pid = str(a.pid, 100);
      const start = num(a.start);
      const end = num(a.end);
      const quote = str(a.quote, 1000);
      return pid && start !== null && end !== null && end > start && quote !== null
        ? { kind: "range", pid, start, end, quote, slug: str(a.slug, 200) }
        : null;
    }
    case "region": {
      const r = (a.rect ?? {}) as Record<string, unknown>;
      const rect = { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) };
      const viewport = num(a.viewport);
      if (Object.values(rect).some((v) => v === null) || viewport === null) return null;
      const covered = Array.isArray(a.covered) ? a.covered.filter((c): c is string => typeof c === "string").slice(0, 50) : [];
      return { kind: "region", rect: rect as { x: number; y: number; w: number; h: number }, viewport, covered };
    }
    case "element": {
      const selector = str(a.selector, 1000);
      const f = (a.fingerprint ?? {}) as Record<string, unknown>;
      const tag = str(f.tag, 40);
      if (!selector || !tag) return null;
      return {
        kind: "element",
        selector,
        fingerprint: { tag, classes: str(f.classes, 300) ?? "", text: str(f.text, 300) ?? "", ancestor: str(f.ancestor, 100) },
      };
    }
    default:
      return null;
  }
}
