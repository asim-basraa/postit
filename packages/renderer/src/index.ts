import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import remarkRehype from "remark-rehype";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import rehypeKatex from "rehype-katex";
import rehypeShikiFromHighlighter from "@shikijs/rehype/core";
import { createHighlighter, type HighlighterGeneric } from "shiki";
import rehypeStringify from "rehype-stringify";

import { remarkWikilinks, extractWikilinkTargets } from "./wikilinks";
import { remarkCallouts } from "./callouts";
import { remarkStripTitle } from "./title";
import { remarkHighlights } from "./highlights";
import { rehypeMermaid } from "./mermaid";
import { rehypeCollectHeadings } from "./headings";
import { sanitizeSchema } from "./sanitize";
import { parseFrontmatter } from "./frontmatter";
import type { SpaceContext, RenderResult, Heading } from "./context";
import { createRenderCache } from "./cache";

export type { SpaceContext, RenderResult, Heading };
export { extractWikilinkTargets };
export { createRenderCache } from "./cache";
export type { RenderCache } from "./cache";
export { parseFrontmatter, readSkillMetadata } from "./frontmatter";
export type { Frontmatter, SkillMetadata } from "./frontmatter";
// The other two file formats. Neither goes through the Markdown pipeline:
// an HTML file is already a document, and a JSON file is data rather than
// prose. What they share with Markdown is everything else — the tree, the
// history, who may read them — which is decided nowhere near here.
export { toStaticDocument, STATIC_HTML_CSP } from "./html";
export { readJson, describeJson } from "./json";
export type { JsonDocument, JsonValue } from "./json";

const SHIKI_THEMES = {
  light: "github-light-default",
  dark: "github-dark-default",
} as const;

// One highlighter for the life of the process, holding only the languages
// documents have actually used. @shikijs/rehype's default builds its own
// per processor and asks for every bundled grammar each time: about 80 ms on
// every render, and about 5 s on the first one after a restart.
let highlighter: Promise<HighlighterGeneric<string, string>> | undefined;
function getHighlighter() {
  highlighter ??= createHighlighter({
    themes: Object.values(SHIKI_THEMES),
    langs: [],
  }) as Promise<HighlighterGeneric<string, string>>;
  return highlighter;
}

/**
 * Renders a Markdown document to sanitized HTML.
 *
 * The pipeline follows Quartz's shape (github.com/jackyzha0/quartz,
 * `quartz/processors/parse.ts`): parse Markdown, apply Markdown transformers,
 * cross to HTML allowing raw HTML through, sanitize, then apply HTML
 * transformers. Quartz's build system, emitters and components are not used.
 *
 * Pure: the same markdown and the same context always produce the same HTML.
 * Everything the renderer needs to know about permissions arrives through
 * `ctx.resolveLink`, so this function makes no access decisions of its own.
 */
export async function renderMarkdown(
  markdown: string,
  ctx: SpaceContext,
): Promise<RenderResult> {
  // Frontmatter is metadata about the document, not part of it. Stripping it
  // here rather than in a remark plugin keeps it out of every downstream
  // transformer's way, and means an unparseable block still does not render as
  // a stray table of text at the top of the page.
  const { body } = parseFrontmatter(markdown);

  // Filled by the collector below as the tree is walked. Local to the call, so
  // the function stays pure: two renders never see each other's headings.
  const headings: Heading[] = [];

  const shiki = await getHighlighter();

  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    // Before anything else looks at the document: the title belongs to the
    // node, so a leading level-one heading is a restatement of it.
    .use(remarkStripTitle)
    .use(remarkCallouts)
    .use(remarkHighlights)
    .use(remarkWikilinks, ctx)
    // allowDangerousHtml lets author HTML reach rehype-raw, which parses it
    // properly; rehype-sanitize immediately below is what makes that safe.
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, sanitizeSchema)
    .use(rehypeSlug)
    .use(rehypeCollectHeadings, headings)
    .use(rehypeKatex)
    // Before Shiki: a mermaid fence must reach the client as source, and the
    // highlighter would have turned it into coloured markup with no source left.
    .use(rehypeMermaid)
    // Both themes at once, as CSS variables on each token, and the stylesheet
    // picks. One render serves a reader in either mode, which matters because
    // this HTML is rendered on the server (and cached by the page): there is
    // no moment at which we know which one is looking.
    //
    // The pair is chosen by measurement rather than taste. Against the panel
    // this app puts behind a code block — white in light, #1e1c16 in dark —
    // every colour these two use clears 4.5:1, which the ones they replace did
    // not: a comment in github-dark read at 3.5:1 on that background, and the
    // orange in github-light at 3.49:1.
    .use(rehypeShikiFromHighlighter, shiki, {
      themes: SHIKI_THEMES,
      // No plain colour at all, so neither theme is the default and a reader in
      // dark mode is never briefly shown the light one.
      defaultColor: false,
      // A fence's grammar is loaded the first time a document uses it. A
      // language Shiki does not know stays plain code, as it always has.
      lazy: true,
      onError: () => {},
    })
    .use(rehypeStringify)
    .process(body);

  return {
    html: String(file),
    linkTargets: extractWikilinkTargets(body),
    headings,
  };
}

const shared = createRenderCache();

/**
 * renderMarkdown, remembered for the life of the process. A page nobody has
 * changed is rendered once, not on every view; see cache.ts for why an entry
 * can only ever be reused for a viewer whose links resolve the same way.
 */
export function renderMarkdownCached(
  markdown: string,
  ctx: SpaceContext,
): Promise<RenderResult> {
  return shared.render(markdown, ctx, renderMarkdown);
}
