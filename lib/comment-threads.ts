export type CommentStatus = "open" | "addressed" | "resolved" | "wont_fix";

/**
 * Where on a mockup a comment points. Null for a comment about the page as a
 * whole, which is every comment on anything that is not a mockup.
 */
export type CommentAnchor =
  | { kind: "node"; pid: string; slug?: string | null; text?: string }
  | { kind: "range"; pid: string; start: number; end: number; quote: string; slug?: string | null }
  | { kind: "region"; rect: { x: number; y: number; w: number; h: number }; viewport: number; covered?: string[] }
  | { kind: "element"; selector: string; fingerprint: { tag: string; classes: string; text: string; ancestor: string | null } };

export type Comment = {
  id: string;
  parent_id: string | null;
  author_id: string;
  author_email: string;
  body: string;
  created_at: string;
  deleted: boolean;
  anchor?: CommentAnchor | null;
  content_version?: number | null;
  status?: CommentStatus | null;
  status_note?: string | null;
  status_version?: number | null;
  status_by_email?: string | null;
  status_at?: string | null;
};

export const STATUS_LABELS: Record<CommentStatus, string> = {
  open: "Open",
  addressed: "Addressed",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

/** A short description of where a comment points, for lists and handovers. */
export function describeAnchor(anchor: CommentAnchor | null | undefined): string {
  if (!anchor) return "the page";
  switch (anchor.kind) {
    case "node":
      return anchor.slug ?? anchor.pid;
    case "range":
      return `"${anchor.quote}" in ${anchor.slug ?? anchor.pid}`;
    case "region":
      return `an area (${Math.round(anchor.rect.w)}x${Math.round(anchor.rect.h)} at ${Math.round(anchor.rect.x)},${Math.round(anchor.rect.y)})`;
    case "element":
      return `<${anchor.fingerprint.tag}>${anchor.fingerprint.text ? ` "${anchor.fingerprint.text.slice(0, 30)}"` : ""}`;
  }
}

/** A comment with the replies that answer it. One level, as the schema enforces. */
export type CommentThread = Comment & { replies: Comment[] };

/**
 * Nests replies under the comments they answer, and drops the deletions that
 * left nothing behind.
 *
 * A withdrawn comment with replies has to stay as a tombstone: removing it
 * would orphan answers that only make sense underneath it. A withdrawn comment
 * with no replies is simply gone, because there is nothing left to explain.
 *
 * Kept apart from the rest of the comment code, and free of any import that
 * reaches the database, so the browser can run it: the panel is a client
 * component and would otherwise drag the server client into the bundle.
 */
export function buildThreads(comments: Comment[]): CommentThread[] {
  const replies = new Map<string, Comment[]>();

  for (const comment of comments) {
    if (!comment.parent_id) continue;
    const existing = replies.get(comment.parent_id) ?? [];
    // A deleted reply leaves nothing worth showing: nothing hangs off it.
    if (!comment.deleted) existing.push(comment);
    replies.set(comment.parent_id, existing);
  }

  return comments
    .filter((comment) => !comment.parent_id)
    .map((comment) => ({
      ...comment,
      replies: replies.get(comment.id) ?? [],
    }))
    .filter((thread) => !thread.deleted || thread.replies.length > 0);
}
