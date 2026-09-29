import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokePrototypeLink } from "@/lib/prototype-links";

export const dynamic = "force-dynamic";

/** Revokes a prototype link: it stops opening anything, at once. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const db = await createClient();
  const { data: auth } = await db.auth.getUser();
  if (!auth.user) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const r = await revokePrototypeLink(db, id);
  return r.ok ? new Response(null, { status: 204 }) : Response.json({ error: r.error }, { status: r.status });
}
