"use client";

import { useEffect, useState } from "react";

type Link = { id: string; label: string; created_at: string; expires_at: string | null; revoked_at: string | null };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/**
 * Links that open a feature's prototype without an account. A link is shown
 * once, when it is made: only its hash is kept, so it cannot be shown again.
 */
export function PrototypeLinks({ flowId }: { flowId: string }) {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [label, setLabel] = useState("");
  const [days, setDays] = useState("30");
  const [fresh, setFresh] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function load() {
    const res = await fetch(`/api/v1/flows/${flowId}/prototype-links`, { cache: "no-store" });
    if (res.ok) setLinks(((await res.json()) as { links: Link[] }).links);
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v1/flows/${flowId}/prototype-links`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ label, expires_in_days: days === "never" ? null : Number(days) }),
    });
    const out = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    setBusy(false);
    if (!res.ok || !out.url) {
      setError(out.error ?? "Could not make a link.");
      return;
    }
    setFresh(out.url);
    setCopied(false);
    setLabel("");
    void load();
  }

  async function revoke(id: string) {
    const res = await fetch(`/api/v1/prototype-links/${id}`, { method: "DELETE" });
    if (!res.ok) setError("Could not revoke that link.");
    void load();
  }

  const live = (links ?? []).filter((l) => !l.revoked_at && (!l.expires_at || new Date(l.expires_at) > new Date()));

  return (
    <section className="flow-section proto-links">
      <h2>Share the prototype</h2>
      <p className="wv-hint">
        A link opens this feature&apos;s prototype for anyone who has it, without an account. View only; revoke it here at any time.
      </p>
      <form onSubmit={create} className="proto-links-form">
        <input className="rv-select" placeholder="Who it is for, e.g. Client demo" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={200} aria-label="Label" />
        <select className="rv-select" value={days} onChange={(e) => setDays(e.target.value)} aria-label="Expires">
          <option value="7">Expires in 7 days</option>
          <option value="30">Expires in 30 days</option>
          <option value="90">Expires in 90 days</option>
          <option value="never">Never expires</option>
        </select>
        <button type="submit" className="wv-btn" disabled={busy}>
          {busy ? "Making…" : "Make a link"}
        </button>
      </form>
      {fresh ? (
        <p className="proto-links-fresh">
          <code>{fresh}</code>{" "}
          <button
            type="button"
            className="wv-btn wv-btn-secondary wv-btn-small"
            onClick={() => {
              void navigator.clipboard?.writeText(fresh).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy"}
          </button>
          <span className="wv-hint rv-block">Copy it now: it is not shown again.</span>
        </p>
      ) : null}
      {error ? <p className="rv-error">{error}</p> : null}
      {live.length ? (
        <ul className="proto-links-list">
          {live.map((l) => (
            <li key={l.id}>
              <span>{l.label || "Untitled link"}</span>
              <span className="wv-hint">
                made {day(l.created_at)}
                {l.expires_at ? `, expires ${day(l.expires_at)}` : ", never expires"}
              </span>
              <button type="button" className="rv-linkbtn" onClick={() => void revoke(l.id)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : links ? (
        <p className="wv-hint">No live links.</p>
      ) : null}
    </section>
  );
}
