import { describe, expect, it } from "vitest";
import { createWaveHandlers, draftFeatureApi, flowHandover, prototypeOf, publishFlow, recordScreenVersion, saveFeatureApi } from "../src";
import { memoryHost } from "./memory-host";

const ADDRESS = `<!doctype html><html><head><meta name="wave:screen" content="address"><meta name="wave:route" content="/checkout/:orderId/address"></head>
<body><h1 data-wave-id="n_head01">Hi <span data-wave-id="n_name01" data-wave-bind="user/firstName">Sam</span></h1>
<form data-wave-id="n_form01"><input data-wave-id="n_post01" data-wave-field="address/postcode" data-wave-validate="required">
<button data-wave-id="n_save01" data-wave-action="save" data-wave-effect="api/addresses/create" data-wave-trigger="submit" data-wave-to="screen:review" data-wave-to-failure="node:address/save-error">Save</button></form>
<p data-wave-id="n_err001" data-wave-slug="save-error">Could not save</p></body></html>`;

const REVIEW = `<!doctype html><html><head><meta name="wave:screen" content="review"><meta name="wave:route" content="/checkout/:orderId/review"></head>
<body><p data-wave-id="n_tot001" data-wave-bind="order/total" data-wave-format="currency:GBP">£12.00</p>
<a data-wave-id="n_back01" data-wave-to="screen:address">Change</a></body></html>`;

function setup() {
  const m = memoryHost();
  m.flows.set("f1", { name: "Checkout", is_flow: true });
  m.files.set("s1", { name: "Address", html: ADDRESS, version: 1, flow: "f1" });
  m.files.set("s2", { name: "Review", html: REVIEW, version: 1, flow: "f1" });
  return m;
}

describe("prototypes", () => {
  it("plays the screens in order, and says there is no API yet", async () => {
    const { host } = setup();
    const v = await prototypeOf(host, "f1");
    expect(v?.screens.map((s) => s.slug)).toEqual(["address", "review"]);
    // review is reached from address, and address from review: the first wins.
    expect(v?.start).toBe("address");
    expect(v?.api).toBeNull();
    expect(v?.problems[0].message).toMatch(/no mock API yet/);
  });

  it("drafts the API from the screens, saves it, and serves it with no gaps", async () => {
    const { host, apis } = setup();
    const draft = await draftFeatureApi(host, "f1", { save: true });
    if (!draft.ok) throw new Error(draft.error);
    expect(draft.saved).toEqual(["api/openapi", "api/data-requirements"]);
    expect(apis.get("f1")?.requirements).toContain("# Data requirements: Checkout");
    const again = await draftFeatureApi(host, "f1", { save: true });
    expect(again.ok).toBe(false);
    const v = await prototypeOf(host, "f1");
    expect(v?.api?.operations.map((o) => `${o.method} ${o.path}`).sort()).toEqual(["get /orders/{orderId}", "get /user", "post /addresses/create"]);
    expect(v?.problems).toEqual([]);
  });

  it("takes YAML and mock files, refuses a broken document, and reports gaps", async () => {
    const { host, apis } = setup();
    const bad = await saveFeatureApi(host, "f1", { openapi: "swagger: '2.0'\npaths: {}" });
    expect(bad.ok).toBe(false);
    const r = await saveFeatureApi(host, "f1", {
      openapi: "openapi: 3.0.3\npaths:\n  /me:\n    get:\n      operationId: me\n      x-wave-provides: user\n      responses:\n        '200': { content: { application/json: { example: { firstName: Ada } } } }\n",
      mocks: { me: { firstName: "Grace" } },
    });
    if (!r.ok) throw new Error(r.error);
    expect(JSON.parse(apis.get("f1")!.openapi!).openapi).toBe("3.0.3");
    const text = r.problems.map((p) => p.message).join("\n");
    expect(text).toMatch(/No operation provides "order"/);
    expect(text).toMatch(/api\/addresses\/create, which no operation handles/);
    const v = await prototypeOf(host, "f1");
    expect(v?.api?.operations[0].responses[0].body).toEqual({ firstName: "Grace" });
  });

  it("publishes a whole flow with its API, and hands the API over", async () => {
    const { host, files, apis } = setup();
    const r = await publishFlow(host, "f1", {
      screens: [
        { name: "review", html: REVIEW.replace("£12.00", "£13.00") },
        { name: "Done", html: `<!doctype html><html><head><meta name="wave:screen" content="done"></head><body><p data-wave-id="n_done01">Done</p></body></html>` },
      ],
      openapi: JSON.stringify({ openapi: "3.1.0", paths: {} }),
    });
    if (!r.ok) throw new Error(r.error);
    expect(r.screens.map((s) => [s.name, s.created, s.version])).toEqual([
      ["review", false, 2],
      ["Done", true, 1],
    ]);
    expect(files.get("s2")?.html).toContain("£13.00");
    expect(apis.get("f1")?.openapi).toContain("3.1.0");

    // Handover includes the API. Record each version as a host does on save, and approve everything.
    for (const [id, f] of files) {
      await recordScreenVersion(host, id, f.version, f.html);
      f.approved = true;
    }
    await host.store.approve("f1");
    const h = await flowHandover(host, "f1");
    if (!h.ok) throw new Error(h.error);
    const names = (h.handover.files as { name: string }[]).map((f) => f.name);
    expect(names).toContain("api/openapi.json");
    expect(names).toContain("api/data-requirements.md");
  });

  it("serves the screen with the runtime, sandboxed, and the runtime itself", async () => {
    const { host } = setup();
    const handle = createWaveHandlers({ host: async () => host, basePath: "/w", build: "b1" });
    const res = await handle(new Request("http://x/w/screens/s1/prototype"), ["screens", "s1", "prototype"]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toMatch(/sandbox allow-scripts allow-popups/);
    const html = await res.text();
    expect(html.indexOf('<script src="/w/prototype.js?b=b1" data-wave-prototype>')).toBeLessThan(html.indexOf("<meta"));
    const js = await handle(new Request("http://x/w/prototype.js"), ["prototype.js"]);
    expect(js.headers.get("content-type")).toMatch(/javascript/);
    expect((await js.text()).length).toBeGreaterThan(10000);
    const view = await handle(new Request("http://x/w/flows/f1/prototype"), ["flows", "f1", "prototype"]);
    expect(((await view.json()) as { start: string }).start).toBe("address");
  });
});
