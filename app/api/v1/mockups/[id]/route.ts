import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { loadMockupView } from "@/lib/mockup-view";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** Everything the review screen shows about one mockup, optionally at ?v=<version>. */
export async function GET(request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const v = Number(request.nextUrl.searchParams.get("v"));
  const view = await loadMockupView(id, Number.isFinite(v) && v > 0 ? v : null);
  return view
    ? Response.json(view)
    : Response.json({ error: "Not found." }, { status: 404 });
}
