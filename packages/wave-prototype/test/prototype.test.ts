import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  checkCoverage,
  fillPath,
  fillRoute,
  generateApi,
  injectPrototype,
  parseApiDocument,
  providerOf,
  readApi,
  readFrameMessage,
  renderRequirements,
  screenData,
} from "../src/index";
import { PROTOTYPE_SOURCE, PROTOTYPE_SOURCE_HASH } from "../src/source";

const SCREEN = `<!doctype html><html lang="en"><head>
<meta name="wave:spec" content="1"><meta name="wave:screen" content="orders"><meta name="wave:route" content="/account/orders">
<script type="application/wave+json" id="wave-resources">{"orders/list[]": {"type": "list<Order>", "source": "orders API", "description": "Recent orders"}}</script>
</head><body>
<h1 data-wave-id="n_head01">Hi <span data-wave-id="n_name01" data-wave-bind="user/firstName" data-wave-empty="there">Sam</span></h1>
<ul data-wave-id="n_list01" data-wave-repeat="orders/list[]" data-wave-empty-state="no-orders">
  <li data-wave-id="n_item01" data-wave-item><span data-wave-id="n_num001" data-wave-bind="orders/list[]/number">A-1</span> <b data-wave-id="n_tot001" data-wave-bind="orders/list[]/total" data-wave-format="currency:GBP">£12.50</b></li>
  <li><span>A-2</span> <b>£8.00</b></li>
</ul>
<p data-wave-id="n_none01" data-wave-slug="no-orders">No orders yet</p>
<form data-wave-id="n_form01"><input data-wave-id="n_mail01" data-wave-field="profile/email" data-wave-validate="required; email" placeholder="you@example.com">
<button data-wave-id="n_save01" data-wave-action="action/profile/save" data-wave-effect="api/profile/update analytics/saved" data-wave-to="screen:done" data-wave-to-failure="node:orders/save-error">Save</button></form>
<p data-wave-id="n_err001" data-wave-slug="save-error" data-wave-visible-if="profile/failed">Could not save</p>
</body></html>`;

describe("reading an OpenAPI document", () => {
  it("takes JSON or YAML, and refuses what is not OpenAPI 3", () => {
    expect(parseApiDocument('{"openapi":"3.1.0","paths":{}}').ok).toBe(true);
    expect(parseApiDocument("openapi: 3.0.3\npaths: {}\n").ok).toBe(true);
    const swagger = parseApiDocument('{"swagger":"2.0","paths":{}}');
    expect(swagger.ok).toBe(false);
    expect(parseApiDocument("{not json").ok).toBe(false);
  });

  it("serves examples, named examples, $refs and mock files", () => {
    const doc = parseApiDocument(`
openapi: 3.0.3
servers: [{ url: https://api.example.com/v1/ }]
components:
  examples:
    Late: { summary: Running late, value: { status: late } }
paths:
  /orders/{id}:
    parameters: [{ name: id, in: path, example: A-7 }]
    get:
      operationId: getOrder
      x-wave-provides: order
      responses:
        "200":
          content:
            application/json:
              examples:
                onTime: { value: { status: on-time } }
                late: { $ref: "#/components/examples/Late" }
        "404": { description: Not found, content: { application/json: { example: { message: gone } } } }
  /orders:
    post:
      x-wave-effect: [api/orders/create]
      responses:
        "201": { content: { application/json: { schema: { type: object, properties: { id: { type: string, example: A-9 } } } } } }
`);
    if (!doc.ok) throw new Error(doc.error);
    const { api, problems } = readApi(doc.doc, { createorder: { id: "from-mock" }, nothing: {} });
    expect(api.base).toBe("https://api.example.com/v1");
    const get = api.operations.find((o) => o.id === "getOrder")!;
    expect(get.params).toEqual([{ name: "id", example: "A-7" }]);
    expect(get.responses.map((r) => r.name)).toEqual(["200 onTime", "200 late", "404"]);
    expect(get.responses[1].body).toEqual({ status: "late" });
    expect(providerOf(api, "order")?.id).toBe("getOrder");
    const post = api.operations.find((o) => o.method === "post")!;
    expect(post.id).toBe("postOrders");
    expect(post.effects).toEqual(["api/orders/create"]);
    expect(post.responses[0].body).toEqual({ id: "A-9" });
    expect(problems.map((p) => p.message).join(" ")).toMatch(/mock file createorder matches no operationId/);
    expect(problems.map((p) => p.message).join(" ")).toMatch(/nothing/);
  });
});

