"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Marks a folder as a flow, or stops it being one. */
export function FlowToggle({ folderId, isFlow }: { folderId: string; isFlow: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flow-toggle">
      <button
        type="button"
        className={`btn btn-small ${isFlow ? "btn-secondary" : ""}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`/api/v1/flows/${folderId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ is_flow: !isFlow }),
          });
          setBusy(false);
          if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "That did not work.");
          else router.refresh();
        }}
      >
        {isFlow ? "Stop treating this as a flow" : "Make this folder a flow"}
      </button>
      {!isFlow ? (
        <span className="hint">
          A flow is a folder of HTML screens reviewed together, approved together, and handed over to Claude Code as one package.
        </span>
      ) : null}
      {error ? <p className="msg msg-error">{error}</p> : null}
    </div>
  );
}
