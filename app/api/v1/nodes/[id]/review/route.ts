import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { setReviewStatus, type ReviewStatus } from "@/lib/review";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function isStatus(value: unknown): value is ReviewStatus | null {
  return value === null || value === "in_review" || value === "approved";
}

/**
 * Asking for a review, approving one, or clearing it.
 *
 * One endpoint for all three because they are one field. Which of them a
 * caller may do is decided in SQL, where the difference between an author and
 * a reviewer is written down once.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not found." }, { status: 404 });

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { status } = (body ?? {}) as Record<string, unknown>;
  if (!isStatus(status)) {
    return Response.json(
      { error: "status must be in_review, approved, or null." },
      { status: 400 },
    );
  }

  const result = await setReviewStatus(id, status);
  return result.ok
    ? Response.json({ status: result.status })
    : Response.json({ error: result.error }, { status: result.status });
}
