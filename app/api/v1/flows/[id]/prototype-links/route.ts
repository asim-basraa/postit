import type { NextRequest } from "next/server";
import { createClient, currentUser } from "@/lib/supabase/server";
import { createPrototypeLink, listPrototypeLinks } from "@/lib/prototype-links";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** A feature's prototype links, for its editors (the table's policy decides who sees them). */
export async function GET(_request: NextRequest, { params }: Params) {
  const db = await createClient();
  const auth = { user: await currentUser() };
  if (!auth.user) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  return Response.json({ links: await listPrototypeLinks(db, id) });
}

/** Makes a link. The URL is in this answer and nowhere else, ever. */
export async function POST(request: NextRequest, { params }: Params) {
  const db = await createClient();
  const auth = { user: await currentUser() };
  if (!auth.user) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = ((await request.json()) ?? {}) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const r = await createPrototypeLink(db, id, {
    label: typeof body.label === "string" ? body.label : "",
    expiresInDays: typeof body.expires_in_days === "number" ? body.expires_in_days : null,
  });
  return r.ok ? Response.json({ link: r.link, url: r.url }, { status: 201 }) : Response.json({ error: r.error }, { status: r.status });
}
