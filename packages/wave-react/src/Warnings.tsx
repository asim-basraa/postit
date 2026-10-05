import type { ComponentType } from "react";
import type { ScreenWarnings } from "@wave/server/warnings";
import type { WaveLinkProps } from "./context";

/**
 * Every screen's open warnings in one table, so nobody has to open each screen
 * to find them: what is missing, on which element (a link straight to it in
 * review), what Wave asks or found, and what it proposes. The same list
 * wave_warnings gives Claude.
 */
export function Warnings({
  list,
  reviewHref,
  Link = PlainLink,
}: {
  list: ScreenWarnings[];
  reviewHref: (screenId: string, nodeId?: string) => string;
  Link?: ComponentType<WaveLinkProps>;
}) {
  const mandatory = list.reduce((n, s) => n + s.mandatory, 0);
  const recommended = list.reduce((n, s) => n + s.recommended, 0);
  return (
    <section className="flow-section" id="warnings">
      <h2>Warnings</h2>
      <p className="wv-hint">
        {mandatory ? <span className="flow-bad">{mandatory} mandatory</span> : <span className="flow-ok">0 mandatory</span>} and {recommended} recommended open
        across {list.length} screen{list.length === 1 ? "" : "s"}. Mandatory blocks upload and approval. Answer a question in the review panel (open the element), in
        FEATURE.md or DESIGN.md, or ask Claude: &quot;show me the Wave warnings for this&quot; (wave_warnings) and answer them there.
      </p>
      {list.map((s) => (
        <details key={s.screenId} id={`warnings-${s.screenId}`} open={s.mandatory > 0}>
          <summary>
            <strong>{s.name}</strong> <code>{s.slug}</code> v{s.version}:{" "}
            {s.mandatory ? <span className="flow-bad">{s.mandatory} mandatory</span> : <span className="flow-ok">0 mandatory</span>}, {s.recommended} recommended
          </summary>
          {s.warnings.length === 0 ? (
            <p className="wv-empty">Nothing open.</p>
          ) : (
            <table className="flow-table wv-warnings">
              <thead>
                <tr>
                  <th>Level</th>
                  <th>Where</th>
                  <th>What</th>
                  <th>Explanation</th>
                  <th>Proposed</th>
                </tr>
              </thead>
              <tbody>
                {s.warnings.map((w, i) => (
                  <tr key={`${w.qid ?? w.code}-${i}`}>
                    <td>{w.level === "mandatory" ? <span className="flow-bad">mandatory</span> : <span className="flow-warn">recommended</span>}</td>
                    <td>
                      <Link href={reviewHref(s.screenId, w.pid ?? undefined)}>{w.address ?? (w.pid ? w.pid : "the screen")}</Link>
                    </td>
                    <td>
                      {w.label}
                      <div className="wv-hint">
                        <code>{w.qid ?? w.code}</code>
                        {w.owner ? ` · ${w.owner}` : w.kind === "file" ? " · the file" : ""}
                      </div>
                    </td>
                    <td>{w.message}</td>
                    <td>
                      {w.proposal ? <code>{w.proposal}</code> : null}
                      {w.choices?.length ? <div className="wv-hint">One of: {w.choices.join(", ")}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      ))}
    </section>
  );
}

function PlainLink({ href, className, children }: WaveLinkProps) {
  return (
    <a href={href} className={className}>
      {children}
    </a>
  );
}
