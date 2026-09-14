/**
 * What a file is.
 *
 * An article and a skill are both Markdown and differ only in what they are
 * for. HTML and JSON are different formats: one is a document that arrives
 * already rendered, the other is data. The distinction lives here and in the
 * viewer, and nowhere else — the tree, sharing, history, search and every
 * permission question treat all four identically, because they are all just
 * files.
 */
export const CONTENT_TYPES = ["article", "skill", "html", "json"] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

export function isContentType(value: unknown): value is ContentType {
  return CONTENT_TYPES.includes(value as ContentType);
}

/** For the one sentence every endpoint says when it is handed something else. */
export const CONTENT_TYPE_ERROR = `content_type must be one of ${CONTENT_TYPES.join(", ")}.`;


/**
 * What a new document starts as.
 *
 * No heading: the page's title is its name, rendered from the node, so writing
 * one into the body would make a second copy that rename could not reach.
 *
 * A skill starts with its frontmatter already in place, because the metadata is
 * the part authors forget and the part a client needs. Prefilling it is cheaper
 * than flagging its absence later.
 */
export function startingContent(name: string, contentType?: ContentType): string {
  if (contentType === "skill") {
    return `---\nname: ${name}\ndescription: \n---\n\n`;
  }

  // An empty file is a fine start for prose and a puzzle for anything with a
  // shape. These are the smallest things of their kind that are already valid,
  // so the first save cannot be the one that teaches somebody the format.
  if (contentType === "html") {
    return `<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <title>${name}</title>\n  </head>\n  <body>\n  </body>\n</html>\n`;
  }
  if (contentType === "json") return "{}\n";

  return "";
}
