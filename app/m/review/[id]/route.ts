import type { NextRequest } from "next/server";
import { createClient, currentUser } from "@/lib/supabase/server";
import { getMockupNode } from "@/lib/mockup-view";
import { versionHtml } from "@/lib/mockups";

export const dynamic = "force-dynamic";

/**
 * A mockup as the review screen frames it: the same document, any version of
 * it, with the inspector added.
 *
 * Unlike /m/<token> this answers only to a signed-in reader of the page, and
 * that is what earns the inspector: the public link a client is sent stays
 * exactly the file, with nothing of ours in it. The isolation is the same,
 * though, and for the same reason. The document is somebody's markup running
 * scripts, so it goes into an opaque origin with no allow-same-origin, and the
 * inspector talks to Post-it only by postMessage.
 */
const POLICY = ["sandbox allow-scripts allow-popups", "frame-ancestors 'self'"].join("; ");

function inject(html: string, script: string): string {
  const at = html.search(/<\/body\s*>/i);
  if (at >= 0) return html.slice(0, at) + script + html.slice(at);
  return html + script;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const notFound = () => new Response("Not found.", { status: 404 });
  if (!(await currentUser())) return notFound();

  const { id } = await params;
  const node = await getMockupNode(id);
  if (!node) return notFound();

  const v = Number(request.nextUrl.searchParams.get("v"));
  const version = Number.isInteger(v) && v > 0 ? v : node.content_version;

  const html = await versionHtml(await createClient(), node, version);
  if (html === null) return notFound();

  const build = process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 8) ?? "dev";
  const body = inject(html, `\n<script src="/inspector.js?b=${build}" data-pi-inspector></script>\n`);

  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": POLICY,
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "cache-control": "private, no-store",
    },
  });
}
