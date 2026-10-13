import { authorizationServer } from "@/lib/mcp/oauth";

export const dynamic = "force-dynamic";

/**
 * Supabase Auth's server metadata, repeated here for clients written against
 * the older MCP authorization spec, which looked for it on the resource's own
 * origin instead of following the resource metadata. Fetched from Supabase,
 * so it never disagrees with the server that actually issues the tokens.
 */
export async function GET() {
  const server = authorizationServer();
  if (!server) return new Response("Not configured", { status: 503 });
  const issuer = new URL(server);
  const res = await fetch(`${issuer.origin}/.well-known/oauth-authorization-server${issuer.pathname}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) return new Response("Authorization server unavailable", { status: 502 });
  return new Response(await res.text(), {
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=3600",
    },
  });
}
