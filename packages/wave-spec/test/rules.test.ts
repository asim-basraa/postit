import { describe, expect, it } from "vitest";
import {
  applyAnswers,
  assetIssues,
  assignIds,
  dryRun,
  evaluateScreen,
  extractComponent,
  matchInstances,
  parseMockup,
  parseSheet,
  parseSpecimen,
  parseTokens,
  preflightHtml,
  renderAnswerSheet,
  renderQuestionSheet,
  sniffAsset,
  styleIssues,
  validateTokenDocument,
  type Catalogue,
} from "../src";

const TOKENS = JSON.stringify({
  color: { $type: "color", brand: { "500": { $value: "#2455d6" } }, text: { $value: "#16181d" } },
  space: { $type: "dimension", "4": { $value: { value: 1, unit: "rem" } } },
  radius: { $type: "dimension", md: { $value: { value: 0.625, unit: "rem" } } },
});

const SCREEN = `<!doctype html><html lang="en"><head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="wave:spec" content="1"><meta name="wave:screen" content="signup"><title>Sign up</title>
<style>:root{--color-brand-500:#2455d6;--space-4:1rem}
.btn{background:var(--color-brand-500);padding:var(--space-4);border-radius:10px}
.help{color:#8a2be2}</style></head><body>
<form data-wave-id="n_form01" data-wave-slug="form">
  <label for="email">Email *</label>
  <input id="email" name="email" type="email" data-wave-id="n_mail01" data-wave-slug="email">
  <p data-wave-id="n_price1">£12.50</p>
  <button class="btn" data-wave-id="n_go0001" data-wave-slug="go" data-wave-component="Button" data-wave-variant="primary">Create account</button>
  <button class="btn" data-wave-id="n_del001">Delete account</button>
  <img src="logo.png" data-wave-id="n_img001">
</form></body></html>`;

describe("element types and requirements", () => {
  const parsed = parseMockup(SCREEN);
  const r = evaluateScreen(parsed, "signup");
  const q = (qid: string) => r.requirements.find((x) => x.qid === qid);

  it("gives every element a type and an address", () => {
    const byPid = new Map(r.elements.map((e) => [e.pid, e]));
    expect(byPid.get("n_mail01")?.address).toBe("signup.textInput.email");
    expect(byPid.get("n_mail01")?.parentAddress).toBe("signup.form.form");
    expect(byPid.get("n_price1")?.type).toBe("formattedValue");
    expect(byPid.get("n_img001")?.type).toBe("image");
  });

  it("infers from the markup and asks the designer to confirm", () => {
    expect(q("signup/n_mail01/validate")).toMatchObject({ status: "proposed", proposal: { value: "required; email" } });
    expect(q("signup/n_mail01/field")?.proposal?.value).toBe("form/email");
    expect(q("signup/n_price1/content")?.proposal?.value).toBe("dynamic");
    expect(q("signup/n_mail01/label")?.status).toBe("answered");
  });

  it("makes destructive buttons ask for confirmation", () => {
    expect(q("signup/n_del001/confirm")?.level).toBe("mandatory");
    expect(q("signup/n_go0001/confirm")).toBeUndefined();
  });

  it("asks screen-level questions", () => {
    expect(q("signup/screen/route")?.status).toBe("missing");
    expect(q("signup/screen/viewport-meta")?.status).toBe("answered");
  });

  it("counts a waiver as closed", () => {
    const waived = SCREEN.replace('data-wave-id="n_img001"', `data-wave-id="n_img001" data-wave-waived='{"fit":"Logo is fixed size"}'`);
    const w = evaluateScreen(parseMockup(waived), "signup").requirements.find((x) => x.qid === "signup/n_img001/fit");
    expect(w).toMatchObject({ status: "waived", waivedReason: "Logo is fixed size" });
  });
});

