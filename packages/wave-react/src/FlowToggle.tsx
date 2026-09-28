"use client";

import { useState } from "react";
import { useWave } from "./context";

/** Marks a folder as a flow, or stops it being one. */
export function FlowToggle({ flowId, isFlow }: { flowId: string; isFlow: boolean }) {
  const ui = useWave();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flow-toggle">
      <button
        type="button"
        className={`wv-btn wv-btn-small ${isFlow ? "wv-btn-secondary" : ""}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`${ui.api}/flows/${flowId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ is_flow: !isFlow }),
          });
          setBusy(false);
          if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "That did not work.");
          else ui.refresh();
        }}
      >
        {isFlow ? "Stop treating this as a flow" : "Make this folder a flow"}
      </button>
      {!isFlow ? (
        <span className="wv-hint">
          A flow is a folder of HTML screens reviewed together, approved together, and handed over to Claude Code as one package.
        </span>
      ) : null}
      {error ? <p className="wv-error">{error}</p> : null}
    </div>
  );
}
