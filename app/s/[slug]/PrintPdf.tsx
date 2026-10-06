"use client";

/**
 * Saves the page as a PDF through the browser's own print dialog. The print
 * styles in globals.css leave only the document, in light colours, so the PDF
 * keeps the page's text as text, its code highlighting and its diagrams,
 * rather than a picture of the screen.
 */
export function PrintPdf() {
  return (
    <button
      type="button"
      className="btn btn-secondary btn-small"
      onClick={() => window.print()}
      title="Opens the print dialog: choose Save as PDF"
    >
      Download PDF
    </button>
  );
}
