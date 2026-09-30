import { describe, expect, it } from "vitest";
import { createWaveHandlers, editScreen, flowHandover, flowOverview, loadScreenView, recordScreenVersion } from "../src";
import { memoryHost } from "./memory-host";

const SIGNIN = `<!doctype html><html><head><meta name="wave:screen" content="sign-in"><meta name="wave:title" content="Sign in"></head>
<body><main data-wave-id="n_main01" data-wave-slug="main">
<h1 data-wave-id="n_head01" data-wave-slug="heading">Welcome back</h1>
<button data-wave-id="n_btn001" data-wave-slug="submit" data-wave-action="signIn" data-wave-to="screen:home">Sign in</button>
</main></body></html>`;

const HOME = `<!doctype html><html><head><meta name="wave:screen" content="home"></head>
<body><p data-wave-id="n_hi0001" data-wave-content="dynamic" data-wave-bind="user/firstName">Hi Sam</p></body></html>`;

function setup(viewer = true) {
  const m = memoryHost({ viewer });
  m.flows.set("f1", { name: "Checkout", is_flow: true });
  m.files.set("s1", { name: "sign-in", html: SIGNIN, version: 1, flow: "f1" });
  m.files.set("s2", { name: "home", html: HOME, version: 1, flow: "f1" });
  return m;
}

describe("@wave/server on a host that is not Post-it", () => {
  it("indexes a screen and serves its view", async () => {
    const { host } = setup();
    const view = await loadScreenView(host, "s1");
    expect(view?.screen.screen).toBe("sign-in");
    expect(view?.nodes.map((n) => n.slug)).toEqual(["main", "heading", "submit"]);
    expect(view?.flow?.screens.map((s) => s.slug)).toEqual(["sign-in", "home"]);
    expect(view?.versions).toHaveLength(1);
  });

  it("builds the flow overview with the graph and data", async () => {
    const { host } = setup();
    const o = await flowOverview(host, "f1");
    expect(o?.graph.edges).toEqual([expect.objectContaining({ from: "sign-in", to: "home" })]);
    expect(o?.dictionary.map((d) => d.path)).toEqual(["user/firstName"]);
    expect(o?.blockers).toContain("sign-in is not approved at its current version.");
  });

  it("writes an edit as a new version through the host", async () => {
    const { host, files } = setup();
    await recordScreenVersion(host, "s1", 1, SIGNIN);
    const r = await editScreen(host, "s1", { op: "set", version: 1, pid: "n_head01", set: { content: "static" } });
    expect(r).toEqual({ ok: true, version: 2, id: undefined, changed: undefined });
    expect(files.get("s1")!.html).toContain('data-wave-content="static"');
    const stale = await editScreen(host, "s1", { op: "set", version: 1, pid: "n_head01", set: { content: null } });
    expect(stale).toMatchObject({ ok: false, status: 409, version: 2 });
  });

  it("upgrades a data-pi-* screen to data-wave-*", async () => {
    const { host, files } = setup();
    files.set("s3", { name: "legacy", html: '<p data-pi-id="n_old001" data-pi-slug="old">x</p>', version: 1, flow: null });
    const r = await editScreen(host, "s3", { op: "upgrade", version: 1 });
    expect(r).toMatchObject({ ok: true, version: 2, changed: 2 });
    expect(files.get("s3")!.html).toBe('<p data-wave-id="n_old001" data-wave-slug="old">x</p>');
  });

  it("hands over only an approval that still stands", async () => {
    const { host, files } = setup();
    expect(await flowHandover(host, "f1")).toMatchObject({ ok: false, error: "This flow has not been approved." });
    files.get("s1")!.approved = true;
    files.get("s2")!.approved = true;
    await flowOverview(host, "f1");
    expect(await host.store.approve("f1")).toEqual({ ok: true });
    const h = await flowHandover(host, "f1");
    expect(h.ok).toBe(true);
    if (h.ok) expect(h.handover.files.map((f) => f.name)).toContain("screens/sign-in.html");

    files.get("s2")!.version = 2;
    expect(await flowHandover(host, "f1")).toMatchObject({ ok: false });
  });

  it("answers over HTTP, and nothing to nobody", async () => {
    const handle = createWaveHandlers({ host: async () => setup().host, basePath: "/w", build: "t1" });
    const res = await handle(new Request("http://x/w/screens/s1"), ["screens", "s1"]);
    expect(res.status).toBe(200);
    const frame = await handle(new Request("http://x/w/screens/s1/frame"), ["screens", "s1", "frame"]);
    expect(frame.headers.get("content-security-policy")).toContain("sandbox allow-scripts");
    expect(await frame.text()).toContain('<script src="/w/inspector.js?b=t1" data-wave-inspector></script>');
    const js = await handle(new Request("http://x/w/inspector.js"), ["inspector.js"]);
    expect(js.headers.get("content-type")).toContain("javascript");

    const anon = createWaveHandlers({ host: async () => setup(false).host });
    expect((await anon(new Request("http://x/api/wave/flows/f1"), ["flows", "f1"])).status).toBe(404);
  });
});

