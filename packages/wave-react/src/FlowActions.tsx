"use client";

import { useState } from "react";
import { useWave } from "./context";

/** Approving the flow, and taking away what was approved. */
export function FlowApproval({
  flowId,
  blockers,
  approval,
}: {
  flowId: string;
  blockers: string[];
  approval: { at: string; by: string | null; current: boolean } | null;
}) {
  const ui = useWave();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approved = approval?.current;

  return (
    <section className={`flow-approval ${approved ? "is-approved" : ""}`}>
      {approved ? (
        <>
          <p>
            <strong>Approved and locked</strong> by {approval!.by ?? "a former member"} on {new Date(approval!.at).toLocaleString()}.
            The feature shows the versions it approved: its review, prototype and handover stay as they are when another
            feature changes a screen it shares.
          </p>
          <p>
            <button
              type="button"
              className="wv-btn wv-btn-secondary wv-btn-small"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm("Reopen this feature? It will follow its screens' latest versions and need approving again.")) return;
                setBusy(true);
                const res = await fetch(`${ui.api}/flows/${flowId}/reopen`, { method: "POST" });
                setBusy(false);
                if (res.ok) window.location.reload();
                else setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Could not reopen.");
              }}
            >
              Reopen to change it
            </button>
          </p>
          <div className="flow-handover">
            <a className="wv-btn wv-btn-small" href={`${ui.api}/flows/${flowId}/handover`}>
              Download handover (.zip)
            </a>
            <a className="wv-btn wv-btn-secondary wv-btn-small" href={`${ui.api}/flows/${flowId}/handover?format=md`} target="_blank" rel="noreferrer">
              Read HANDOVER.md
            </a>
            <span className="wv-hint">
              Or ask Claude Code to call <code>get_handover</code> with this flow&apos;s id, <code>{flowId}</code>.
            </span>
          </div>
        </>
      ) : (
        <>
          {approval && !approval.current ? (
            <p className="flow-warn">
              Approved on {new Date(approval.at).toLocaleString()}, then reopened, and a screen or the tokens have changed since,
              so it needs approving again.
            </p>
          ) : null}
          {blockers.length ? (
            <>
              <p>
                <strong>Not ready to approve.</strong> Every screen and the token page must be approved at their current
                versions, with no comment open or waiting to be confirmed.
              </p>
              <ul className="flow-blockers">
                {blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </>
          ) : (
            <p>
              <strong>Ready to approve.</strong> Approving freezes every screen and the token page at their current versions
              and makes the handover available. Somebody other than whoever made the flow has to do it.
            </p>
          )}
          <button
            type="button"
            className="wv-btn wv-btn-small"
            disabled={busy || blockers.length > 0}
            onClick={async () => {
              setBusy(true);
              setError(null);
              const res = await fetch(`${ui.api}/flows/${flowId}/approve`, { method: "POST" });
              setBusy(false);
              if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "That did not work.");
              else ui.refresh();
            }}
          >
            {busy ? "Approving…" : "Approve the flow"}
          </button>
          {error ? <p className="wv-error">{error}</p> : null}
        </>
      )}
    </section>
  );
}

/** Accepting a completeness finding as it is, with the reason; or taking that back. */
export function WaiveButton({
  flowId,
  checkKey,
  message,
  withdraw = false,
}: {
  flowId: string;
  checkKey: string;
  message: string;
  withdraw?: boolean;
}) {
  const ui = useWave();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function send(method: "POST" | "DELETE") {
    setError(null);
    const res = await fetch(`${ui.api}/flows/${flowId}/waivers`, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: checkKey, message, note }),
    });
    if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "That did not work.");
    else {
      setOpen(false);
      ui.refresh();
    }
  }

  if (withdraw) {
    return (
      <button type="button" className="rv-linkbtn" onClick={() => void send("DELETE")}>
        Withdraw
      </button>
    );
  }

  return open ? (
    <form
      className="flow-waive"
      onSubmit={(e) => {
        e.preventDefault();
        void send("POST");
      }}
    >
      <input autoFocus value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this is acceptable" />
      <button type="submit" className="wv-btn wv-btn-small" disabled={!note.trim()}>
        Accept
      </button>
      <button type="button" className="rv-linkbtn" onClick={() => setOpen(false)}>
        Cancel
      </button>
      {error ? <span className="flow-bad">{error}</span> : null}
    </form>
  ) : (
    <button type="button" className="rv-linkbtn" onClick={() => setOpen(true)}>
      Accept as is
    </button>
  );
}
