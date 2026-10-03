import type { NextRequest } from "next/server";
import { currentUser } from "@/lib/supabase/server";
import { markNoteSeen } from "@/lib/notes";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * Marks a conversation read.
 *
 * Called from the browser once the thread is on screen rather than while
 * rendering it, for the same reason the shares list is: a render is not a
 * reading, and the request that builds a page might be a prefetch.
 */
export async function POST(_request: NextRequest, { params }: Params) {
  const user = await currentUser();

  if (!user) {
    return Response.json({ error: "Not found." }, { status: 404 });
  }

  const { id } = await params;
  await markNoteSeen(id);
  return new Response(null, { status: 204 });
}