describe("tokens", () => {
  it("validates DTCG strictly, with rem for dimensions", () => {
    expect(validateTokenDocument(TOKENS).problems).toEqual([]);
    const bad = validateTokenDocument(JSON.stringify({ s: { $type: "dimension", a: { $value: "16px" } }, c: { $value: "#fff" }, x: { $type: "colour", y: { $value: 1 } }, z: { $type: "color", q: { $value: "{nope}" } } }));
    const text = bad.problems.map((p) => p.message).join(" | ");
    expect(text).toContain("rem, not px");
    expect(text).toContain("No $type");
    expect(text).toContain("not a DTCG type");
    expect(text).toContain("does not exist");
  });

  it("flags every style value that is not a token", () => {
    const issues = styleIssues(parseMockup(SCREEN).css, parseTokens(TOKENS));
    const keys = issues.map((i) => i.key);
    expect(keys).toContain("style:color:#8a2be2");
    expect(keys).toContain("style:border-radius:10px");
    expect(issues.find((i) => i.key === "style:border-radius:10px")?.suggestion).toBe("var(--radius-md)");
    expect(keys.some((k) => k.includes("brand"))).toBe(false);
  });

  it("offers a token of the right family, and ignores quotes in font names", () => {
    const tokens = parseTokens(JSON.stringify({
      space: { $type: "dimension", 4: { $value: { value: 1, unit: "rem" } }, 6: { $value: { value: 1.5, unit: "rem" } } },
      font: { size: { $type: "dimension", lg: { $value: { value: 1.25, unit: "rem" } } }, family: { $type: "fontFamily", body: { $value: ["system-ui", "Segoe UI", "sans-serif"] } } },
    }));
    const css = [`:root { --font-family-body: system-ui, "Segoe UI", sans-serif; } p { margin: 20px 0; font-size: 20px; }`];
    const issues = styleIssues(css, tokens);
    expect(issues.find((i) => i.key === "style:margin:20px")?.suggestion).toMatch(/--space-/);
    expect(issues.find((i) => i.key === "style:font-size:20px")?.suggestion).toBe("var(--font-size-lg)");
    expect(issues.some((i) => i.kind === "redefined")).toBe(false);
  });
});

describe("assets", () => {
  it("allows hosted and external files, not local or inline ones", () => {
    const base = "https://post.example/a/11111111-1111-1111-1111-111111111111/";
    const issues = assetIssues(
      [
        { kind: "img", url: `${base}abc.png` },
        { kind: "img", url: "https://images.unsplash.com/x.jpg" },
        { kind: "img", url: "logo.png" },
        { kind: "font", url: "data:font/woff2;base64,AAAA" },
      ],
      base,
    );
    expect(issues.map((i) => i.status)).toEqual(["local", "inline"]);
  });

  it("knows the file types it accepts", () => {
    expect(sniffAsset(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))?.ext).toBe("png");
    expect(sniffAsset(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))?.ext).toBe("svg");
    expect(sniffAsset(new TextEncoder().encode("<html>"))).toBeNull();
  });
});

