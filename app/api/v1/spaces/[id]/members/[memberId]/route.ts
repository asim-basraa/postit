import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { removeSpaceMember } from "@/lib/members";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; memberId: string }> };

/** Takes somebody or some team out of a space. The owner's, enforced in SQL. */
export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not found." }, { status: 404 });

  const { memberId } = await params;
  const result = await removeSpaceMember(memberId);

  return result.ok
    ? new Response(null, { status: 204 })
    : Response.json({ error: result.error }, { status: result.status });
}
