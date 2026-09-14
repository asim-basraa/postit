import { describe, it, expect } from "vitest";
import { toStaticDocument, STATIC_HTML_CSP } from "../src/index";

describe("toStaticDocument", () => {
  it("keeps a whole document's head and body", () => {
    const out = toStaticDocument(
      `<!doctype html><html lang="fr"><head><title>Rapport</title><style>p{color:red}</style></head><body><p>Bonjour</p></body></html>`,
    );

    expect(out).toContain("<title>Rapport</title>");
    expect(out).toContain("p{color:red}");
    expect(out).toContain("<p>Bonjour</p>");
    expect(out).toContain('lang="fr"');
  });

  it("wraps a loose fragment into a document", () => {
    const out = toStaticDocument("<h1>Just this</h1>\n<p>and this</p>");

    expect(out.startsWith("<!doctype html>")).toBe(true);
    expect(out).toContain("<h1>Just this</h1>");
    expect(out).toContain("<p>and this</p>");
  });

  it("carries the policy that closes the network", () => {
    const out = toStaticDocument("<p>hello</p>");

    expect(out).toContain('http-equiv="content-security-policy"');
    // Serialized, so the quotes in `'none'` are entities. The HTML parser turns
    // them back before the policy is read, which is why this is the form to
    // assert on rather than the one the constant is written in.
    expect(out).toContain(STATIC_HTML_CSP.replace(/'/g, "&#x27;"));
    // The whole guarantee in one assertion: nothing is granted unless it was
    // granted back by name, and neither script nor connect ever is.
    expect(STATIC_HTML_CSP).toContain("default-src 'none'");
    expect(STATIC_HTML_CSP).not.toContain("script-src");
    expect(STATIC_HTML_CSP).not.toContain("connect-src");
  });

  it("drops scripts, frames and plugins", () => {
    const out = toStaticDocument(
      `<body><script>fetch("/api/v1/spaces")</script><iframe src="https://example.com"></iframe><object data="x.swf"></object><p>kept</p></body>`,
    );

    expect(out).not.toContain("fetch(");
    expect(out).not.toContain("<script");
    expect(out).not.toContain("<iframe");
    expect(out).not.toContain("<object");
    expect(out).toContain("<p>kept</p>");
  });

  it("drops event handlers and the author's own http-equiv", () => {
    const out = toStaticDocument(
      `<html><head><meta http-equiv="refresh" content="0;url=https://example.com"></head><body><button onclick="alert(1)">Go</button></body></html>`,
    );

    expect(out).not.toContain("onclick");
    expect(out).not.toContain("alert(1)");
    expect(out).not.toContain("refresh");
    // Ours survives, which is the one http-equiv the document is allowed.
    expect(out).toContain("content-security-policy");
    expect(out).toContain("Go");
  });

  it("leaves ordinary markup alone", () => {
    const out = toStaticDocument(
      `<table class="grid"><tr><td style="width:4rem">1</td></tr></table><img src="https://example.com/a.png" alt="A">`,
    );

    expect(out).toContain('class="grid"');
    expect(out).toContain('style="width:4rem"');
    expect(out).toContain('src="https://example.com/a.png"');
    expect(out).toContain('alt="A"');
  });

  it("answers with a whole document even for nothing at all", () => {
    const out = toStaticDocument("");
    expect(out).toContain("<html");
    expect(out).toContain("<body>");
  });
});