describe("dry run through a host", () => {
  it("saves the question sheet in the feature and reads answers back from it", async () => {
    const { host, flows, docs } = memoryHost();
    flows.set("f1", { name: "Checkout", is_flow: true });
    const { dryRunFeature } = await import("../src");
    const first = await dryRunFeature(host, "f1", [{ name: "Sign in", html: SIGNIN }]);
    if ("error" in first) throw new Error(first.error);
    expect(first.pass).toBe(false);
    expect(first.run).toBe(1);
    const saved = docs.get("f1/wave-questions")!.content;
    expect(saved).toContain("`sign-in/screen/route`");
    docs.set("f1/wave-questions", { id: "x", version: 2, content: saved.replace(/(`sign-in\/screen\/route`[\s\S]*?Answer:)[^\n]*/, "$1 /sign-in") });
    const second = await dryRunFeature(host, "f1", [{ name: "Sign in", html: SIGNIN }]);
    if ("error" in second) throw new Error(second.error);
    expect(second.run).toBe(2);
    expect(second.sheet).toMatch(/\[x\] \*\*Route\*\* `sign-in\/screen\/route`/);
    expect(second.counts.mandatoryOpen).toBeLessThan(first.counts.mandatoryOpen);
  });

  it("only lets the uploader change a screen", async () => {
    const { host, files } = memoryHost();
    files.set("s9", { name: "x", html: SIGNIN, version: 1, flow: null });
    host.resources.isAuthor = async () => false;
    expect(await editScreen(host, "s9", { op: "set", version: 1, pid: "n_head01", set: { content: "static" } })).toMatchObject({ ok: false, status: 403 });
  });
});

describe("FEATURE.md through a host", () => {
  it("saves the brief in the feature and answers from it", async () => {
    const { host, flows, docs } = memoryHost();
    flows.set("f1", { name: "Checkout", is_flow: true });
    const { dryRunFeature, readFeatureBrief, saveFeatureBrief } = await import("../src");
    const blank = await readFeatureBrief(host, "f1");
    if ("error" in blank) throw new Error(blank.error);
    expect(blank.exists).toBe(false);
    expect(blank.content).toContain("feature: checkout");
    const before = await dryRunFeature(host, "f1", [{ name: "Sign in", html: SIGNIN }]);
    if ("error" in before) throw new Error(before.error);
    const bad = await saveFeatureBrief(host, "f1", "no front matter");
    expect(bad.ok).toBe(false);
    const saved = await saveFeatureBrief(
      host,
      "f1",
      "---\nfeature: checkout\nscreens:\n  sign-in: { route: /sign-in, access: public }\nactions:\n  signIn: { screen: sign-in, trigger: click, effect: api/session/create, to: 'screen:home', failure: none }\n---\n# Checkout\n",
    );
    expect(saved.ok).toBe(true);
    expect(docs.get("f1/feature-md")?.content).toContain("api/session/create");
    const after = await dryRunFeature(host, "f1", [{ name: "Sign in", html: SIGNIN }]);
    if ("error" in after) throw new Error(after.error);
    expect(after.counts.mandatoryOpen).toBeLessThan(before.counts.mandatoryOpen);
    expect(after.sheet).not.toContain("`sign-in/screen/route`");
    expect(after.sheet).toMatch(/Already answered: \d+ from FEATURE\.md/);
  });
});
