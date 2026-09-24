import { describe, expect, it } from "vitest";
import {
  actionCatalog,
  buildHandover,
  completenessChecks,
  crc32,
  dataDictionary,
  findOffToken,
  flowGraph,
  parseDestination,
  parseMockup,
  parseTokens,
  resolveDestination,
  setAttributes,
  statesByComponent,
  unwrap,
  vocabularyOf,
  wrapText,
  zip,
  type FlowScreen,
} from "../src";
import { ADDRESS, REVIEW, TOKENS } from "./fixtures";

function flowOf(tokens = true): FlowScreen[] {
  const set = tokens ? parseTokens(TOKENS)! : null;
  return [
    ["p1", "Add address", ADDRESS],
    ["p2", "Review", REVIEW],
  ].map(([pageId, name, html]) => {
    const parsed = parseMockup(html);
    return {
      pageId,
      name,
      path: name,
      meta: parsed.screen,
      nodes: parsed.nodes,
      offToken: set ? findOffToken(parsed.css, set) : null,
      unidentifiedInteractive: parsed.unidentifiedInteractive,
    };
  });
}

describe("parseMockup", () => {
  const parsed = parseMockup(ADDRESS);

  it("reads screen meta and resources", () => {
    expect(parsed.screen).toMatchObject({
      spec: "1",
      screen: "checkout-address",
      flow: "checkout",
      route: "/checkout/address/:orderId",
      title: "Add delivery address",
      tokens: "tokens",
      documentTitle: "Add address",
    });
    expect(parsed.screen.resources["user/firstName"]).toMatchObject({ type: "string", source: "auth profile" });
  });

  it("lists nodes in document order with parent chains", () => {
    const ids = parsed.nodes.map((n) => n.id);
    expect(ids.slice(0, 4)).toEqual(["n_main01", "n_head01", "n_form01", "n_post01"]);
    const save = parsed.nodes.find((n) => n.id === "n_save01")!;
    expect(save.ancestors).toEqual(["n_main01", "n_form01"]);
    expect(save.parent).toBe("n_form01");
    expect(save.attrs).toMatchObject({
      action: "action/checkout/add-address",
      trigger: "submit",
      effect: "api/address/create",
      to: "screen:checkout-review",
      component: "Button",
    });
    expect(save.interactive).toBe(true);
    expect(parsed.nodes.find((n) => n.id === "n_post01")!.formControl).toBe(true);
    expect(parsed.nodes.find((n) => n.id === "n_post01")!.text).toBe("Postcode");
  });

  it("treats a bare flag as present", () => {
    expect(parsed.nodes.find((n) => n.id === "n_item01")!.attrs.item).toBe("");
  });

  it("reports attributes on unidentified elements and unknown attributes", () => {
    const codes = parsed.findings.map((f) => f.code);
    expect(codes).toContain("attr-without-id");
    expect(codes).not.toContain("missing-spec");
    expect(parsed.unidentifiedInteractive.map((u) => u.tag)).toEqual(["button"]);
  });

  it("reports duplicates, bad destinations, repeaters and vanished ids", () => {
    const review = parseMockup(REVIEW);
    expect(review.findings.map((f) => f.code)).toContain("duplicate-slug");

    const dup = parseMockup(`<div data-pi-id="n_aaaa1"></div><div data-pi-id="n_aaaa1" data-pi-to="elsewhere"></div><ul data-pi-id="n_r1234" data-pi-repeat="x[]"></ul>`);
    const codes = dup.findings.map((f) => f.code);
    expect(codes).toContain("duplicate-id");
    expect(codes).toContain("bad-destination");
    expect(codes).toContain("repeater-no-item");
    expect(codes).toContain("missing-spec");

    const next = parseMockup(ADDRESS.replace('data-pi-id="n_help01"', ""), parsed);
    const vanished = next.findings.filter((f) => f.code === "vanished-id");
    expect(vanished.map((f) => f.pid)).toEqual(["n_help01"]);
  });

  it("decodes entities in text", () => {
    expect(parseMockup(REVIEW).nodes.find((n) => n.id === "n_rev002")!.text).toBe("£12.00");
  });
});

