import { beforeEach, describe, expect, it } from "vitest";
import { hashToken } from "@/lib/mcp/tokens";

// wave_upload_link mints a short-lived token for the same person, pinned to
// one space and never outliving the token of the connection that made it.

process.env.NEXT_PUBLIC_SITE_URL = "https://post.example";
const { TOOLS } = await import("@/lib/mcp/tools");
const tool = TOOLS.find((t) => t.name === "wave_upload_link")!;

let inserted: Record<string, unknown>[] = [];

function client(parentExpiry: string | null, spaceExists = true) {
  return {
    from(table: string) {
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = () => q;
      q.maybeSingle = async () => ({
        data: table === "spaces" ? (spaceExists ? { id: "s1" } : null) : { expires_at: parentExpiry },
        error: null,
      });
      q.insert = async (row: Record<string, unknown>) => {
        inserted.push({ table, ...row });
        return { error: null };
      };
      return q;
    },
  };
}

const session = (parentExpiry: string | null, spaceId: string | null = "s1", spaceExists = true) =>
  ({ tokenId: "t1", userId: "u1", spaceId, supabase: client(parentExpiry, spaceExists) }) as never;

describe("wave_upload_link", () => {
  beforeEach(() => (inserted = []));

  it("mints a token for the same person, pinned to the space, expiring in an hour, and stores only its hash", async () => {
    const before = Date.now();
    const r = (await tool.run(session(null), {})) as { text: string };
    const link = /https:\/\/post\.example\/api\/mcp\/(post_[A-Za-z0-9_-]+)/.exec(r.text);
    expect(link).not.toBeNull();
    expect(inserted).toHaveLength(1);
    const row = inserted[0];
    expect(row.table).toBe("mcp_tokens");
    expect(row.user_id).toBe("u1");
    expect(row.space_id).toBe("s1");
    expect(row.token_hash).toBe(hashToken(link![1]));
    expect(JSON.stringify(row)).not.toContain(link![1]);
    const expires = Date.parse(String(row.expires_at));
    expect(expires - before).toBeGreaterThan(59 * 60_000);
    expect(expires - before).toBeLessThanOrEqual(60 * 60_000 + 1000);
  });

  it("never outlives the connection's own token", async () => {
    const soon = new Date(Date.now() + 10 * 60_000).toISOString();
    await tool.run(session(soon), { minutes: 120 });
    expect(inserted[0].expires_at).toBe(soon);
  });

  it("refuses another space than the connection is pinned to, and a space it cannot read", async () => {
    expect(await tool.run(session(null, "s1"), { space_id: "s2" })).toEqual({ error: "This token is scoped to a different space." });
    expect(await tool.run(session(null, null, false), { space_id: "s9" })).toEqual({ error: "Not found." });
    expect(inserted).toHaveLength(0);
  });
});
