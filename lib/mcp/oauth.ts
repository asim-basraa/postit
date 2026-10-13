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

/**
 * Where an app may be sent back to, for Post-it to approve it.
 *
 * Supabase lets any app register itself (dynamic client registration), which
 * is what lets Claude connect with no setup; it is also what would let anybody
 * register an app called "Claude" and send a user a link to approve it. So the
 * consent page approves only apps that return to Claude's own addresses:
 *
 * - Claude on the web and desktop: https://claude.ai or https://claude.com,
 *   at /api/mcp/auth_callback.
 * - Claude Code and other local clients: http://localhost or http://127.0.0.1
 *   on any port. A code sent there reaches only the machine of the person who
 *   approved, which an attacker elsewhere cannot read.
 *
 * MCP_OAUTH_ALLOWED_REDIRECTS (comma separated) replaces the web list, for
 * adding another client later without a code change. Local addresses stay
 * allowed either way.
 */
const DEFAULT_ALLOWED = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

function allowedPrefixes(): string[] {
  const configured = process.env.MCP_OAUTH_ALLOWED_REDIRECTS;
  const list = configured
    ? configured.split(",").map((s) => s.trim()).filter(Boolean)
    : DEFAULT_ALLOWED;
  return list;
}

export function isAllowedRedirect(uri: string): boolean {
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.username || url.password) return false;

  if (url.protocol === "http:" && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) {
    return true;
  }
  if (url.protocol !== "https:") return false;

  const bare = `${url.origin}${url.pathname}`.replace(/\/$/, "");
  return allowedPrefixes().some((allowed) => bare === allowed.replace(/\/$/, ""));
}
