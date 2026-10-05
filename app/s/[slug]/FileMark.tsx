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
  feature: "FEAT",
};

export function FileMark({ type, folder = false }: { type: ContentType | null; folder?: boolean }) {
  // A folder has no format, but it takes the same slot: without it a folder's
  // name started a chip's width to the left of its sibling files' names, and
  // siblings read as if they were at different depths. A quiet folder icon,
  // not a chip, so it is not mistaken for one more format.
  if (folder || !type) {
    return (
      <span className="file-mark file-mark-folder" aria-hidden="true">
        <svg viewBox="0 0 16 16" width="12" height="12">
          <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.4 1.5h6a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }

  return (
    <span className={`file-mark file-mark-${type}`} title={`${MARK[type]} file`}>
      {MARK[type]}
    </span>
  );
}
