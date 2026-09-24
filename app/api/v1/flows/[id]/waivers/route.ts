import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { addWaiver, removeWaiver } from "@/lib/flows";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

async function read(request: NextRequest) {
  try {
    return ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** { key, message, note } accepts a completeness finding, with the reason. */
export async function POST(request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const body = await read(request);
  if (!body || typeof body.key !== "string" || typeof body.note !== "string") {
    return Response.json({ error: "key and note are required." }, { status: 400 });
  }
  const result = await addWaiver(id, body.key, String(body.message ?? ""), body.note);
  return result.ok
    ? Response.json({ ok: true }, { status: 201 })
    : Response.json({ error: result.error }, { status: result.status });
}

/** { key } withdraws a waiver. */
export async function DELETE(request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const body = await read(request);
  if (!body || typeof body.key !== "string") return Response.json({ error: "key is required." }, { status: 400 });
  const result = await removeWaiver(id, body.key);
  return result.ok ? new Response(null, { status: 204 }) : Response.json({ error: result.error }, { status: result.status });
}