describe("destinations", () => {
  it("parses every form", () => {
    expect(parseDestination("screen:a")).toEqual({ kind: "screen", screen: "a" });
    expect(parseDestination("node:a/b/c")).toMatchObject({ kind: "node", screen: "a", node: "c" });
    expect(parseDestination("node:c")).toMatchObject({ kind: "node", screen: null, node: "c" });
    expect(parseDestination("back")).toEqual({ kind: "back" });
    expect(parseDestination("https://x.test")).toEqual({ kind: "url", url: "https://x.test" });
    expect(parseDestination("somewhere").kind).toBe("invalid");
  });

  it("resolves against a flow", () => {
    const flow = flowOf();
    const r = resolveDestination(flow, flow[0], parseDestination("node:checkout-address/page/postcode-error"));
    expect(r.ok && "node" in r && r.node?.id).toBe("n_err001");
    expect(resolveDestination(flow, flow[0], parseDestination("screen:nowhere")).ok).toBe(false);
  });
});

describe("setAttributes", () => {
  it("changes only the targeted attributes", () => {
    const r = setAttributes(ADDRESS, "n_note01", { bind: "order/eta", content: "dynamic", sample: 'Say "hi" <b>' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const before = ADDRESS.split("\n");
    const after = r.html.split("\n");
    expect(after.length).toBe(before.length);
    const changed = after.filter((line, i) => line !== before[i]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('data-pi-bind="order/eta"');
    expect(changed[0]).toContain('data-pi-sample="Say &quot;hi&quot; &lt;b&gt;"');
    const node = parseMockup(r.html).nodes.find((n) => n.id === "n_note01")!;
    expect(node.attrs.sample).toBe('Say "hi" <b>');
  });

  it("removes attributes cleanly and writes flags bare", () => {
    const r = setAttributes(ADDRESS, "n_save01", { "to-failure": null, item: "" });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).not.toContain("data-pi-to-failure");
    expect(r.html).toContain('data-pi-states="default loading disabled" data-pi-item>Save');
  });

  it("refuses to change the id or unknown elements", () => {
    expect(setAttributes(ADDRESS, "n_note01", { id: "n_x" }).ok).toBe(false);
    expect(setAttributes(ADDRESS, "n_missing", { bind: "x" }).ok).toBe(false);
    expect(setAttributes(ADDRESS, "n_note01", { "bad name": "x" }).ok).toBe(false);
  });
});

describe("wrapText", () => {
  it("wraps a word in a bound span and renders the same text", () => {
    const text = "Hello Asim, add an address";
    const start = text.indexOf("Asim");
    const r = wrapText(ADDRESS, "n_head01", start, start + 4, { content: "dynamic", bind: "user/firstName" }, () => "n_word01");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.html).toContain('Hello <span data-pi-id="n_word01" data-pi-origin="postit" data-pi-content="dynamic" data-pi-bind="user/firstName">Asim</span>, add');
    const parsed = parseMockup(r.html);
    expect(parsed.nodes.find((n) => n.id === "n_head01")!.text).toBe(text);
    expect(parsed.nodes.find((n) => n.id === "n_word01")!.parent).toBe("n_head01");
    expect(parsed.findings.map((f) => f.code)).toContain("created-in-postit");

    const back = unwrap(r.html, "n_word01");
    expect(back.ok && back.html).toBe(ADDRESS);
  });

  it("maps offsets through entities", () => {
    const r = wrapText(REVIEW, "n_rev002", 1, 3, { bind: "x" }, () => "n_word02");
    expect(r.ok && r.html).toContain('&pound;<span data-pi-id="n_word02" data-pi-origin="postit" data-pi-bind="x">12</span>.00');
  });

  it("refuses a selection across markup", () => {
    const html = `<p data-pi-id="n_p1234">one <b>two</b> three</p>`;
    expect(wrapText(html, "n_p1234", 0, 7, { bind: "x" }).ok).toBe(false);
    expect(wrapText(html, "n_p1234", 4, 7, { bind: "x" }).ok).toBe(true);
  });
});

describe("tokens", () => {
  const set = parseTokens(TOKENS)!;

  it("flattens, resolves aliases and normalises", () => {
    expect(set.byPath.get("color.text")!.value).toBe("#ffffff");
    expect(set.byPath.get("color.text")!.alias).toBe("color.white");
    expect(set.byVar.get("--color-brand-500")!.path).toBe("color.brand.500");
    expect(set.byPath.get("space.4")!.value).toBe("1rem");
    expect(set.byValue.get("len:16px")!.map((t) => t.path)).toEqual(["space.4"]);
  });

  it("finds literal values no token accounts for", () => {
    const off = findOffToken(parseMockup(ADDRESS).css, set);
    expect(off).toEqual(
      expect.arrayContaining([
        { property: "color", value: "#ff00aa" },
        { property: "margin", value: "7px" },
      ]),
    );
    expect(off.find((o) => o.value === "#ffffff")).toBeUndefined();
    expect(off.find((o) => o.value === "12px")).toBeUndefined();
  });

  it("rejects non-DTCG JSON", () => {
    expect(parseTokens('{"a":1}')).toBeNull();
    expect(parseTokens("nope")).toBeNull();
  });
});

describe("flow views", () => {
  const flow = flowOf();

  it("builds the data dictionary with descriptions and usages", () => {
    const dict = dataDictionary(flow);
    const paths = dict.map((d) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["addresses[]", "addresses[]/line1", "address/postcode", "order/total", "order/editable", "user/isLoggedIn", "user/firstName"]));
    expect(dict.find((d) => d.path === "user/firstName")!.description).toBe("Given name");
    expect(dict.find((d) => d.path === "order/editable")!.usages[0].kind).toBe("condition");
  });

  it("builds the action catalog", () => {
    const actions = actionCatalog(flow);
    expect(actions.map((a) => a.name)).toEqual(["action/checkout/add-address", "action/checkout/edit"]);
    expect(actions[0]).toMatchObject({ triggers: ["submit"], effects: ["api/address/create"], to: ["screen:checkout-review"] });
  });

  it("draws the flow graph", () => {
    const g = flowGraph(flow);
    expect(g.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ from: "checkout-address", to: "checkout-review", failure: false }),
        expect.objectContaining({ from: "checkout-review", to: "checkout-address" }),
      ]),
    );
    expect(g.mermaid).toContain("flowchart LR");
    expect(g.deadEnds).toEqual([]);
    expect(g.unreachable).toEqual([]);
  });

  it("runs completeness checks", () => {
    const checks = completenessChecks(flow);
    const byCode = (code: string) => checks.filter((c) => c.code === code).map((c) => c.pid ?? c.screen);
    expect(byCode("unbound-dynamic")).toEqual(["n_note01"]);
    expect(byCode("input-no-field")).toEqual(["n_city01"]);
    expect(byCode("unresolved-destination")).toEqual(["n_help01"]);
    expect(byCode("no-action")).toEqual([]);
    expect(byCode("no-states")).toEqual(expect.arrayContaining(["n_city01", "n_help01"]));
    expect(byCode("off-token")).toEqual(["checkout-address"]);
    expect(byCode("unidentified-control")).toEqual(["checkout-address"]);
    expect(new Set(checks.map((c) => c.key)).size).toBe(checks.length);
  });

  it("collects states and vocabulary", () => {
    const states = statesByComponent(flow);
    expect(states.find((s) => s.component === "input")!.nodes[0].depicted).toEqual(["error"]);
    const vocab = vocabularyOf(flow);
    expect(vocab.effects.map((e) => e.name)).toEqual(["api/address/create"]);
  });
});

