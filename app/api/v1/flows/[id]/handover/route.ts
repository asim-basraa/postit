import type { NextRequest } from "next/server";
import { zip, slugify } from "@postit/mockup-spec";
import { createClient, currentUser } from "@/lib/supabase/server";
import { flowHandover } from "@/lib/flows";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/**
 * The handover for an approved flow: a zip by default, or ?format=md for the
 * Markdown alone, ?format=json for the machine-readable form.
 */
export async function GET(request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const result = await flowHandover(await createClient(), id);
  if (!result.ok) {
    return Response.json({ error: result.error, blockers: result.blockers ?? [] }, { status: result.error === "Not found." ? 404 : 409 });
  }

  const format = request.nextUrl.searchParams.get("format");
  if (format === "md") {
    return new Response(result.handover.markdown, { headers: { "content-type": "text/markdown; charset=utf-8" } });
  }
  if (format === "json") return Response.json(result.handover.json);

  const name = `${slugify(result.folder.name) || "flow"}-handover.zip`;
  const bytes = zip(result.handover.files.map((f) => ({ ...f, name: `${slugify(result.folder.name) || "flow"}/${f.name}` })));
  return new Response(bytes as unknown as BodyInit, {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    },
  });
}
