import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  removeComment,
  setCommentStatus,
  reattachComment,
  readAnchor,
  type CommentStatus,
} from "@/lib/comments";

const STATUSES: CommentStatus[] = ["open", "addressed", "resolved", "wont_fix"];

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not found." }, { status: 404 });

  const { id } = await params;
  const result = await removeComment(id);

  return result.ok
    ? new Response(null, { status: 204 })
    : Response.json({ error: result.error }, { status: result.status });
}

/**
 * Changes where a comment has got to, or where it points.
 *
 *   { status, note?, version? }   through set_comment_status
 *   { anchor, version? }          through reattach_comment
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not found." }, { status: 404 });

  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const version = typeof body.version === "number" ? body.version : null;

  if ("status" in body) {
    if (!STATUSES.includes(body.status as CommentStatus)) {
      return Response.json({ error: `status must be one of ${STATUSES.join(", ")}.` }, { status: 400 });
    }
    const note = typeof body.note === "string" ? body.note : null;
    const result = await setCommentStatus(id, body.status as CommentStatus, note, version);
    return result.ok
      ? Response.json({ ok: true })
      : Response.json({ error: result.error }, { status: result.status });
  }

  if ("anchor" in body) {
    const anchor = readAnchor(body.anchor);
    if (!anchor) return Response.json({ error: "That is not an anchor." }, { status: 400 });
    const result = await reattachComment(id, anchor, version);
    return result.ok
      ? Response.json({ ok: true })
      : Response.json({ error: result.error }, { status: result.status });
  }

  return Response.json({ error: "Nothing to change." }, { status: 400 });
}