describe("the draft API made from screens", () => {
  it("reads what a screen shows, collects and calls, with lists drawn as samples", () => {
    const d = screenData({ name: "Orders", html: SCREEN });
    expect(d.slug).toBe("orders");
    expect(d.samples).toMatchObject({
      user: { firstName: "Sam" },
      orders: { list: [{ number: "A-1", total: 12.5 }, { number: "A-2", total: 8 }] },
      profile: { failed: false },
    });
    expect(d.writes).toMatchObject([{ path: "profile/email", form: "n_form01" }]);
    expect(d.actions[0]).toMatchObject({ effects: ["api/profile/update", "analytics/saved"], form: "n_form01" });
  });

  it("makes one GET per data root and one POST per api effect, and covers every screen read", () => {
    const g = generateApi("Account", [{ name: "Orders", html: SCREEN }]);
    const { api, problems } = readApi(g.openapi as never);
    expect(problems).toEqual([]);
    expect(api.operations.map((o) => `${o.method} ${o.path}`).sort()).toEqual(["get /orders", "get /profile", "get /user", "post /profile/update"]);
    const post = api.operations.find((o) => o.method === "post")!;
    expect(post.effects).toEqual(["api/profile/update"]);
    expect(post.responses.map((r) => r.status)).toEqual([200, 422, 500]);
    expect(checkCoverage(api, g.screens)).toEqual([]);
    const md = renderRequirements("Account", g.screens, api, []);
    expect(md).toContain("| `orders/list[]` | list<Order> | orders API | Recent orders |");
    expect(md).toContain("`POST /profile/update`");
  });

  it("reports what the API does not serve", () => {
    const g = generateApi("Account", [{ name: "Orders", html: SCREEN }]);
    const doc = g.openapi as { paths: Record<string, unknown> };
    delete doc.paths["/user"];
    delete doc.paths["/profile/update"];
    const { api } = readApi(doc as never);
    const text = checkCoverage(api, g.screens).map((p) => p.message).join("\n");
    expect(text).toMatch(/No operation provides "user"/);
    expect(text).toMatch(/calls api\/profile\/update, which no operation handles/);
  });
});

describe("the frame", () => {
  it("adds the runtime first in the head", () => {
    expect(injectPrototype("<html><head><title>x</title></head><body></body></html>", "/p.js?b=1")).toBe(
      '<html><head><script src="/p.js?b=1" data-wave-prototype></script><title>x</title></head><body></body></html>',
    );
    expect(injectPrototype("<p>bare</p>", "/p.js")).toBe('<script src="/p.js" data-wave-prototype></script><p>bare</p>');
  });

  it("fills paths and routes", () => {
    expect(fillPath("/orders/{id}/items", { id: "A 1" }, [])).toBe("/orders/A%201/items");
    expect(fillPath("/orders/{id}", {}, [{ name: "id", example: "7" }])).toBe("/orders/7");
    expect(fillRoute("/checkout/:orderId/review", {}, { orderId: "1001" })).toBe("/checkout/1001/review");
  });

  it("checks every message from the frame", () => {
    expect(readFrameMessage({ type: "wave-proto:ready" })).toEqual({ type: "wave-proto:ready" });
    expect(readFrameMessage({ type: "wave-proto:navigate", to: { kind: "screen", screen: "done" }, state: { data: {}, params: {} } })).toMatchObject({ to: { kind: "screen", screen: "done", reveal: null } });
    expect(readFrameMessage({ type: "wave-proto:navigate", to: { kind: "url", url: "javascript:x" }, state: { data: {} } })).toBeNull();
    expect(readFrameMessage({ type: "wave-proto:state", state: { data: [] } })).toBeNull();
    expect(readFrameMessage({ type: "other" })).toBeNull();
  });

  it("ships a runtime bundle built from the current sources, with no storage or cookie access", () => {
    const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));
    const inputs = ["../src/runtime.ts", "../src/protocol.ts", "../src/openapi.ts", "../src/shims/cookieStore.ts", "../scripts/build.mjs"].map((p) => readFileSync(here(p), "utf8")).join("\n");
    const msw = JSON.parse(readFileSync(here("../../../node_modules/msw/package.json"), "utf8")).version;
    const hash = createHash("sha256").update(inputs + msw).digest("hex").slice(0, 16);
    expect(PROTOTYPE_SOURCE_HASH, "run npm run build in packages/wave-prototype").toBe(hash);
    expect(PROTOTYPE_SOURCE).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });
});
