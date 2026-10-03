import type { RenderResult, SpaceContext } from "./context";

/**
 * Remembers rendered documents, so a page that has not changed is not
 * rendered again on every view.
 *
 * renderMarkdown is pure: its output depends on the Markdown and on what
 * `resolveLink` answered for each target it asked about, and on nothing else.
 * So an entry records exactly those answers, and is reused only when every one
 * of them is the same for the current viewer. Two viewers who can read
 * different pages get different entries; a link to a page this viewer cannot
 * read can never come back out of somebody else's render.
 */
type Entry = {
  answers: [target: string, href: string | null][];
  result: RenderResult;
};

export type RenderCache = {
  render(
    markdown: string,
    ctx: SpaceContext,
    renderer: (markdown: string, ctx: SpaceContext) => Promise<RenderResult>,
  ): Promise<RenderResult>;
  readonly size: number;
};

/** Per document, a handful of viewers' variants is plenty. */
const VARIANTS_PER_DOCUMENT = 4;

export function createRenderCache(maxDocuments = 500): RenderCache {
  // Insertion order is recency order: a hit is deleted and set again.
  const documents = new Map<string, Entry[]>();

  return {
    get size() {
      return documents.size;
    },

    async render(markdown, ctx, renderer) {
      const key = await digest(markdown);
      const entries = documents.get(key);

      if (entries) {
        const hit = entries.find((entry) =>
          entry.answers.every(
            ([target, href]) => (ctx.resolveLink(target)?.href ?? null) === href,
          ),
        );
        if (hit) {
          documents.delete(key);
          documents.set(key, entries);
          return copy(hit.result);
        }
      }

      const answers: Entry["answers"] = [];
      const recording: SpaceContext = {
        resolveLink(target) {
          const resolved = ctx.resolveLink(target);
          answers.push([target, resolved?.href ?? null]);
          return resolved;
        },
      };
      const result = await renderer(markdown, recording);

      const variants = [{ answers, result: copy(result) }, ...(entries ?? [])].slice(
        0,
        VARIANTS_PER_DOCUMENT,
      );
      documents.delete(key);
      documents.set(key, variants);
      while (documents.size > maxDocuments) {
        documents.delete(documents.keys().next().value!);
      }
      return result;
    },
  };
}

/** Callers may change what they are given; the cache keeps its own. */
function copy(result: RenderResult): RenderResult {
  return {
    html: result.html,
    linkTargets: [...result.linkTargets],
    headings: result.headings.map((h) => ({ ...h })),
  };
}

/** Web Crypto, so the package stays importable from the browser. */
async function digest(text: string): Promise<string> {
  const bytes = new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
