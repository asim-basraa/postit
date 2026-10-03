import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { removeTeamMember } from "@/lib/teams";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string; userId: string }> };

export async function DELETE(_request: NextRequest, { params }: Params) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Not found." }, { status: 404 });

  const { id, userId } = await params;
  const result = await removeTeamMember(id, userId);

  return result.ok
    ? new Response(null, { status: 204 })
    : Response.json({ error: result.error }, { status: result.status });
}
