import type { NextRequest } from "next/server";
import { injectPrototype } from "@wave/prototype";
import { sharedScreenHtml, WAVE_BASE, WAVE_BUILD } from "@/lib/wave";

export const dynamic = "force-dynamic";

/**
 * One screen of a prototype opened by a link, with the prototype runtime. The
 * same sandbox as every mockup this product serves: an opaque origin, scripts
 * but nothing of ours.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const html = await sharedScreenHtml(token, id);
  if (html === null) return new Response("Not found.", { status: 404 });
  return new Response(injectPrototype(html, `${WAVE_BASE}/prototype.js?b=${encodeURIComponent(WAVE_BUILD)}`), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": "sandbox allow-scripts allow-popups; frame-ancestors 'self'",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
      "cache-control": "private, no-store",
    },
  });
}
