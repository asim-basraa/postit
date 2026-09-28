"use client";

import { useState } from "react";
import { useWave } from "./context";

/** Marks a folder as a project, or stops it being one. */
export function ProjectToggle({ folderId, isProject }: { folderId: string; isProject: boolean }) {
  const ui = useWave();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flow-toggle">
      <button
        type="button"
        className={`wv-btn wv-btn-small ${isProject ? "wv-btn-secondary" : ""}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const res = await fetch(`${ui.api}/projects/${folderId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ is_project: !isProject }),
          });
          setBusy(false);
          if (!res.ok) setError((await res.json().catch(() => ({}))).error ?? "That did not work.");
          else ui.refresh();
        }}
      >
        {isProject ? "Stop treating this as a project" : "Make this folder a project"}
      </button>
      {!isProject ? (
        <span className="wv-hint">
          A project holds a design system (tokens and components) and its features. Wave checks every screen in it against both.
        </span>
      ) : null}
      {error ? <p className="wv-error">{error}</p> : null}
    </div>
  );
}
