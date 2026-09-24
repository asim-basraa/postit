"use client";

import type { Finding, SpecNode } from "@postit/mockup-spec";

const ORDER = { error: 0, warn: 1, info: 2 } as const;

/** What the spec parser found wrong with this version, with a way to each node. */
export function Findings({
  findings,
  nodesById,
  onSelect,
  onClose,
}: {
  findings: Finding[];
  nodesById: Map<string, SpecNode>;
  onSelect: (pid: string) => void;
  onClose: () => void;
}) {
  const sorted = [...findings].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  return (
    <section className="rv-findings" aria-label="Validation findings">
      <header>
        <strong>Validation</strong>
        <span className="rv-muted">
          {findings.length === 0 ? "No findings." : `${findings.length} finding${findings.length === 1 ? "" : "s"}. None of these block a save.`}
        </span>
        <button type="button" className="rv-linkbtn" onClick={onClose}>
          Close
        </button>
      </header>
      <ul>
        {sorted.map((f, i) => (
          <li key={i} className={`rv-finding rv-sev-${f.severity}`}>
            <span className="rv-sev">{f.severity}</span>
            <span className="rv-code">{f.code}</span>
            <span>{f.message}</span>
            {f.pid && nodesById.has(f.pid) ? (
              <button type="button" className="rv-linkbtn" onClick={() => onSelect(f.pid!)}>
                Show
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
