"use client";

import { useState } from "react";
import type { Requirement } from "@wave/spec/requirements";

type Result = { ok: boolean; error?: string };

export type Marks = { mandatory: number; recommended: number; waived: number };

export const isOpen = (r: Requirement) => r.status === "missing" || r.status === "proposed";

/** Counts of open and waived requirements per node (and "" for the screen). */
export function marksByNode(reqs: Requirement[]): Map<string, Marks> {
  const out = new Map<string, Marks>();
  for (const r of reqs) {
    const k = r.pid ?? "";
    const m = out.get(k) ?? { mandatory: 0, recommended: 0, waived: 0 };
    if (isOpen(r)) {
      if (r.level === "mandatory") m.mandatory++;
      else m.recommended++;
    } else if (r.status === "waived") m.waived++;
    out.set(k, m);
  }
  return out;
}

/** "mandatory", "recommended" or null: what a tab's mark should say. */
export function tabMark(reqs: Requirement[], tab: string): "mandatory" | "recommended" | null {
  const mine = reqs.filter((r) => r.tab === tab && isOpen(r));
  if (mine.some((r) => r.level === "mandatory")) return "mandatory";
  return mine.length ? "recommended" : null;
}

/**
 * What this element (or the screen) still has to say, for one tab: each field
 * with its status, the value Wave proposes, and Confirm, Change or Waive for
 * the person who uploaded the screen.
 */
export function RequirementsBlock({
  reqs,
  editable,
  onEdit,
  title = "Required here",
  showAnswered = false,
}: {
  reqs: Requirement[];
  editable: boolean;
  onEdit: (body: Record<string, unknown>) => Promise<Result>;
  title?: string;
  showAnswered?: boolean;
}) {
  const shown = reqs
    .filter((r) => showAnswered || r.status !== "answered")
    .sort((a, b) => (a.level === b.level ? 0 : a.level === "mandatory" ? -1 : 1));
  const confirmable = shown.filter((r) => r.status === "proposed" && r.write.kind !== "check");
  if (!shown.length) return null;
  const open = shown.filter(isOpen);
  return (
    <section className="rv-reqs" aria-label={title}>
      <header className="rv-reqs-head">
        <strong>{title}</strong>
        <span className="rv-muted">
          {open.filter((r) => r.level === "mandatory").length} mandatory missing · {open.filter((r) => r.level === "recommended").length} recommended
        </span>
        {editable && confirmable.length > 1 ? (
          <button
            type="button"
            className="wv-btn wv-btn-secondary wv-btn-small"
            onClick={() => void onEdit({ op: "answers", answers: Object.fromEntries(confirmable.map((r) => [r.qid, r.proposal!.value])) })}
          >
            Confirm all {confirmable.length} proposed
          </button>
        ) : null}
      </header>
      <ul>
        {shown.map((r) => (
          <RequirementRow key={r.qid} r={r} editable={editable} onEdit={onEdit} />
        ))}
      </ul>
    </section>
  );
}

function RequirementRow({ r, editable, onEdit }: { r: Requirement; editable: boolean; onEdit: (body: Record<string, unknown>) => Promise<Result> }) {
  const [mode, setMode] = useState<"idle" | "change" | "waive">("idle");
  const [value, setValue] = useState(r.proposal?.value ?? r.value ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (answer: string) => {
    setBusy(true);
    setError(null);
    const res = await onEdit({ op: "answers", answers: { [r.qid]: answer } });
    setBusy(false);
    if (!res.ok) setError(res.error ?? "Could not save.");
    else setMode("idle");
  };

  const statusClass = r.status === "answered" ? "is-ok" : r.status === "waived" ? "is-waived" : r.level === "mandatory" ? "is-missing" : "is-recommended";
  return (
    <li className={`rv-req ${statusClass}`} data-qid={r.qid}>
      <div className="rv-req-line">
        <span className="rv-req-label">
          {r.label}
          {r.level === "mandatory" ? <span className="rv-req-star" title="Mandatory">*</span> : null}
        </span>
        <span className="rv-req-status">
          {r.status === "answered" ? "Answered" : r.status === "waived" ? "Waived" : r.status === "proposed" ? "Proposed" : "Missing"}
        </span>
      </div>
      {r.status === "answered" && r.value ? <div className="rv-req-value"><code>{r.value}</code></div> : null}
      {r.status === "waived" ? (
        <div className="rv-req-value">
          Waived: {r.waivedReason}
          {editable ? (
            <button type="button" className="rv-linkbtn" onClick={() => void onEdit({ op: "unwaive", pid: r.pid, field: r.field })}>
              Withdraw
            </button>
          ) : null}
        </div>
      ) : null}
      {r.status === "missing" || r.status === "proposed" ? <p className="rv-req-question">{r.question}</p> : null}
      {r.status === "proposed" && r.proposal ? (
        <div className="rv-req-proposal">
          Proposed <code>{r.proposal.value}</code> <span className="rv-muted">from {r.proposal.reason}</span>
        </div>
      ) : null}
      {editable && (r.status === "missing" || r.status === "proposed") ? (
        mode === "idle" ? (
          <div className="rv-req-actions">
            {r.status === "proposed" && r.proposal && r.write.kind !== "check" ? (
              <button type="button" className="wv-btn wv-btn-small" disabled={busy} onClick={() => void send(r.proposal!.value)}>
                Confirm
              </button>
            ) : null}
            {r.write.kind !== "check" ? (
              <button type="button" className="wv-btn wv-btn-secondary wv-btn-small" onClick={() => setMode("change")}>
                {r.status === "proposed" ? "Change" : "Answer"}
              </button>
            ) : (
              <span className="rv-muted">Change the design to answer this.</span>
            )}
            <button type="button" className="rv-linkbtn" onClick={() => setMode("waive")}>
              Waive
            </button>
          </div>
        ) : mode === "change" ? (
          <form
            className="rv-req-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (value.trim()) void send(value.trim());
            }}
          >
            {r.choices ? (
              <select className="rv-input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus>
                <option value="">Choose…</option>
                {r.choices.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <input className="rv-input" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
            )}
            <button type="submit" className="wv-btn wv-btn-small" disabled={busy || !value.trim()}>
              Save
            </button>
            <button type="button" className="rv-linkbtn" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </form>
        ) : (
          <form
            className="rv-req-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (reason.trim().length >= 3) void send(`waive: ${reason.trim()}`);
            }}
          >
            <input className="rv-input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why this is not needed" autoFocus />
            <button type="submit" className="wv-btn wv-btn-small" disabled={busy || reason.trim().length < 3}>
              Waive
            </button>
            <button type="button" className="rv-linkbtn" onClick={() => setMode("idle")}>
              Cancel
            </button>
          </form>
        )
      ) : null}
      {error ? <p className="wv-error">{error}</p> : null}
    </li>
  );
}
