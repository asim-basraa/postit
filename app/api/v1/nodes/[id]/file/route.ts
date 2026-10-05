import type { NextRequest } from "next/server";
import { createClient, currentUser } from "@/lib/supabase/server";
import { pageContent } from "@/lib/nodes";
import { fileNameOf, isContentType } from "@/lib/content-types";
import type { Node } from "@/lib/spaces";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const MIME: Record<string, string> = {
  article: "text/markdown; charset=utf-8",
  skill: "text/markdown; charset=utf-8",
  html: "text/html; charset=utf-8",
  json: "application/json; charset=utf-8",
  feature: "text/plain; charset=utf-8",
};

/**
 * A page as a file, with its type's extension: a Gherkin page downloads as
 * flow.feature, a JSON page as its .json. Read under the caller's own access,
 * so a page they cannot read is simply not found.
 */
export async function GET(_request: NextRequest, { params }: Params) {
  if (!(await currentUser())) return Response.json({ error: "Not found." }, { status: 404 });
  const { id } = await params;
  const supabase = await createClient();
  const { data } = await supabase.from("nodes").select("*").eq("id", id).maybeSingle();
  const node = data as Node | null;
  if (!node || node.kind !== "file" || !isContentType(node.content_type)) return Response.json({ error: "Not found." }, { status: 404 });
  const content = await pageContent(node);
  if (content === null) return Response.json({ error: "This page's file could not be read." }, { status: 502 });
  const name = fileNameOf(node.name, node.content_type);
  return new Response(content, {
    headers: {
      "content-type": MIME[node.content_type],
      "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      "cache-control": "no-store",
    },
  });
}
