import { protectedResourceMetadata, requestOrigin } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/**
 * This resource's OAuth metadata (RFC 9728), at the bare well-known address and
 * at the path-suffixed one for /api/mcp. It says which server to sign in with.
 */
export function GET(request: Request) {
  return Response.json(protectedResourceMetadata(requestOrigin(request)), {
    headers: { "access-control-allow-origin": "*", "cache-control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: { "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS" },
  });
}
