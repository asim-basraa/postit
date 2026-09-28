import type { ComponentType } from "react";
import type { CatalogueOverview } from "@wave/server/project";
import type { WaveLinkProps } from "./context";

/**
 * A project's design system: its screens and how complete each is, its tokens,
 * every component with where it is used (and where it has drifted), and every
 * asset. Server-renderable; the host passes its addresses and link component.
 */
export function CatalogueView({
  overview,
  reviewHref,
  resourceHref,
  Link = PlainLink,
}: {
  overview: CatalogueOverview;
  reviewHref: (screenId: string, nodeId?: string) => string;
  resourceHref: (path: string) => string;
  Link?: ComponentType<WaveLinkProps>;
}) {
  const { components, unknown, assets, screens, tokens, project } = overview;
  return (
    <div className="wv-catalogue">
      <section>
        <h2>Screens</h2>
        {screens.length === 0 ? (
          <p className="wv-empty">No screens yet. Create a feature (a flow) in this project and upload screens into it with Wave Design.</p>
        ) : (
          <table className="flow-table">
            <thead>
              <tr>
                <th>Screen</th>
                <th>Slug</th>
                <th>Mandatory missing</th>
              </tr>
            </thead>
            <tbody>
              {screens.map((s) => (
                <tr key={s.id}>
                  <td>
                    <Link href={reviewHref(s.id)}>{s.name}</Link>
                  </td>
                  <td>
                    <code>{s.slug}</code>
                  </td>
                  <td>{s.mandatoryOpen ? <span className="flow-bad">{s.mandatoryOpen}</span> : <span className="flow-ok">0</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Tokens</h2>
        {tokens.pageId ? (
          <p>
            <Link href={resourceHref(`${project.path}/design-system/tokens`)}>design-system/tokens</Link>: {tokens.count} tokens
            {Object.keys(tokens.typeCounts).length ? ` (${Object.entries(tokens.typeCounts).map(([k, v]) => `${v} ${k}`).join(", ")})` : ""}.
          </p>
        ) : (
          <p className="flow-bad">No token file yet. Add design-system/tokens as a DTCG JSON page (dimensions in rem).</p>
        )}
        {tokens.problems.length ? (
          <ul className="flow-checks">
            {tokens.problems.slice(0, 50).map((p, i) => (
              <li key={i} className="flow-bad">
                {p.path ? <code>{p.path}</code> : null} {p.message}
              </li>
            ))}
          </ul>
        ) : tokens.pageId ? (
          <p className="flow-ok">Valid DTCG.</p>
        ) : null}
      </section>

      <section>
        <h2>Components ({components.length})</h2>
        {components.length === 0 ? (
          <p className="wv-empty">
            The catalogue is empty. On a project's first run, Wave Design builds it from the designs and the designer approves it before any screen is uploaded.
          </p>
        ) : (
          <div className="wv-cat-grid">
            {components.map((c) => {
              const drift = c.usage.filter((u) => u.status === "drift").length;
              const screensUsing = new Set(c.usage.map((u) => u.screenId)).size;
              return (
                <article key={c.pageId} className="wv-cat-card">
                  <h3>
                    <Link href={reviewHref(c.pageId)}>{c.name}</Link> <span className={`wv-status is-${c.status}`}>{c.status}</span>
                  </h3>
                  {c.description ? <p className="wv-hint">{c.description}</p> : null}
                  <div className="wv-hint">
                    {c.type ?? "?"} · variants {c.variants.join(", ")}
                    {c.states.length ? ` · states ${c.states.join(", ")}` : ""}
                  </div>
                  <div>
                    Used {c.usage.length}× on {screensUsing} screen{screensUsing === 1 ? "" : "s"}
                    {drift ? <span className="flow-bad"> · {drift} differ from the catalogue</span> : null}
                  </div>
                  {c.problems.length ? <div className="flow-warn wv-hint">{c.problems.join(" ")}</div> : null}
                  {c.usage.length ? (
                    <details>
                      <summary>Where</summary>
                      <ul className="flow-checks">
                        {c.usage.map((u) => (
                          <li key={`${u.screenId}-${u.pid}`}>
                            <Link href={reviewHref(u.screenId, u.pid)}>
                              <code>{u.address}</code>
                            </Link>{" "}
                            <span className="wv-hint">{u.variant}</span>
                            {u.status !== "match" ? <span className={u.status === "drift" ? "flow-bad" : "flow-warn"}> {u.status}</span> : null}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </article>
              );
            })}
          </div>
        )}
        {unknown.length ? (
          <>
            <h3>Used on screens but not in the catalogue</h3>
            <ul className="flow-checks">
              {unknown.map((u) => (
                <li key={u.component}>
                  <strong>{u.component}</strong>:{" "}
                  {u.usage.map((x, i) => (
                    <span key={`${x.screenId}-${x.pid}`}>
                      {i ? ", " : ""}
                      <Link href={reviewHref(x.screenId, x.pid)}>
                        <code>{x.address}</code>
                      </Link>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section>
        <h2>Assets ({assets.length})</h2>
        {assets.length === 0 ? (
          <p className="wv-empty">No assets uploaded. Images, icons, logos and fonts the screens use are uploaded with upload_asset and served from this project.</p>
        ) : (
          <div className="wv-asset-grid">
            {assets.map((a) => (
              <div key={a.hash} className="wv-asset-tile">
                {a.mime.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={a.url} alt={a.name} loading="lazy" />
                ) : (
                  <div className="wv-hint">{a.ext.toUpperCase()} font</div>
                )}
                <div>
                  <a href={a.url}>{a.name || a.hash.slice(0, 8)}</a>
                </div>
                <div className="wv-hint">
                  {Math.max(1, Math.round(a.bytes / 1024))} KB · {a.usedBy.length ? `used on ${a.usedBy.map((u) => u.screen).join(", ")}` : "not used yet"}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
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
