import type { NextRequest } from "next/server";
import { createClient, currentUser } from "@/lib/supabase/server";
import { approveFlow } from "@/lib/flows";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Approves the flow, freezing every screen and token page at its current version. */
export async function POST(_request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const result = await approveFlow(await createClient(), id);
  return result.ok
    ? Response.json({ ok: true })
    : Response.json({ error: result.error }, { status: result.status });
}
