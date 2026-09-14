import type { ContentType } from "@/lib/content-types";

/**
 * The most a file may hold.
 *
 * A ceiling on uploads rather than on writing: somebody typing into the editor
 * is not going to reach a megabyte by accident, and a file picker is exactly
 * where a 40MB export gets chosen by mistake. Content lives in a column and is
 * versioned on every save, so the cost of a large one is paid repeatedly.
 */
export const MAX_UPLOAD_BYTES = 1_000_000;

/**
 * What a file's extension says it is.
 *
 * The extension decides the type, and nothing else does. Sniffing the contents
 * would be cleverer and worse: a file called `report.html` that begins with a
 * blank line is still HTML, and a person who named it is telling you something
 * you should not argue with. If they were wrong, the type is one select away in
 * the editor.
 */
const BY_EXTENSION: Record<string, ContentType> = {
  md: "article",
  markdown: "article",
  html: "html",
  htm: "html",
  json: "json",
};

/** What the picker offers, and the sentence said to anybody who gets past it. */
export const UPLOAD_ACCEPT = ".md,.markdown,.html,.htm,.json";
export const UPLOAD_KINDS = "Markdown, HTML and JSON files";

export type Upload =
  | { ok: true; name: string; contentType: ContentType }
  | { ok: false; error: string };

/**
 * Reads a chosen file's name and size into a page to create, or the reason not.
 *
 * Both checks happen again on the server, which is the one that counts. This
 * copy exists so that picking a 40MB video is answered instantly and locally,
 * rather than after uploading 40MB to be told no.
 */
export function readUpload(fileName: string, bytes: number): Upload {
  const dot = fileName.lastIndexOf(".");
  const extension = dot === -1 ? "" : fileName.slice(dot + 1).toLowerCase();
  const contentType = BY_EXTENSION[extension];

  if (!contentType) {
    return {
      ok: false,
      error: `Post-it takes ${UPLOAD_KINDS}${extension ? `, and that is a .${extension} file` : ""}.`,
    };
  }

  if (bytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `That file is ${Math.round(bytes / 1000)}kB. One page can hold ${Math.round(MAX_UPLOAD_BYTES / 1000)}kB.`,
    };
  }

  // The extension is how the file got its type, so keeping it in the name would
  // say the same thing twice — and the badge in the tree already says it once.
  // A file called ".json" keeps its whole name rather than becoming nameless.
  const stem = dot > 0 ? fileName.slice(0, dot).trim() : fileName.trim();

  return { ok: true, name: stem || fileName, contentType };
}
