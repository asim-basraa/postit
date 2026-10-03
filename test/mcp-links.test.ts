import { beforeEach, describe, expect, it, vi } from "vitest";

// Pages written through the MCP tools record their wikilinks, as the browser's
// saves do, with the session's own client. Before, they never did, so every
// page an agent wrote was missing from the backlinks of the pages it linked to.

const refreshLinks = vi.fn();
vi.mock("@/lib/nodes", async (original) => ({ ...(await original<typeof import("@/lib/nodes")>()), refreshLinks }));

const { TOOLS } = await import("@/lib/mcp/tools");
const tool = (name: string) => TOOLS.find((t) => t.name === name)!;

/** A Supabase client that answers every query with the row given, and records nothing else. */
function fakeClient(row: Record<string, unknown>) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "update", "insert", "order", "in"]) chain[m] = () => chain;
  chain.maybeSingle = async () => ({ data: row, error: null });
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
  chain.rpc = async () => ({ data: 42, error: null });
  return chain;
}

function session(row: Record<string, unknown>) {
  return { supabase: fakeClient(row), spaceIds: null, userId: "u1" } as never;
}

describe("MCP page writes record their links", () => {
  beforeEach(() => refreshLinks.mockReset());

  it("update_page refreshes the links of a Markdown page with the session's client", async () => {
    const s = session({ id: "p1", name: "Doc", content_version: 3, artifact_key: null, space_id: "s1", content_type: "article" });
    const r = await tool("update_page").run(s, { id: "p1", version: 2, content: "See [[other/page|it]]." });
    expect(r).toEqual({ text: "Saved Doc, now at version 3." });
    expect(refreshLinks).toHaveBeenCalledWith(
      { id: "p1", space_id: "s1", content: "See [[other/page|it]].", content_type: "article" },
      (s as { supabase: unknown }).supabase,
    );
  });

  it("append_to_page refreshes the links of the whole page as it now is", async () => {
    const s = session({ id: "p1", artifact_key: null, space_id: "s1", content: "Start [[a]] and [[b]]", content_type: "article" });
    await tool("append_to_page").run(s, { id: "p1", content: " and [[b]]" });
    expect(refreshLinks).toHaveBeenCalledWith(
      { id: "p1", artifact_key: null, space_id: "s1", content: "Start [[a]] and [[b]]", content_type: "article" },
      (s as { supabase: unknown }).supabase,
    );
  });
});
