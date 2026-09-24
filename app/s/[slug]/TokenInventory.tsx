import { tokenGroup, type TokenSet, type Token } from "@postit/mockup-spec";

const GROUPS = [
  ["color", "Colour"],
  ["typography", "Typography"],
  ["spacing", "Spacing and size"],
  ["radius", "Radius"],
  ["shadow", "Shadow"],
  ["other", "Other"],
] as const;

/**
 * A DTCG token file, shown as the design system it describes rather than as a
 * tree of JSON. The grouping follows Lighter's token inventory. The tree is
 * still one click away beneath it, because the file is also data.
 */
export function TokenInventory({ set }: { set: TokenSet }) {
  const byGroup = new Map<string, Token[]>();
  for (const t of set.tokens) {
    const g = tokenGroup(t);
    byGroup.set(g, [...(byGroup.get(g) ?? []), t]);
  }

  return (
    <div className="tokens">
      <p className="hint">
        {set.tokens.length} design token{set.tokens.length === 1 ? "" : "s"}, in the W3C DTCG format. Screens in the same flow
        are checked against these: each style value in review shows the token it comes from, and values that match none
        are flagged off-token.
      </p>
      {set.problems.length ? (
        <div className="msg msg-warn" role="status">
          <strong>Problems in this file</strong>
          <ul>
            {set.problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {GROUPS.map(([key, label]) => {
        const list = byGroup.get(key);
        if (!list?.length) return null;
        return (
          <section key={key} className="tokens-group">
            <h2>{label}</h2>
            <ul className={`tokens-list tokens-${key}`}>
              {list.map((t) => (
                <li key={t.path} className="token">
                  {key === "color" ? <span className="token-swatch" style={{ background: t.value }} /> : null}
                  {key === "radius" ? <span className="token-radius" style={{ borderRadius: t.value }} /> : null}
                  {key === "shadow" ? <span className="token-shadow" style={{ boxShadow: t.value }} /> : null}
                  {key === "spacing" ? <span className="token-bar" style={{ width: `min(${t.value}, 12rem)` }} /> : null}
                  {key === "typography" && /size/i.test(t.path) ? (
                    <span className="token-type" style={{ fontSize: `min(${t.value}, 2.5rem)` }}>Aa</span>
                  ) : null}
                  <span className="token-name">
                    <code>{t.path}</code>
                    <span className="token-var">{t.cssVar}</span>
                  </span>
                  <span className="token-value">
                    {t.value}
                    {t.alias ? <span className="token-alias"> ← {t.alias}</span> : null}
                  </span>
                  {t.description ? <span className="token-desc">{t.description}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
