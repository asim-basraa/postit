import { describe, expect, it } from "vitest";
import { flowHandover, flowOverview, projectPrototypeOf, prototypeOf, prototypeScreenHtml, publishFlow, recordScreenVersion, reopenFlow, screenUsage, useScreen } from "../src";
import type { WaveProjects } from "../src/host";
import { memoryHost } from "./memory-host";

const page = (slug: string, body: string) => `<!doctype html><html><head><meta name="wave:screen" content="${slug}"></head><body>${body}</body></html>`;
const ADDRESS = page("address", `<a data-wave-id="n_go0001" data-wave-to="screen:confirm">Next</a>`);
const CONFIRM_1 = page("confirm", `<h1 data-wave-id="n_h00001">Thanks</h1>`);
const CONFIRM_2 = page("confirm", `<h1 data-wave-id="n_h00001">Thank you</h1>`);
const RETURN = page("return", `<a data-wave-id="n_go0002" data-wave-to="screen:confirm">Send</a>`);

async function setup() {
  const m = memoryHost();
  m.flows.set("checkout", { name: "Checkout", is_flow: true });
  m.flows.set("returns", { name: "Returns", is_flow: true });
  m.files.set("s1", { name: "Address", html: ADDRESS, version: 1, flow: "checkout", approved: true });
  m.files.set("s2", { name: "Confirm", html: CONFIRM_1, version: 1, flow: "checkout", approved: true });
  m.files.set("s3", { name: "Return", html: RETURN, version: 1, flow: "returns" });
  for (const id of ["s1", "s2", "s3"]) await recordScreenVersion(m.host, id, 1, m.files.get(id)!.html);
  return m;
}

describe("shared screens", () => {
  it("lets a feature use a screen from another, and says who shows it", async () => {
    const { host } = await setup();
    const r = await useScreen(host, "returns", "s2");
    expect(r.ok).toBe(true);
    expect((await host.resources.members("returns")).map((m) => m.name).sort()).toEqual(["Confirm", "Return"]);
    const usage = await screenUsage(host, "s2");
    expect(usage.map((u) => [u.flow.name, u.home, u.lockedAt])).toEqual([
      ["Checkout", true, null],
      ["Returns", false, null],
    ]);
    expect((await useScreen(host, "checkout", "s2")).ok).toBe(false);
  });

  it("locks a feature on approval: it keeps the version it approved when another feature changes the screen", async () => {
    const m = await setup();
    const { host } = m;
    await useScreen(host, "returns", "s2");
    expect((await host.store.approve("checkout")).ok).toBe(true);

    // Returns changes the shared Confirm screen: it is saved where it lives, as version 2.
    const pub = await publishFlow(host, "returns", { screens: [{ name: "Confirm", html: CONFIRM_2 }] });
    if (!pub.ok) throw new Error(pub.error);
    expect(pub.screens[0]).toMatchObject({ id: "s2", version: 2, created: false });
    await recordScreenVersion(host, "s2", 2, CONFIRM_2);
    expect(pub.screens[0].usage.join("\n")).toMatch(/Checkout \(lives here\): approved and locked at version 1; it keeps that version/);
    expect(pub.screens[0].usage.join("\n")).toMatch(/Returns \(uses it\): open; it will show the new version/);
    expect([...m.files.values()].filter((f) => f.name === "Confirm")).toHaveLength(1);

    // Checkout still plays and hands over version 1; Returns plays version 2.
    const checkout = (await prototypeOf(host, "checkout"))!;
    expect(checkout.screens.find((s) => s.slug === "confirm")?.version).toBe(1);
    expect(await prototypeScreenHtml(host, checkout, "s2")).toContain("Thanks<");
    const returns = (await prototypeOf(host, "returns"))!;
    expect(returns.screens.find((s) => s.slug === "confirm")?.version).toBe(2);
    expect(await prototypeScreenHtml(host, returns, "s2")).toContain("Thank you");
    const overview = (await flowOverview(host, "checkout"))!;
    expect(overview.approval).toMatchObject({ current: true, locked: true });
    expect(overview.blockers).toEqual([]);
    const handover = await flowHandover(host, "checkout");
    expect(handover.ok && handover.approval.members.find((x) => x.screen_id === "s2")?.content_version).toBe(1);
  });

  it("refuses changes to a locked feature until it is reopened", async () => {
    const { host } = await setup();
    await host.store.approve("checkout");
    const refused = await publishFlow(host, "checkout", { screens: [{ name: "Confirm", html: CONFIRM_2 }] });
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.error).toMatch(/approved and locked/);
    expect((await reopenFlow(host, "checkout")).ok).toBe(true);
    expect((await publishFlow(host, "checkout", { screens: [{ name: "Confirm", html: CONFIRM_2 }] })).ok).toBe(true);
    await recordScreenVersion(host, "s2", 2, CONFIRM_2);
    const overview = (await flowOverview(host, "checkout"))!;
    expect(overview.approval).toMatchObject({ current: false, locked: false });
    const h = await flowHandover(host, "checkout");
    expect(!h.ok && h.error).toMatch(/reopened/);
  });

  it("plays every feature's approved screens in the master prototype", async () => {
    const m = await setup();
    const { host } = m;
    const projects: WaveProjects = {
      async projectOf() {
        return { id: "p1", name: "Shop", path: "shop" };
      },
      async project(id) {
        return id === "p1" ? { id, name: "Shop", path: "shop" } : null;
      },
      async setProject() {
        return { ok: true };
      },
      async tokens() {
        return null;
      },
      async specimens() {
        return [];
      },
      async screens() {
        return [
          { ...(await host.resources.screen("s1"))!, flow_id: "checkout", approved_version: 1 },
          { ...(await host.resources.screen("s2"))!, flow_id: "checkout", approved_version: 1 },
          { ...(await host.resources.screen("s3"))!, flow_id: "returns", approved_version: null },
        ];
      },
      async componentsFolder() {
        return null;
      },
    };
    host.projects = projects;
    const v = (await projectPrototypeOf(host, "p1"))!;
    expect(v.flow.name).toBe("Shop: all features");
    expect(v.screens.map((s) => `${s.slug}@${s.version}`)).toEqual(["address@1", "confirm@1"]);
    expect(v.start).toBe("address");
    expect(v.problems[0].message).toMatch(/1 screen has no approved version yet/);
  });
});
