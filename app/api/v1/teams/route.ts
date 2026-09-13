import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { listTeams, createTeam } from "@/lib/teams";

export const dynamic = "force-dynamic";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/**
 * The company's teams.
 *
 * No space in the address any more, because a team is not in one. Readable by
 * anybody signed in, which is what makes the rosters worth having: you can see
 * the group before you hand it a document.
 */
export async function GET() {
  if (!(await requireUser())) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }
  return Response.json({ teams: await listTeams() });
}

/** Making one is an administrator's. The database is what enforces that. */
export async function POST(request: NextRequest) {
  if (!(await requireUser())) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const { name } = (body ?? {}) as Record<string, unknown>;
  if (typeof name !== "string") {
    return Response.json({ error: "A name is required." }, { status: 400 });
  }

  const result = await createTeam(name);
  return result.ok
    ? Response.json({ team: result.team }, { status: 201 })
    : Response.json({ error: result.error }, { status: result.status });
}