describe("catalogue", () => {
  const screen = parseMockup(SCREEN);
  const specimen = extractComponent(SCREEN, screen, "n_go0001", { name: "Button", type: "button", variant: "primary", description: "The main action." });
  it("extracts a specimen from an instance, whose page layout is not token-checked", () => {
    expect(specimen.ok).toBe(true);
    const page = specimen.ok ? specimen.html : "";
    expect(page).toContain("<style data-wave-scaffold>");
    const withFailure = SCREEN.replace('data-wave-id="n_go0001"', 'data-wave-id="n_go0001" data-wave-to-failure="node:signup/error"');
    const again = extractComponent(withFailure, parseMockup(withFailure), "n_go0001", { name: "Button", type: "button", description: "x" });
    expect(again.ok && again.html).not.toMatch(/failure|signup\/error/);
    expect(parseMockup(page).css.join("\n")).not.toContain("wave-specimen-row");
  });
  const html = specimen.ok ? specimen.html.replace('"status": "proposed"', '"status": "approved"') : "";
  const def = parseSpecimen(html, parseMockup(html))!;
  const catalogue: Catalogue = { components: [{ ...def, pageId: "p", pagePath: "design-system/components/button", version: 1 }] };

  it("matches the instance it came from", () => {
    expect(def.name).toBe("Button");
    expect(matchInstances(SCREEN, screen, catalogue).get("n_go0001")?.status).toBe("match");
  });

  it("reports drift in markup or CSS, and unknown components", () => {
    const drifted = SCREEN.replace('>Create account</button>', '><span class="ico"></span>Create account</button>').replace("border-radius:10px", "border-radius:12px");
    const m = matchInstances(drifted, parseMockup(drifted), catalogue).get("n_go0001");
    expect(m?.status).toBe("drift");
    expect(m?.details.join(" ")).toMatch(/markup differs/);
    const unknown = SCREEN.replace('data-wave-component="Button"', 'data-wave-component="Fancy"');
    expect(matchInstances(unknown, parseMockup(unknown), catalogue).get("n_go0001")?.status).toBe("new-component");
  });

  it("compares a component inside another one only through the outer one", () => {
    // A segment in a segmented control: its place in the outer component is the outer one's markup.
    const inside = SCREEN.replace('<button', '<div data-wave-component="Fancy" data-wave-id="n_out001"><button').replace("</button>", "</button></div>").replace('>Create account</button>', '><span class="ico"></span>Create account</button>');
    const m = matchInstances(inside, parseMockup(inside), catalogue);
    expect(m.get("n_out001")?.status).toBe("new-component");
    expect(m.get("n_go0001")?.status).toBe("match");
  });
});

describe("dry run and answers", () => {
  const parsed = parseMockup(SCREEN);
  const reqs = evaluateScreen(parsed, "signup").requirements;
  const screens = [{ slug: "signup", label: "draft", requirements: reqs, nodes: parsed.nodes }];

  it("renders a sheet whose answers round-trip, and checks them", () => {
    const first = dryRun(screens, new Map());
    expect(first.pass).toBe(false);
    let sheet = renderQuestionSheet("Onboarding", 1, screens, first);
    expect(sheet).toContain("`signup/screen/route`");
    sheet = sheet
      .replace(/(`signup\/screen\/route`[\s\S]*?Answer:)[^\n]*/, "$1 /signup")
      .replace(/(`signup\/n_go0001\/to`[\s\S]*?Answer:)[^\n]*/, "$1 screen:nowhere")
      .replace(/(`signup\/n_img001\/fit`[\s\S]*?Answer:)[^\n]*/, "$1 waive: fixed logo");
    const answers = parseSheet(sheet);
    expect(answers.get("signup/screen/route")).toBe("/signup");
    const second = dryRun(screens, answers);
    const item = (qid: string) => second.items.find((i) => i.qid === qid)!;
    expect(item("signup/screen/route").open).toBe(false);
    expect(item("signup/n_go0001/to").answerError).toMatch(/no screen nowhere/);
    expect(item("signup/n_img001/fit").open).toBe(false);
  });

  it("takes yes under a proposal as the proposal", () => {
    const run = dryRun(screens, new Map([["signup/n_mail01/validate", "Yes"]]));
    expect(run.items.find((i) => i.qid === "signup/n_mail01/validate")).toMatchObject({ open: false, answer: "required; email" });
  });

  it("applies answers into the HTML byte-exactly", () => {
    const answers = new Map([
      ["signup/screen/route", "/signup"],
      ["signup/n_mail01/validate", "required; email"],
      ["signup/n_img001/alt", "Company logo"],
      ["signup/n_img001/fit", "waive: fixed logo"],
      ["signup/resource/form/email", "string; form; The email they sign up with"],
    ]);
    const res = applyAnswers(SCREEN, reqs.concat([{ ...reqs[0], qid: "signup/resource/form/email", field: "resource:form/email", status: "missing", write: { kind: "resource", path: "form/email" } }]), answers);
    expect(res.skipped).toEqual([]);
    expect(res.html).toContain('<meta name="wave:route" content="/signup">');
    expect(res.html).toContain('data-wave-validate="required; email"');
    expect(res.html).toContain('alt="Company logo"');
    expect(res.html).toContain("data-wave-waived=");
    expect(res.html).toContain('"form/email"');
    const again = evaluateScreen(parseMockup(res.html), "signup").requirements;
    expect(again.find((x) => x.qid === "signup/n_img001/fit")?.status).toBe("waived");
    expect(renderAnswerSheet("Onboarding", [{ slug: "signup", fingerprint: "abc" }], dryRun(screens, answers))).toContain("- `signup/screen/route`: /signup");
  });
});

