"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SpecNode } from "@postit/mockup-spec";

const ROW = 26;

/**
 * The screen's nodes as a tree, like the Elements panel of a browser's
 * devtools. Built from the node index, so it is exactly the set of things that
 * can be addressed, commented on and specified.
 *
 * Rows are virtualised: a big mockup has thousands of nodes and drawing them
 * all is what makes a panel like this sluggish.
 */
export function Layers({
  nodes,
  selectedId,
  hoverId,
  onHover,
  onSelect,
}: {
  nodes: SpecNode[];
  selectedId: string | null;
  hoverId: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [scrollTop, setScrollTop] = useState(0);
  const [height, setHeight] = useState(600);
  const box = useRef<HTMLDivElement | null>(null);

  const hasChildren = useMemo(() => {
    const s = new Set<string>();
    for (const n of nodes) if (n.parent) s.add(n.parent);
    return s;
  }, [nodes]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      const match = new Set(
        nodes
          .filter((n) =>
            [n.slug, n.id, n.text, n.attrs.component, n.tag].some((v) => v?.toLowerCase().includes(q)),
          )
          .map((n) => n.id),
      );
      // Keep ancestors of matches, so a match is never shown out of context.
      const keep = new Set<string>();
      for (const n of nodes) if (match.has(n.id)) [n.id, ...n.ancestors].forEach((a) => keep.add(a));
      return nodes.filter((n) => keep.has(n.id)).map((n) => ({ node: n, match: match.has(n.id) }));
    }
    return nodes
      .filter((n) => !n.ancestors.some((a) => collapsed.has(a)))
      .map((n) => ({ node: n, match: false }));
  }, [nodes, query, collapsed]);

  // Selecting on the canvas opens the row's ancestors and scrolls it into view.
  useEffect(() => {
    if (!selectedId) return;
    const n = nodes.find((x) => x.id === selectedId);
    if (!n) return;
    if (n.ancestors.some((a) => collapsed.has(a))) {
      setCollapsed((c) => {
        const next = new Set(c);
        n.ancestors.forEach((a) => next.delete(a));
        return next;
      });
      return;
    }
    const i = rows.findIndex((r) => r.node.id === selectedId);
    const el = box.current;
    if (i >= 0 && el) {
      const top = i * ROW;
      if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - ROW) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
    }
  }, [selectedId, nodes, rows, collapsed]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const first = Math.max(0, Math.floor(scrollTop / ROW) - 10);
  const last = Math.min(rows.length, Math.ceil((scrollTop + height) / ROW) + 10);

  return (
    <aside className="rv-layers" aria-label="Layers">
      <div className="rv-layers-head">
        <input
          className="rv-input"
          type="search"
          placeholder="Find a node"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="rv-muted">{nodes.length} nodes</span>
      </div>
      {nodes.length === 0 ? (
        <p className="rv-empty">
          Nothing on this screen has a <code>data-pi-id</code>, so there is nothing to list. Elements can still be
          clicked and commented on.
        </p>
      ) : null}
      <div className="rv-layers-list" ref={box} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)} role="tree">
        <div style={{ height: rows.length * ROW, position: "relative" }}>
          {rows.slice(first, last).map(({ node, match }, k) => {
            const i = first + k;
            const depth = node.ancestors.length;
            const open = !collapsed.has(node.id);
            const cls = [
              "rv-layer",
              node.id === selectedId ? "is-selected" : "",
              node.id === hoverId ? "is-hover" : "",
              match ? "is-match" : "",
            ].join(" ");
            return (
              <div
                key={node.id}
                role="treeitem"
                aria-selected={node.id === selectedId}
                className={cls}
                style={{ top: i * ROW, paddingLeft: 6 + depth * 12 }}
                onMouseEnter={() => onHover(node.id)}
                onMouseLeave={() => onHover(null)}
                onClick={() => onSelect(node.id)}
              >
                {hasChildren.has(node.id) && !query ? (
                  <button
                    type="button"
                    className="rv-twisty"
                    aria-label={open ? "Collapse" : "Expand"}
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsed((c) => {
                        const next = new Set(c);
                        if (next.has(node.id)) next.delete(node.id);
                        else next.add(node.id);
                        return next;
                      });
                    }}
                  >
                    {open ? "▾" : "▸"}
                  </button>
                ) : (
                  <span className="rv-twisty" />
                )}
                <span className="rv-layer-name">{node.slug ?? `<${node.tag}>`}</span>
                {node.attrs.component ? <span className="rv-chip">{node.attrs.component}</span> : null}
                {node.attrs.action || node.attrs.to ? <span className="rv-dot rv-dot-action" title="Has an action" /> : null}
                {node.attrs.content === "dynamic" ? <span className="rv-dot rv-dot-dynamic" title="Dynamic" /> : null}
                {!node.slug && node.text ? <span className="rv-layer-text">{node.text.slice(0, 40)}</span> : null}
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
