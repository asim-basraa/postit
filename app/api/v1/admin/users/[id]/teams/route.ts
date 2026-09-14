import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { listUserTeams } from "@/lib/admin";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * The teams one person is on, for putting them on another.
 *
 * No authorization of its own: the function behind it answers nothing to
 * anybody who does not administer the platform, so a caller who is not one
 * gets an empty list rather than a refusal.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await currentUser())) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { id } = await params;
  return Response.json({ teams: await listUserTeams(id) });
}
