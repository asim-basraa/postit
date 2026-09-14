import { toStaticDocument } from "@postit/renderer";

/**
 * A stored HTML file, shown as the page it is.
 *
 * The document goes into a sandboxed frame rather than into this page. Two
 * reasons, and both of them matter. Safety is the obvious one: a sandbox with
 * nothing allowed back cannot run a script, submit a form, or reach out of
 * itself, and the policy the document carries closes the network besides. The
 * other is fidelity. An HTML file people upload brings its own stylesheet, and
 * a frame is the only place it can have one without either fighting the app's
 * CSS or quietly restyling the app around it.
 *
 * The consequence is worth being plain about, which is what the note says: this
 * shows static documents. A page built to fetch its data will render its empty
 * shell, and that is the deal rather than a bug.
 */
export function HtmlView({ source, name }: { source: string; name: string }) {
  return (
    <div className="html-view">
      <iframe
        className="html-frame"
        title={`${name}, as a page`}
        // Empty on purpose: every capability is withheld, including scripts and
        // same-origin access. Adding a single token here would undo most of
        // what makes showing somebody else's HTML safe at all.
        sandbox=""
        srcDoc={toStaticDocument(source)}
        referrerPolicy="no-referrer"
      />
      <p className="hint html-note">
        Shown as a static page. Scripts do not run and nothing in it can call
        out for data.
      </p>
    </div>
  );
}
