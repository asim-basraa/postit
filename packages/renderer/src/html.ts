import { fromHtml } from "hast-util-from-html";
import { unified } from "unified";
import rehypeStringify from "rehype-stringify";
import type { Element, Root, RootContent } from "hast";

/**
 * What a stored HTML document is allowed to do once it is on screen.
 *
 * `default-src 'none'` is the whole policy: with nothing granted back, there is
 * no script, no fetch, no XHR, no websocket, no frame and no plugin. What is
 * granted back is the set of things a static document is made of — pictures,
 * styling, fonts, media — and those may come from the document itself or over
 * https. That is the line: an HTML page here is something to look at, not
 * something that calls anywhere for data.
 *
 * This is the second of two defences, not the only one. The frame that carries
 * the document is sandboxed, which already means scripts cannot run at all, and
 * the parser below drops script elements before either gets a chance. Any one
 * of the three would do; all three are cheap.
 */
export const STATIC_HTML_CSP = [
  "default-src 'none'",
  "img-src data: blob: https:",
  "style-src 'unsafe-inline' https:",
  "font-src data: https:",
  "media-src data: https:",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

/**
 * Elements that are never carried across.
 *
 * Not because the sandbox would run them — it would not — but because a
 * document that cannot contain them cannot be misread as one that might. An
 * `iframe` is here for a second reason: a frame inside the frame would inherit
 * the sandbox but reach the network for its source, and a static document has
 * no business fetching anything.
 */
const DROPPED = new Set([
  "script",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "base",
]);

/**
 * The minimum the document needs to look like a document rather than a wall.
 *
 * Deliberately tiny, and first, so an author's own styling wins everything it
 * touches. A page that brings its own CSS should look exactly as it does when
 * opened from a disk.
 */
const BASE_STYLE = `
  html { color-scheme: light; }
  body { margin: 1rem; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; line-height: 1.6; color: #1a1a1a; background: #fff; }
  img, svg, video, canvas { max-width: 100%; height: auto; }
  table { border-collapse: collapse; }
`;

/**
 * Rewrites a stored HTML file into a document safe to hand to a sandboxed frame.
 *
 * Takes either a whole document or a loose fragment — a file people paste in is
 * as often one as the other — and always answers with a whole one, because a
 * frame's srcdoc is parsed as a document whatever it is given.
 *
 * The author's own head and body survive intact apart from the removals above:
 * their styles, their metadata, their markup. What is added is a charset, the
 * policy, and a few lines of baseline CSS ahead of theirs.
 *
 * Pure, and independent of who is reading: this makes no access decision, it
 * only decides what a document may do once somebody already allowed to read it
 * has it open.
 */
export function toStaticDocument(source: string): string {
  const parsed = fromHtml(source);

  const html = parsed.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === "html",
  );

  const head = section(html, "head");
  const body = section(html, "body");

  const document: Root = {
    type: "root",
    children: [
      { type: "doctype" },
      {
        type: "element",
        tagName: "html",
        // Kept so a document that declares its language keeps saying so.
        properties: { lang: html?.properties?.lang ?? "en" },
        children: [
          {
            type: "element",
            tagName: "head",
            properties: {},
            children: [
              {
                type: "element",
                tagName: "meta",
                properties: { charSet: "utf-8" },
                children: [],
              },
              {
                type: "element",
                tagName: "meta",
                properties: {
                  httpEquiv: ["content-security-policy"],
                  content: STATIC_HTML_CSP,
                },
                children: [],
              },
              {
                type: "element",
                tagName: "style",
                properties: {},
                children: [{ type: "text", value: BASE_STYLE }],
              },
              ...clean(head),
            ],
          },
          {
            type: "element",
            tagName: "body",
            properties: {},
            children: clean(body),
          },
        ],
      },
    ],
  } as Root;

  return unified().use(rehypeStringify).stringify(document);
}

/** The children of `html > name`, or nothing when the document has no such part. */
function section(html: Element | undefined, name: "head" | "body"): RootContent[] {
  const found = html?.children.find(
    (child): child is Element =>
      child.type === "element" && child.tagName === name,
  );
  return (found?.children ?? []) as RootContent[];
}

/**
 * Removes what never travels: the dropped elements, every event handler
 * attribute, and any http-equiv of the author's own.
 *
 * The last one matters more than it looks. A second policy can only narrow the
 * first and so cannot weaken anything, but `<meta http-equiv="refresh">` is a
 * navigation, and a document that sends itself somewhere the moment it opens is
 * not static in any sense a reader would recognise.
 */
function clean(nodes: RootContent[]): RootContent[] {
  const kept: RootContent[] = [];

  for (const node of nodes) {
    if (node.type !== "element") {
      kept.push(node);
      continue;
    }

    if (DROPPED.has(node.tagName)) continue;
    if (node.tagName === "meta" && node.properties?.httpEquiv !== undefined) {
      continue;
    }

    const properties: Element["properties"] = {};
    for (const [key, value] of Object.entries(node.properties ?? {})) {
      // Inert under the sandbox, removed anyway: there is no reading of this
      // document in which an event handler is content.
      if (key.toLowerCase().startsWith("on")) continue;
      properties[key] = value;
    }

    kept.push({
      ...node,
      properties,
      children: clean(node.children as RootContent[]) as Element["children"],
    });
  }

  return kept;
}
