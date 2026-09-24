"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MockupView } from "@/lib/mockup-view";
import type { SpecNode } from "@postit/mockup-spec";
import { useFrame, type FrameMessage } from "../bridge";

type Change = { id: string; kind: "added" | "removed" | "changed"; slug: string | null; diffs: { key: string; before: string | null; after: string | null }[] };

function diffNodes(a: SpecNode[], b: SpecNode[]): Change[] {
  const before = new Map(a.map((n) => [n.id, n]));
  const after = new Map(b.map((n) => [n.id, n]));
  const out: Change[] = [];
  for (const n of b) {
    const old = before.get(n.id);
    if (!old) {
      out.push({ id: n.id, kind: "added", slug: n.slug, diffs: [] });
      continue;
    }
    const diffs: Change["diffs"] = [];
    if (old.text !== n.text) diffs.push({ key: "text", before: old.text, after: n.text });
    const keys = new Set([...Object.keys(old.attrs), ...Object.keys(n.attrs)]);
    for (const k of keys) {
      if (old.attrs[k] !== n.attrs[k]) diffs.push({ key: `data-pi-${k}`, before: old.attrs[k] ?? null, after: n.attrs[k] ?? null });
    }
    if (diffs.length) out.push({ id: n.id, kind: "changed", slug: n.slug, diffs });
  }
  for (const n of a) if (!after.has(n.id)) out.push({ id: n.id, kind: "removed", slug: n.slug, diffs: [] });
  return out;
}

/**
 * Two versions, side by side at the same width, scrolling together. Nodes are
 * matched by id, which is why ids belong to the designer and survive edits.
 */
export function Compare({
  nodeId,
  name,
  backHref,
  versions,
  initialA,
  initialB,
}: {
  nodeId: string;
  name: string;
  backHref: string;
  versions: number[];
  initialA: number;
  initialB: number;
}) {
  const [a, setA] = useState(initialA);
  const [b, setB] = useState(initialB);
  const [views, setViews] = useState<{ a: MockupView | null; b: MockupView | null }>({ a: null, b: null });
  const [width, setWidth] = useState(1440);
  const [selected, setSelected] = useState<string | null>(null);
  const [readyA, setReadyA] = useState(false);
  const [readyB, setReadyB] = useState(false);

  useEffect(() => {
    let live = true;
    Promise.all([a, b].map((v) => fetch(`/api/v1/mockups/${nodeId}?v=${v}`).then((r) => (r.ok ? r.json() : null)))).then(([va, vb]) => {
      if (live) setViews({ a: va, b: vb });
    });
    return () => {
      live = false;
    };
  }, [nodeId, a, b]);

  const changes = useMemo(() => (views.a && views.b ? diffNodes(views.a.nodes, views.b.nodes) : []), [views]);

  const frameA = useFrame(useCallback((m: FrameMessage) => onMsg("a", m), []));
  const frameB = useFrame(useCallback((m: FrameMessage) => onMsg("b", m), []));

  function onMsg(side: "a" | "b", m: FrameMessage) {
    const other = side === "a" ? frameB : frameA;
    if (m.type === "pi:hello") (side === "a" ? setReadyA : setReadyB)(true);
    if (m.type === "pi:scroll") other.post({ type: "pi:scroll-to", x: m.x, y: m.y });
    if (m.type === "pi:select" && m.fromUser) {
      setSelected(m.id);
      other.post({ type: "pi:select", id: m.id });
    }
  }

  useEffect(() => {
    if (!readyA) return;
    frameA.post({ type: "pi:diff", diff: { changed: changes.filter((c) => c.kind === "changed").map((c) => c.id), removed: changes.filter((c) => c.kind === "removed").map((c) => c.id) } });
  }, [readyA, changes, frameA]);
  useEffect(() => {
    if (!readyB) return;
    frameB.post({ type: "pi:diff", diff: { changed: changes.filter((c) => c.kind === "changed").map((c) => c.id), added: changes.filter((c) => c.kind === "added").map((c) => c.id) } });
  }, [readyB, changes, frameB]);

  const pick = (id: string) => {
    setSelected(id);
    frameA.post({ type: "pi:select", id });
    frameB.post({ type: "pi:select", id });
  };

  const zoom = 0.5;
  return (
    <div className="rv rv-compare">
      <header className="rv-bar">
        <div className="rv-bar-group">
          <Link href={backHref} className="rv-back">← {name}</Link>
          <label>
            Before{" "}
            <select className="rv-select" value={a} onChange={(e) => { setReadyA(false); setA(Number(e.target.value)); }}>
              {versions.map((v) => <option key={v} value={v}>v{v}</option>)}
            </select>
          </label>
          <label>
            After{" "}
            <select className="rv-select" value={b} onChange={(e) => { setReadyB(false); setB(Number(e.target.value)); }}>
              {versions.map((v) => <option key={v} value={v}>v{v}</option>)}
            </select>
          </label>
        </div>
        <div className="rv-bar-group">
          {[390, 834, 1440].map((w) => (
            <button key={w} type="button" className={`rv-toggle ${width === w ? "is-on" : ""}`} onClick={() => setWidth(w)}>{w}</button>
          ))}
        </div>
        <div className="rv-bar-group rv-legend">
          <span className="rv-legend-added">added</span>
          <span className="rv-legend-changed">changed</span>
          <span className="rv-legend-removed">removed</span>
        </div>
      </header>
      <div className="rv-compare-body">
        {(["a", "b"] as const).map((side) => {
          const f = side === "a" ? frameA : frameB;
          const v = side === "a" ? a : b;
          return (
            <div key={side} className="rv-compare-col">
              <div className="rv-compare-label">v{v}</div>
              <div className="rv-frame-wrap" style={{ width: width * zoom, height: "calc(100% - 28px)" }}>
                <iframe
                  key={`${side}-${v}`}
                  ref={f.frame}
                  className="rv-frame"
                  title={`${name}, version ${v}`}
                  src={`/m/review/${nodeId}?v=${v}`}
                  sandbox="allow-scripts allow-popups"
                  style={{ width, height: `${100 / zoom}%`, transform: `scale(${zoom})` }}
                />
              </div>
            </div>
          );
        })}
        <aside className="rv-panel rv-changes">
          <div className="rv-panel-head">
            <strong>{changes.length} change{changes.length === 1 ? "" : "s"}</strong>
          </div>
          <div className="rv-panel-body">
            {changes.length === 0 ? <p className="rv-muted">No node was added, removed or changed. Styling alone is not compared.</p> : null}
            <ul className="rv-list">
              {changes.map((c) => (
                <li key={c.id} className={`rv-change rv-change-${c.kind} ${selected === c.id ? "is-on" : ""}`}>
                  <button type="button" className="rv-linkbtn" onClick={() => pick(c.id)}>
                    {c.slug ?? c.id}
                  </button>{" "}
                  <span className="rv-muted">{c.kind}</span>
                  {selected === c.id && c.diffs.length ? (
                    <table className="rv-styles">
                      <tbody>
                        {c.diffs.map((d) => (
                          <tr key={d.key}>
                            <th>{d.key}</th>
                            <td>
                              <del>{d.before ?? "(none)"}</del> → <ins>{d.after ?? "(none)"}</ins>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
