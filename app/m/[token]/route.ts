import type { NextRequest } from "next/server";
import { artifactForToken, readArtifact } from "@/lib/artifacts";

export const dynamic = "force-dynamic";

/**
 * An HTML artifact, at the address you can send somebody.
 *
 * The only route in this product that answers without asking who is calling.
 * The token is the permission: a mockup exists to be shown to a client who has
 * no account here, and a link they cannot open is not a link.
 *
 * What makes that safe is the policy below rather than any check above it.
 * `sandbox` puts the document in an opaque origin, so whatever it contains has
 * no more authority over post.maqsoodlabs.com than a page on any other site
 * would: no cookies, no storage, no reading anything of ours. Scripts run,
 * because a mockup that cannot move is not a mockup, and the isolation is what
 * makes that an acceptable thing to allow rather than a reckless one.
 *
 * Without `allow-same-origin`, deliberately. It is the one token that would
 * undo all of this, and the reason the bucket is private and nothing is served
 * from the database's own domain.
 */
const POLICY = [
  "sandbox allow-scripts allow-popups",
  // Nothing to fall back on if a mockup embeds something: it may draw itself
  // and reach the network for its own assets, and that is all.
  "frame-ancestors 'self'",
].join("; ");

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const artifact = await artifactForToken(token);
  // Not found rather than forbidden, as everywhere: an address that answers
  // differently for a token that once worked is an address that leaks.
  if (!artifact) return new Response("Not found.", { status: 404 });

  const html = await readArtifact(artifact.key);
  if (html === null) return new Response("Not found.", { status: 404 });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": POLICY,
      // Says what it is and nothing else, so a browser cannot be talked into
      // treating it as something with more privilege.
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      // Rotating the token is how sharing stops, and a cached copy would make
      // that a lie for as long as the cache lasted.
      "cache-control": "private, no-store",
    },
  });
}
