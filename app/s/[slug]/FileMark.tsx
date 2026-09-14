import type { ContentType } from "@/lib/content-types";

/**
 * What kind of file this is, at the start of its name.
 *
 * A list of names stopped saying what was in them the moment a page could be
 * three different formats: "Quarterly Report" reads the same whether it is
 * prose, a document that brings its own styling, or a wall of data. The word
 * badge after the name answers it, and answers it too late — by then you have
 * already read the name and decided.
 *
 * So the format leads, in a fixed-width chip, and a column of them can be
 * scanned without reading anything. It says the format rather than the purpose:
 * a skill is Markdown and is marked MD, with the word "skill" still following
 * the name. What a file is and what it is for are two questions.
 */
const MARK: Record<ContentType, string> = {
  article: "MD",
  skill: "MD",
  html: "HTML",
  json: "JSON",
};

export function FileMark({ type }: { type: ContentType | null }) {
  // Folders have no format. They are already the thing a tree reads as a
  // heading, and a chip on one would be inventing a distinction.
  if (!type) return null;

  return (
    <span className={`file-mark file-mark-${type}`} title={`${MARK[type]} file`}>
      {MARK[type]}
    </span>
  );
}
