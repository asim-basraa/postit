import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeNext } from "@/lib/safe-next";
import {
  looksLikeJwt,
  protectedResourceMetadata,
  requestOrigin,
  resourceMetadataUrl,
  unverifiedClaims,
} from "@/lib/mcp/oauth";

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (claims: object) => `${b64({ alg: "ES256" })}.${b64(claims)}.sig`;

describe("where sign-in may send you next", () => {
  it("keeps a path on this site", () => {
    expect(safeNext("/oauth/consent?authorization_id=abc")).toBe("/oauth/consent?authorization_id=abc");
  });
  it.each(["https://evil.example", "//evil.example", "/\\evil.example", "/\t/evil", "", undefined, 42])(
    "refuses %s",
    (value) => {
      expect(safeNext(value)).toBe("/spaces");
    },
  );
});

describe("MCP over OAuth", () => {
  const saved = process.env.NEXT_PUBLIC_SUPABASE_URL;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  });
  afterEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = saved;
  });

  it("names Supabase Auth as the server to sign in with", () => {
    expect(protectedResourceMetadata("https://post.example")).toEqual({
      resource: "https://post.example/api/mcp",
      authorization_servers: ["https://project.supabase.co/auth/v1"],
      bearer_methods_supported: ["header"],
      resource_name: "Post-it",
      resource_documentation: "https://post.example/docs",
    });
    expect(resourceMetadataUrl("https://post.example")).toBe(
      "https://post.example/.well-known/oauth-protected-resource/api/mcp",
    );
  });

  it("takes the origin the client reached, behind a proxy", () => {
    const req = new Request("http://10.0.0.1:8080/api/mcp", {
      headers: { "x-forwarded-host": "post.example", "x-forwarded-proto": "https" },
    });
    expect(requestOrigin(req)).toBe("https://post.example");
  });

  it("tells a Supabase token from a Post-it one", () => {
    expect(looksLikeJwt(jwt({ sub: "u" }))).toBe(true);
    expect(looksLikeJwt("post_abcdef")).toBe(false);
    expect(looksLikeJwt("not a token")).toBe(false);
  });

  it("reads claims, and nothing from garbage", () => {
    expect(unverifiedClaims(jwt({ sub: "u", client_id: "c" }))).toEqual({ sub: "u", client_id: "c" });
    expect(unverifiedClaims("a.%%%.c")).toBeNull();
  });
});

describe("the MCP endpoint, refused", () => {
  it("points the client at the resource metadata", async () => {
    vi.resetModules();
    const { handleMcp } = await import("@/lib/mcp/handler");
    const req = new Request("https://post.example/api/mcp", { method: "POST", body: "{}" });
    const res = await handleMcp(req as never, null);
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://post.example/.well-known/oauth-protected-resource/api/mcp"',
    );
  });
});

describe("an OAuth access token", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.doUnmock("@supabase/supabase-js");
    vi.resetModules();
  });

  async function resolveWith(user: { id: string } | null, claims: object) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    vi.resetModules();
    vi.doMock("@supabase/supabase-js", () => ({
      createClient: () => ({
        auth: { getUser: async () => (user ? { data: { user }, error: null } : { data: { user: null }, error: new Error("bad") }) },
      }),
    }));
    const { resolveSession } = await import("@/lib/mcp/session");
    return resolveSession(jwt(claims));
  }

  it("becomes a session for its user, never pinned to a space", async () => {
    const s = await resolveWith({ id: "u1" }, { sub: "u1", client_id: "claude" });
    expect(s).toMatchObject({ userId: "u1", spaceId: null, tokenId: "oauth:claude:u1" });
  });

  it("is refused when Supabase does not vouch for it", async () => {
    expect(await resolveWith(null, { sub: "u1", client_id: "claude" })).toBeNull();
  });

  it("is refused when it was not issued to an OAuth client", async () => {
    expect(await resolveWith({ id: "u1" }, { sub: "u1" })).toBeNull();
  });

  it("is refused when its subject is someone else", async () => {
    expect(await resolveWith({ id: "u1" }, { sub: "u2", client_id: "claude" })).toBeNull();
  });
});
