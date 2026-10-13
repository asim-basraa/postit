/**
 * OAuth for the MCP endpoint: Post-it is the resource, Supabase Auth is the
 * authorization server.
 *
 * An MCP client that is refused finds, from the WWW-Authenticate header, this
 * resource's metadata (RFC 9728), which names Supabase Auth as the server to
 * sign in with. Supabase registers the client, runs the authorization code
 * flow with PKCE, sends the user to Post-it's consent page, and issues the
 * tokens, which are ordinary Supabase access tokens for that user.
 */

/** The origin a request reached, as the client sees it. */
export function requestOrigin(request: Request): string {
  const url = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? url.host;
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return `${proto.split(",")[0].trim()}://${host.split(",")[0].trim()}`;
}

/** Supabase Auth, as an OAuth issuer. */
export function authorizationServer(): string | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return url ? `${url.replace(/\/$/, "")}/auth/v1` : null;
}

export const MCP_PATH = "/api/mcp";

/** Where a client reads this resource's metadata (the path-suffixed form RFC 9728 prefers). */
export function resourceMetadataUrl(origin: string): string {
  return `${origin}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

export function protectedResourceMetadata(origin: string) {
  const server = authorizationServer();
  return {
    resource: `${origin}${MCP_PATH}`,
    authorization_servers: server ? [server] : [],
    bearer_methods_supported: ["header"],
    resource_name: "Post-it",
    resource_documentation: `${origin}/docs`,
  };
}

/**
 * Whether a bearer token is a Supabase-issued JWT rather than one of
 * Post-it's own `post_` tokens. Only the shape; the signature and session are
 * checked by Supabase.
 */
export function looksLikeJwt(token: string): boolean {
  return !token.startsWith("post_") && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);
}

/** A JWT's claims, read without checking: only call after Supabase has verified it. */
export function unverifiedClaims(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    const json = Buffer.from(part, "base64url").toString("utf8");
    const claims = JSON.parse(json);
    return claims && typeof claims === "object" ? (claims as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