describe("scripts that the prototype cannot serve", () => {
  it("warns about XMLHttpRequest and jQuery calls, not fetch", () => {
    const page = (code: string) => `<!doctype html><html><head><meta name="wave:spec" content="1"></head><body><p data-wave-id="n_p00001">x</p><script>${code}</script></body></html>`;
    const codes = (html: string) => preflightHtml(html, "s").issues.map((i) => i.code);
    expect(codes(page("const r = new XMLHttpRequest();"))).toContain("xhr");
    expect(codes(page("$.ajax({url: '/api'})"))).toContain("xhr");
    expect(codes(page("fetch('/api/orders')"))).not.toContain("xhr");
  });
});

describe("ids and preflight", () => {
  it("assigns ids to what needs one, once per repeated item", () => {
    const html = `<html><body><h1>Hi</h1><ul><li><a href="#">A</a></li><li><a href="#">B</a></li><li><a href="#">C</a></li></ul><div><span>x</span></div></body></html>`;
    const { html: out, added } = assignIds(html);
    expect(added).toBe(5);
    expect((out.match(/data-wave-id/g) ?? []).length).toBe(5);
    expect(assignIds(out).added).toBe(0);
  });

  it("identifies same-shaped siblings that write different fields, not as samples", () => {
    const field = (name: string) => `<div class="field"><label>${name}</label><input name="${name}" data-wave-field="lead/${name}"></div>`;
    const radio = (v: string) => `<label class="chip"><input type="radio" name="role" value="${v}">${v}</label>`;
    const html = `<html><body><form>${field("name")}${field("email")}</form><div role="radiogroup">${radio("A")}${radio("B")}</div></body></html>`;
    const { html: out } = assignIds(html);
    const ided = (sel: RegExp) => (out.match(sel) ?? []).length;
    expect(ided(/<input data-wave-id="[^"]+" name="(name|email)"/g)).toBe(2);
    expect(ided(/<input data-wave-id="[^"]+" type="radio"/g)).toBe(1);
    const btn = (label: string, action: string) => `<button class="btn" data-wave-action="${action}">${label}</button>`;
    const actions = assignIds(`<html><body><div>${btn("Back", "a/back")}${btn("Continue", "a/next")}</div><ul><li><a href="#" data-wave-to="screen:x">A</a></li><li><a href="#" data-wave-to="screen:x">B</a></li></ul></body></html>`).html;
    expect((actions.match(/<button data-wave-id=/g) ?? []).length).toBe(2);
    expect((actions.match(/<li data-wave-id=/g) ?? []).length).toBe(1);
    const stat = (path: string) => `<div class="stat"><p data-wave-bind="${path}">x</p></div>`;
    const stats = assignIds(`<html><body><div>${stat("lead/scope")}${stat("lead/budget")}${stat("lead/start")}</div></body></html>`).html;
    expect((stats.match(/<p data-wave-id=/g) ?? []).length).toBe(3);
  });

  it("catches what breaks a page in review", () => {
    const html = `<html><head></head><body><div id="root"></div><script>localStorage.setItem("a","b");document.getElementById("root").innerHTML="<p>x</p>".repeat(900)</script></body></html>`;
    const r = preflightHtml(html, "x");
    expect(r.pass).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(expect.arrayContaining(["no-spec", "storage", "script-built"]));
  });
});
