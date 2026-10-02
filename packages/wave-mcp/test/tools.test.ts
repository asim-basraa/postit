import { describe, expect, it } from "vitest";
import { createWaveTools } from "../src";
import { memoryHost } from "../../wave-server/test/memory-host";

const tool = (name: string) => createWaveTools().find((t) => t.name === name)!;

describe("@wave/mcp", () => {
  it("check_screen reports what Wave reads, legacy names included", async () => {
    const { host, files } = memoryHost();
    files.set("s1", { name: "old", html: '<html><body><p data-pi-id="n_old001" data-pi-to="screen:nowhere">x</p></body></html>', version: 3, flow: null });
    const r = await tool("check_screen").run(host, { screen_id: "s1" });
    expect("text" in r && r.text).toContain("# old, version 3");
    expect("text" in r && r.text).toContain("legacy-prefix");
  });

  it("mark_addressed needs a host that lets agents set status", async () => {
    const { host } = memoryHost();
    expect(await tool("mark_addressed").run(host, { comment_id: "c1", version: 2, note: "done" })).toEqual({
      error: "This host does not let agents change a comment's status.",
    });
    host.comments.setStatus = async () => ({ ok: true });
    expect(await tool("mark_addressed").run(host, { comment_id: "c1", version: 2, note: "done" })).toEqual({ text: "Marked addressed in version 2." });
  });

  it("get_handover refuses an unapproved flow with its blockers", async () => {
    const { host, flows, files } = memoryHost();
    flows.set("f1", { name: "Checkout", is_flow: true });
    files.set("s1", { name: "a", html: "<p>a</p>", version: 1, flow: "f1" });
    const r = await tool("get_handover").run(host, { flow_id: "f1" });
    expect("error" in r && r.error).toContain("This flow has not been approved.\n- a is not approved");
  });
});

describe("fetching an asset by address", () => {
  it("refuses hosts outside the list, plain http, and redirects to an internal host", async () => {
    const { fetchAsset } = await import("../src/index");
    expect(await fetchAsset("https://169.254.169.254/latest")).toMatchObject({ ok: false });
    expect(await fetchAsset("http://fonts.gstatic.com/x.woff2")).toMatchObject({ ok: false, error: expect.stringMatching(/https/) });
    expect(await fetchAsset("https://evil.example/x.woff2")).toMatchObject({ ok: false, error: expect.stringMatching(/not a host/) });
    const real = globalThis.fetch;
    globalThis.fetch = (async () => new Response(null, { status: 302, headers: { location: "https://10.0.0.1/secret" } })) as typeof fetch;
    try {
      expect(await fetchAsset("https://fonts.gstatic.com/s/geist/x.woff2")).toMatchObject({ ok: false, error: expect.stringMatching(/not a host/) });
      globalThis.fetch = (async () => new Response(new Uint8Array([1, 2, 3]), { status: 200 })) as typeof fetch;
      const ok = await fetchAsset("https://fonts.gstatic.com/s/geist/v5/a.woff2");
      expect(ok).toMatchObject({ ok: true, name: "a.woff2" });
    } finally {
      globalThis.fetch = real;
    }
  });
});
