import type { NextRequest } from "next/server";
import { createClient, currentUser } from "@/lib/supabase/server";
import { flowOverview, setFlow } from "@/lib/flows";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** The flow overview: screens, dictionary, actions, graph, checks, approval. */
export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const overview = await flowOverview(await createClient(), id);
  return overview
    ? Response.json(overview)
    : Response.json({ error: "Not found." }, { status: 404 });
}

/** { is_flow: boolean } marks a folder as a flow, or stops it being one. */
export async function PATCH(request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) ?? {};
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (typeof body.is_flow !== "boolean") {
    return Response.json({ error: "is_flow must be true or false." }, { status: 400 });
  }
  const result = await setFlow(id, body.is_flow);
  return result.ok
    ? Response.json({ ok: true })
    : Response.json({ error: result.error }, { status: result.status });
}