describe("handover and zip", () => {
  it("builds a bundle", () => {
    const h = buildHandover({
      flowName: "Checkout",
      flowPath: "checkout",
      approvedBy: "reviewer@example.com",
      approvedAt: "2026-09-24",
      screens: [
        { pageId: "p1", name: "Add address", version: 3, html: ADDRESS },
        { pageId: "p2", name: "Review", version: 1, html: REVIEW },
      ],
      tokens: { name: "tokens", version: 2, json: TOKENS },
      decisions: [{ status: "wont_fix", screen: "checkout-address", anchor: "save", body: "Make it red", note: "Brand says blue", author: "a@example.com" }],
      waivers: [{ key: "off-token:checkout-address", message: "off", note: "legacy colour", by: null }],
    });
    expect(h.markdown).toContain("# Handover: Checkout");
    expect(h.markdown).toContain("`action/checkout/add-address`");
    expect(h.markdown).toContain("Brand says blue");
    expect(h.files.map((f) => f.name)).toEqual(["HANDOVER.md", "handover.json", "screens/checkout-address.html", "screens/checkout-review.html", "tokens.json"]);
    expect((h.json.outstandingChecks as { code: string }[]).some((c) => c.code === "off-token")).toBe(false);
  });

  it("writes a readable zip", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const bytes = zip([{ name: "a.txt", content: "hello" }]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint32(bytes.length - 22, true)).toBe(0x06054b50);
  });
});
