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
