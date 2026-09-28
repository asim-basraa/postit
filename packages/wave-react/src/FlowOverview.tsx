import type { ComponentType } from "react";
import { CHECK_LABELS } from "@wave/spec/flow";
import type { FlowOverview as Overview } from "@wave/server";
import { FlowApproval, WaiveButton } from "./FlowActions";
import type { WaveLinkProps } from "./context";

/**
 * A flow at a glance: its screens and where each is in review, then everything
 * the mockups say about data and behaviour, read out of their attributes, then
 * what is still missing, and finally approval and the handover.
 */
export function FlowOverview({
  overview,
  canEdit,
  reviewHref,
  resourceHref,
  Link = PlainLink,
}: {
  overview: Overview;
  canEdit: boolean;
  /** The review screen for a screen, optionally at one node. */
  reviewHref: (screenId: string, nodeId?: string) => string;
  /** The host's own page for a member of the flow, by its path. */
  resourceHref: (path: string) => string;
  /** The host's link component; a plain anchor otherwise. Rendered on the server, so passed here rather than read from context. */
  Link?: ComponentType<WaveLinkProps>;
}) {
  const { screens, dictionary, actions, graph, checks, states, tokens } = overview;
  const outstanding = checks.filter((c) => !c.waiver);
  const waived = checks.filter((c) => c.waiver);
  const nodeHref = reviewHref;

  return (
    <div className="flow">
      <FlowApproval
        flowId={overview.flow.id}
        blockers={overview.blockers}
        approval={overview.approval ? { at: overview.approval.approved_at, by: overview.approval.approved_by_email, current: overview.approval.current } : null}
      />

      <section className="flow-section">
        <h2>Screens</h2>
        {screens.length === 0 ? (
          <p className="wv-empty">
            No HTML screens in this flow yet. Upload them here, or have Claude Design publish them into this folder.
          </p>
        ) : (
          <table className="flow-table">
            <thead>
              <tr>
                <th>Screen</th>
                <th>Route</th>
                <th>Version</th>
                <th>Review</th>
                <th>Comments</th>
                <th>Checks</th>
                <th>Findings</th>
              </tr>
            </thead>
            <tbody>
              {screens.map((s) => (
                <tr key={s.pageId}>
                  <td>
                    <Link href={nodeHref(s.pageId)}>{s.title || s.name}</Link>
                    <div className="wv-hint">
                      <code>{s.slug}</code> · <Link href={resourceHref(s.path)}>page</Link>
                    </div>
                  </td>
                  <td>{s.route ? <code>{s.route}</code> : <span className="wv-hint">none</span>}</td>
                  <td>v{s.version}</td>
                  <td>
                    {s.reviewStatus === "approved" ? (
                      <span className={s.approvedCurrent ? "flow-ok" : "flow-warn"}>{s.approvedCurrent ? "approved" : "approved, since edited"}</span>
                    ) : s.reviewStatus === "in_review" ? (
                      <span className="flow-warn">in review</span>
                    ) : (
                      <span className="wv-hint">not sent</span>
                    )}
                  </td>
                  <td>
                    {s.open ? <span className="flow-bad">{s.open} open</span> : null}
                    {s.open && s.addressed ? ", " : null}
                    {s.addressed ? <span className="flow-warn">{s.addressed} addressed</span> : null}
                    {!s.open && !s.addressed ? <span className="wv-hint">none open</span> : null}
                  </td>
                  <td>{s.checks ? <span className="flow-warn">{s.checks}</span> : <span className="flow-ok">0</span>}</td>
                  <td>{s.errors ? <span className="flow-bad">{s.findings}</span> : s.findings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="wv-hint">
          Tokens:{" "}
          {tokens ? (
            <>
              <Link href={resourceHref(tokens.path)}>{tokens.name}</Link> ({tokens.count} tokens, v{tokens.version},{" "}
              {tokens.approvedCurrent ? "approved" : "not approved at this version"})
            </>
          ) : (
            "no DTCG token page in this flow, so nothing is checked against tokens."
          )}
          {overview.unresolvedTokenRefs.length ? (
            <span className="flow-warn"> Screens name a token page that is not here: {overview.unresolvedTokenRefs.join(", ")}.</span>
          ) : null}
        </p>
      </section>

      <section className="flow-section">
        <h2>Flow</h2>
        {graph.edges.length === 0 ? (
          <p className="wv-empty">No destinations between screens yet. Set them on buttons and links with data-wave-to.</p>
        ) : (
          <>
            {/* Drawn by the host: Wave does not ship a diagram renderer. Post-it runs mermaid over pre.mermaid. */}
            <pre className="mermaid">{graph.mermaid}</pre>
            <p className="wv-hint">
              Dashed arrows are failure paths. {graph.deadEnds.length ? `Dead ends: ${graph.deadEnds.join(", ")}. ` : ""}
              {graph.unreachable.length ? `Nothing leads to: ${graph.unreachable.join(", ")}.` : ""}
            </p>
            <details>
              <summary>Mermaid source</summary>
              <pre className="wv-raw">{graph.mermaid}</pre>
            </details>
          </>
        )}
      </section>

      <section className="flow-section">
        <h2>Checks</h2>
        {outstanding.length === 0 ? (
          <p className="flow-ok">Nothing is missing. Every control does something, every dynamic value says where it comes from.</p>
        ) : (
          <ul className="flow-checks">
            {outstanding.map((c) => (
              <li key={c.key}>
                <span className="flow-check-code">{CHECK_LABELS[c.code]}</span>
                <Link href={nodeHref(c.pageId, c.pid)}>{c.screen}</Link>: {c.message}
                {canEdit ? <WaiveButton flowId={overview.flow.id} checkKey={c.key} message={c.message} /> : null}
              </li>
            ))}
          </ul>
        )}
        {waived.length ? (
          <details>
            <summary>{waived.length} accepted as they are</summary>
            <ul className="flow-checks">
              {waived.map((c) => (
                <li key={c.key}>
                  <span className="flow-check-code">{CHECK_LABELS[c.code]}</span> {c.screen}: {c.message}
                  <div className="wv-hint">
                    Accepted by {c.waiver!.by_email ?? "a former member"}: {c.waiver!.note}
                    {canEdit ? <WaiveButton flowId={overview.flow.id} checkKey={c.key} message={c.message} withdraw /> : null}
                  </div>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section className="flow-section">
        <h2>Data</h2>
        {dictionary.length === 0 ? (
          <p className="wv-empty">No resource is bound anywhere yet.</p>
        ) : (
          <table className="flow-table">
            <thead>
              <tr>
                <th>Resource</th>
                <th>Type</th>
                <th>Source</th>
                <th>Used on</th>
              </tr>
            </thead>
            <tbody>
              {dictionary.map((d) => (
                <tr key={d.path}>
                  <td>
                    <code>{d.path}</code>
                    {d.description ? <div className="wv-hint">{d.description}</div> : !d.type && !d.source ? <div className="wv-hint">undescribed</div> : null}
                  </td>
                  <td>{d.type ?? ""}</td>
                  <td>{d.source ?? ""}</td>
                  <td>
                    {d.usages.map((u, i) => (
                      <span key={`${u.pageId}-${u.pid}-${u.kind}`}>
                        {i ? ", " : ""}
                        <Link href={nodeHref(u.pageId, u.pid)}>
                          {u.screen}/{u.slug ?? u.pid}
                        </Link>{" "}
                        <span className="wv-hint">{u.kind}</span>
                      </span>
                    ))}
                    {d.usages.length === 0 ? <span className="wv-hint">described, not used</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="flow-section">
        <h2>Actions</h2>
        {actions.length === 0 ? (
          <p className="wv-empty">No named actions yet.</p>
        ) : (
          <table className="flow-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>Fired from</th>
                <th>Side effects</th>
                <th>On success</th>
                <th>On failure</th>
              </tr>
            </thead>
            <tbody>
              {actions.map((a) => (
                <tr key={a.name}>
                  <td>
                    <code>{a.name}</code>
                    <div className="wv-hint">{a.triggers.join(", ")}</div>
                  </td>
                  <td>
                    {a.sources.map((s, i) => (
                      <span key={`${s.pageId}-${s.pid}`}>
                        {i ? ", " : ""}
                        <Link href={nodeHref(s.pageId, s.pid)}>
                          {s.screen}/{s.slug ?? s.pid}
                        </Link>
                      </span>
                    ))}
                  </td>
                  <td>{a.effects.map((e) => <code key={e} className="flow-code wv-code">{e}</code>)}</td>
                  <td>{a.to.map((t) => <code key={t} className="flow-code wv-code">{t}</code>)}</td>
                  <td>{a.toFailure.map((t) => <code key={t} className="flow-code wv-code">{t}</code>)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {states.length ? (
        <section className="flow-section">
          <h2>Component states</h2>
          <table className="flow-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>States</th>
                <th>Where</th>
              </tr>
            </thead>
            <tbody>
              {states.map((c) => (
                <tr key={c.component}>
                  <td>{c.component}</td>
                  <td>{c.states.join(", ")}</td>
                  <td>
                    {c.nodes.map((n, i) => (
                      <span key={`${n.pageId}-${n.pid}`}>
                        {i ? ", " : ""}
                        <Link href={nodeHref(n.pageId, n.pid)}>
                          {n.screen}/{n.slug ?? n.pid}
                        </Link>
                        {n.depicted.length ? <span className="wv-hint"> shows {n.depicted.join(", ")}</span> : null}
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function PlainLink({ href, className, title, children }: WaveLinkProps) {
  return (
    <a href={href} className={className} title={title}>
      {children}
    </a>
  );
}
