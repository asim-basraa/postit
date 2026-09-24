"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { parseDestination } from "@postit/mockup-spec/destination";
import type { SpecNode } from "@postit/mockup-spec";
import type { MockupView } from "@/lib/mockup-view";
import type { CommentAnchor } from "@/lib/comment-threads";
import { useFrame, type ElementRef, type FrameMessage, type Styles } from "./bridge";
import { Layers } from "./Layers";
import { Panel, type Selection } from "./Panel";
import { Findings } from "./Findings";

const VIEWPORTS = [
  { key: "mobile", label: "Mobile", width: 390 },
  { key: "tablet", label: "Tablet", width: 834 },
  { key: "desktop", label: "Desktop", width: 1440 },
] as const;

const ZOOMS = [0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];

function remember<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private window */
  }
}

/**
 * Reviewing one mockup: the page in a frame, a devtools-like inspector over it,
 * and a side panel for what the selected element is, looks like, says and does.
 */
export function ReviewApp({ initial, initialNode }: { initial: MockupView; initialNode: string | null }) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [reload, setReload] = useState(0);
  const [mode, setMode] = useState<"inspect" | "interact">("inspect");
  const [width, setWidth] = useState<number>(1440);
  const [zoom, setZoom] = useState<number>(1);
  const [fit, setFit] = useState(true);
  const [stageWidth, setStageWidth] = useState(0);
  const [showLayers, setShowLayers] = useState(true);
  const [showFindings, setShowFindings] = useState(false);
  const [hideConditional, setHideConditional] = useState(false);
  const [sel, setSel] = useState<Selection>(initialNode ? { kind: "node", id: initialNode } : null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [layerHover, setLayerHover] = useState<string | null>(null);
  const [styles, setStyles] = useState<{ id: string | null; styles: Styles } | null>(null);
  const [activeComment, setActiveComment] = useState<string | null>(null);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<"active" | "all">("active");
  const [toast, setToast] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [previewed, setPreviewed] = useState<{ id: string; state: string } | null>(null);

  // Remembered per person, per browser.
  useEffect(() => {
    setWidth(remember("pi.review.width", 1440));
    const z = remember<number | "fit">("pi.review.zoom", "fit");
    if (z === "fit") setFit(true);
    else {
      setFit(false);
      setZoom(z);
    }
  }, []);

  const nodesById = useMemo(() => new Map(view.nodes.map((n) => [n.id, n])), [view.nodes]);

  const refresh = useCallback(
    async (version?: number) => {
      const q = version ? `?v=${version}` : "";
      const res = await fetch(`/api/v1/mockups/${view.node.id}${q}`, { cache: "no-store" });
      if (!res.ok) return null;
      const next = (await res.json()) as MockupView;
      setView(next);
      return next;
    },
    [view.node.id],
  );

  const refreshComments = useCallback(async () => {
    const res = await fetch(`/api/v1/nodes/${view.node.id}/comments`, { cache: "no-store" });
    if (res.ok) {
      const { comments } = await res.json();
      setView((v) => ({ ...v, comments }));
    }
  }, [view.node.id]);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4000);
  }, []);

  // ---- the frame -----------------------------------------------------------

  const onMessage = useCallback(
    (m: FrameMessage) => {
      switch (m.type) {
        case "pi:hello":
          setReady(true);
          break;
        case "pi:hover":
          setHoverId(m.id);
          break;
        case "pi:select":
          if (m.id) setSel({ kind: "node", id: m.id });
          else if (m.element) setSel({ kind: "element", element: m.element, ancestors: m.ancestors ?? [] });
          else setSel(null);
          if (m.fromUser) setActiveComment(null);
          break;
        case "pi:range":
          setSel({ kind: "range", pid: m.pid, start: m.start, end: m.end, quote: m.quote });
          break;
        case "pi:region":
          setSel({ kind: "region", rect: m.rect, viewport: m.viewport, covered: m.covered });
          break;
        case "pi:styles":
          setStyles({ id: m.id, styles: m.styles });
          break;
        case "pi:pin-click":
          setActiveComment(m.commentId);
          break;
        case "pi:unresolved":
          setUnresolved(m.commentIds);
          break;
        case "pi:navigate":
          navigate(m.to);
          break;
        case "pi:key":
          onKey(m.key);
          break;
        case "pi:state-previewed":
          setPreviewed(m.id && m.state ? { id: m.id, state: m.state } : null);
          break;
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view],
  );

  const { frame, post } = useFrame(onMessage);

  // ---- keyboard ------------------------------------------------------------

  const selectedId = sel?.kind === "node" ? sel.id : sel?.kind === "range" ? sel.pid : null;

  const selectNode = useCallback(
    (id: string | null, scroll = true) => {
      setSel(id ? { kind: "node", id } : null);
      post({ type: "pi:select", id, scroll });
    },
    [post],
  );

  function onKey(key: string) {
    if (key === "toggle-mode") {
      setMode((m) => (m === "inspect" ? "interact" : "inspect"));
      return;
    }
    if (key === "Escape") {
      selectNode(null);
      setActiveComment(null);
      post({ type: "pi:clear-transient" });
      return;
    }
    const current = selectedId ? nodesById.get(selectedId) : null;
    if (!current) {
      if (view.nodes[0]) selectNode(view.nodes[0].id);
      return;
    }
    const siblings = view.nodes.filter((n) => n.parent === current.parent);
    const i = siblings.findIndex((n) => n.id === current.id);
    if (key === "ArrowUp" && current.parent) selectNode(current.parent);
    if (key === "ArrowDown") {
      const child = view.nodes.find((n) => n.parent === current.id);
      if (child) selectNode(child.id);
    }
    if (key === "ArrowLeft" && i > 0) selectNode(siblings[i - 1].id);
    if (key === "ArrowRight" && i < siblings.length - 1) selectNode(siblings[i + 1].id);
  }

  useEffect(() => {
    const listen = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "i" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onKey("toggle-mode");
        return;
      }
      if (mode !== "inspect") return;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Escape"].includes(e.key)) {
        e.preventDefault();
        onKey(e.key);
      }
    };
    window.addEventListener("keydown", listen);
    return () => window.removeEventListener("keydown", listen);
  });

  // ---- navigation between screens ------------------------------------------

  function navigate(to: string) {
    const dest = parseDestination(to);
    if (dest.kind === "back") {
      router.back();
      return;
    }
    if (dest.kind === "url" || dest.kind === "invalid") return;
    const flow = view.flow;
    const currentSlug = view.screen.screen ?? null;
    const slug = dest.kind === "screen" ? dest.screen : (dest.screen ?? currentSlug);
    const screen = flow?.screens.find((s) => s.slug === slug) ?? (slug === currentSlug || !slug ? null : undefined);
    if (screen === undefined) {
      flash(`This leads to ${to}, which is not a screen in this flow.`);
      return;
    }
    const pageId = screen ? screen.pageId : view.node.id;
    const nodes = screen ? screen.nodes : view.nodes;
    let nodeParam = "";
    if (dest.kind === "node" || dest.kind === "modal") {
      const node = nodes.find((n) => n.slug === dest.node || n.id === dest.node);
      if (!node) {
        flash(`This leads to ${to}, but there is no such node on that screen.`);
        return;
      }
      if (pageId === view.node.id) {
        selectNode(node.id);
        return;
      }
      nodeParam = `?node=${encodeURIComponent(node.id)}`;
    }
    if (pageId !== view.node.id) router.push(`/review/${pageId}${nodeParam}`);
  }

  // ---- keeping the frame in step -------------------------------------------

  useEffect(() => {
    if (!ready) return;
    post({ type: "pi:mode", mode });
  }, [ready, mode, post]);

  useEffect(() => {
    if (!ready) return;
    post({ type: "pi:hide-conditional", on: hideConditional });
  }, [ready, hideConditional, post]);

  useEffect(() => {
    if (!ready) return;
    if (sel?.kind === "node") post({ type: "pi:select", id: sel.id, scroll: true });
    // Only when the frame (re)loads: selection changes made in the frame are already there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    post({ type: "pi:highlight", id: layerHover });
  }, [ready, layerHover, post]);

  // Styles for whatever is selected.
  useEffect(() => {
    if (!ready) return;
    setStyles(null);
    if (sel?.kind === "node") post({ type: "pi:get-styles", id: sel.id });
    else if (sel?.kind === "element") post({ type: "pi:get-styles", id: null });
  }, [ready, sel, post, view.version]);

  // Pins: one per top-level anchored comment, numbered in the order they were made.
  const anchored = useMemo(
    () =>
      view.comments
        .filter((c) => !c.parent_id && !c.deleted && c.anchor)
        .map((c, i) => ({ ...c, n: i + 1 })),
    [view.comments],
  );

  const orphaned = useMemo(() => {
    if (!view.current) return new Set<string>();
    const ids = new Set(view.nodes.map((n) => n.id));
    const out = new Set<string>();
    for (const c of anchored) {
      const a = c.anchor!;
      if ((a.kind === "node" || a.kind === "range") && !ids.has(a.pid)) out.add(c.id);
      if (a.kind === "element" && unresolved.includes(c.id)) out.add(c.id);
    }
    return out;
  }, [anchored, view.nodes, view.current, unresolved]);

  useEffect(() => {
    if (!ready) return;
    const pins = anchored
      .filter((c) => statusFilter === "all" || (c.status !== "resolved" && c.status !== "wont_fix"))
      .map((c) => ({
        n: c.n,
        commentId: c.id,
        anchor: c.anchor,
        status: c.status ?? "open",
        title: `${c.author_email}: ${c.body.slice(0, 120)}`,
      }));
    post({ type: "pi:pins", pins, active: activeComment });
  }, [ready, anchored, statusFilter, activeComment, post]);

  useEffect(() => {
    if (!ready || !activeComment) return;
    const c = anchored.find((x) => x.id === activeComment);
    if (c?.anchor) post({ type: "pi:show-anchor", anchor: c.anchor, commentId: c.id });
  }, [ready, activeComment, anchored, post]);

  // The address says what is selected, so a link can point at a node.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId) url.searchParams.set("node", selectedId);
    else url.searchParams.delete("node");
    if (!view.current) url.searchParams.set("v", String(view.version));
    else url.searchParams.delete("v");
    window.history.replaceState(null, "", url.toString());
  }, [selectedId, view.current, view.version]);

  // Fit-to-width zoom follows the stage size.
  const stageRef = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    const measure = () => setStageWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
  }, []);
  const effectiveZoom = fit && stageWidth ? Math.min(1, (stageWidth - 32) / width) : zoom;

  // ---- writing -------------------------------------------------------------

  const editable = view.canEdit && view.current;

  const edit = useCallback(
    async (body: Record<string, unknown>): Promise<{ ok: boolean; id?: string; error?: string }> => {
      const res = await fetch(`/api/v1/mockups/${view.node.id}/edit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...body, version: view.version }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          await refresh();
          setReady(false);
          setReload((r) => r + 1);
        }
        return { ok: false, error: out.error ?? `Could not save (${res.status}).` };
      }
      await refresh();
      setReady(false);
      setReload((r) => r + 1);
      return { ok: true, id: out.id };
    },
    [view.node.id, view.version, refresh],
  );

  const comment = useCallback(
    async (body: string, anchor: CommentAnchor | null, parentId: string | null = null) => {
      const res = await fetch(`/api/v1/nodes/${view.node.id}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body, parent_id: parentId, anchor, content_version: view.version }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) return { ok: false, error: out.error ?? "Could not post that." };
      setView((v) => ({ ...v, comments: out.comments ?? v.comments }));
      return { ok: true };
    },
    [view.node.id, view.version],
  );

  const setStatus = useCallback(
    async (id: string, status: string, note: string | null) => {
      const res = await fetch(`/api/v1/comments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, note, version: view.node.content_version }),
      });
      const out = await res.json().catch(() => ({}));
      await refreshComments();
      return res.ok ? { ok: true } : { ok: false, error: out.error ?? "Could not change that." };
    },
    [view.node.content_version, refreshComments],
  );

  const reattach = useCallback(
    async (id: string, anchor: CommentAnchor) => {
      const res = await fetch(`/api/v1/comments/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ anchor, version: view.version }),
      });
      const out = await res.json().catch(() => ({}));
      await refreshComments();
      return res.ok ? { ok: true } : { ok: false, error: out.error ?? "Could not move that." };
    },
    [view.version, refreshComments],
  );

  const removeComment = useCallback(
    async (id: string) => {
      await fetch(`/api/v1/comments/${id}`, { method: "DELETE" });
      await refreshComments();
    },
    [refreshComments],
  );

  const switchVersion = useCallback(
    async (version: number) => {
      const next = await refresh(version === view.node.content_version ? undefined : version);
      if (next) {
        setReady(false);
        setReload((r) => r + 1);
      }
    },
    [refresh, view.node.content_version],
  );

  const frameSrc = `/m/review/${view.node.id}?v=${view.version}&r=${reload}`;
  const pageHref = `/s/${view.node.space_slug}/${view.node.path}`;
  const flowHref = view.flow ? `/s/${view.node.space_slug}/${view.flow.path}` : null;
  const errors = view.findings.filter((f) => f.severity === "error").length;
  const selectedNode: SpecNode | undefined = selectedId ? nodesById.get(selectedId) : undefined;
  const hoverNode = hoverId ? nodesById.get(hoverId) : undefined;

  return (
    <div className="rv">
      <header className="rv-bar">
        <div className="rv-bar-group">
          <Link href={flowHref ?? pageHref} className="rv-back" title={flowHref ? "Back to the flow" : "Back to the page"}>
            ← {view.flow ? view.flow.name : "Page"}
          </Link>
          {view.flow && view.flow.screens.length > 1 ? (
            <select
              className="rv-select"
              aria-label="Screen"
              value={view.node.id}
              onChange={(e) => router.push(`/review/${e.target.value}`)}
            >
              {view.flow.screens.map((s) => (
                <option key={s.pageId} value={s.pageId}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <strong className="rv-title">{view.node.name}</strong>
          )}
          <select
            className="rv-select"
            aria-label="Version"
            value={view.version}
            onChange={(e) => void switchVersion(Number(e.target.value))}
          >
            {(view.versions.length ? view.versions : [{ content_version: view.version, created_at: "", updated_at: "" }]).map((v) => (
              <option key={v.content_version} value={v.content_version}>
                v{v.content_version}
                {v.content_version === view.node.content_version ? " (current)" : ""}
              </option>
            ))}
          </select>
          {view.versions.length > 1 ? (
            <Link className="rv-link" href={`/review/${view.node.id}/compare`}>
              Compare
            </Link>
          ) : null}
        </div>

        <div className="rv-bar-group" role="group" aria-label="Mode">
          <button
            type="button"
            className={`rv-toggle ${mode === "inspect" ? "is-on" : ""}`}
            onClick={() => setMode("inspect")}
            title="Inspect: clicks select (Ctrl/Cmd+I to switch)"
          >
            Inspect
          </button>
          <button
            type="button"
            className={`rv-toggle ${mode === "interact" ? "is-on" : ""}`}
            onClick={() => setMode("interact")}
            title="Interact: the mockup behaves normally, and destinations open their screens"
          >
            Interact
          </button>
        </div>

        <div className="rv-bar-group" role="group" aria-label="Viewport">
          {VIEWPORTS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={`rv-toggle ${width === v.width ? "is-on" : ""}`}
              onClick={() => {
                setWidth(v.width);
                store("pi.review.width", v.width);
              }}
            >
              {v.label}
            </button>
          ))}
          <input
            className="rv-width"
            type="number"
            min={240}
            max={3840}
            value={width}
            aria-label="Width in pixels"
            onChange={(e) => {
              const w = Math.max(240, Math.min(3840, Number(e.target.value) || 0));
              setWidth(w);
              store("pi.review.width", w);
            }}
          />
          <select
            className="rv-select"
            aria-label="Zoom"
            value={fit ? "fit" : String(zoom)}
            onChange={(e) => {
              if (e.target.value === "fit") {
                setFit(true);
                store("pi.review.zoom", "fit");
              } else {
                setFit(false);
                setZoom(Number(e.target.value));
                store("pi.review.zoom", Number(e.target.value));
              }
            }}
          >
            <option value="fit">Fit ({Math.round(effectiveZoom * 100)}%)</option>
            {ZOOMS.map((z) => (
              <option key={z} value={z}>
                {Math.round(z * 100)}%
              </option>
            ))}
          </select>
        </div>

        <div className="rv-bar-group">
          <button type="button" className={`rv-toggle ${showLayers ? "is-on" : ""}`} onClick={() => setShowLayers((s) => !s)}>
            Layers
          </button>
          <button
            type="button"
            className={`rv-toggle ${hideConditional ? "is-on" : ""}`}
            onClick={() => setHideConditional((s) => !s)}
            title="Hide every node with a visibility condition"
          >
            Hide conditional
          </button>
          <button
            type="button"
            className={`rv-toggle ${showFindings ? "is-on" : ""} ${errors ? "has-errors" : ""}`}
            onClick={() => setShowFindings((s) => !s)}
          >
            Findings {view.findings.length}
          </button>
          <select
            className="rv-select"
            aria-label="Which comments to pin"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "active" | "all")}
          >
            <option value="active">Pins: open</option>
            <option value="all">Pins: all</option>
          </select>
        </div>
      </header>

      {!view.current ? (
        <p className="rv-banner">
          You are looking at version {view.version}. The page is at version {view.node.content_version}, and only the current
          version can be edited.{" "}
          <button type="button" className="rv-linkbtn" onClick={() => void switchVersion(view.node.content_version)}>
            Go to the current version
          </button>
        </p>
      ) : null}

      <div className={`rv-body ${showLayers ? "with-layers" : ""}`}>
        {showLayers ? (
          <Layers
            nodes={view.nodes}
            selectedId={selectedId}
            hoverId={hoverId}
            onHover={setLayerHover}
            onSelect={(id) => selectNode(id)}
          />
        ) : null}

        <div className="rv-stage" ref={stageRef}>
          <div
            className="rv-frame-wrap"
            style={{ width: width * effectiveZoom, height: `calc(100% - 8px)` }}
          >
            <iframe
              key={frameSrc}
              ref={frame}
              className="rv-frame"
              title={`${view.node.name}, in review`}
              src={frameSrc}
              sandbox="allow-scripts allow-popups"
              referrerPolicy="no-referrer"
              onLoad={() => undefined}
              style={{
                width,
                height: `${100 / effectiveZoom}%`,
                transform: `scale(${effectiveZoom})`,
              }}
            />
          </div>
          {mode === "inspect" ? (
            <p className="rv-hint">
              {hoverNode ? (
                <>
                  <code>{hoverNode.slug ?? hoverNode.id}</code> · click to select, drag across words to select text,
                  Shift+drag to mark an area
                </>
              ) : (
                "Click to select · drag across words to select text · Shift+drag to mark an area · arrow keys move the selection"
              )}
            </p>
          ) : (
            <p className="rv-hint">Interact: the mockup behaves as it will, and destinations open their screens.</p>
          )}
          {toast ? <div className="rv-toast" role="status">{toast}</div> : null}
        </div>

        <Panel
          view={view}
          sel={sel}
          node={selectedNode}
          nodesById={nodesById}
          styles={styles}
          editable={editable}
          anchored={anchored}
          orphaned={orphaned}
          activeComment={activeComment}
          previewed={previewed}
          onActivateComment={(id) => setActiveComment(id)}
          onSelectNode={(id) => selectNode(id)}
          onEdit={edit}
          onComment={comment}
          onStatus={setStatus}
          onReattach={reattach}
          onRemoveComment={removeComment}
          onPreviewState={(id, state) => post({ type: "pi:preview-state", id, state })}
          onBoxLayer={(layer) => post({ type: "pi:box", layer })}
          onNavigate={navigate}
          onClearSelection={() => {
            setSel(null);
            post({ type: "pi:select", id: null });
            post({ type: "pi:clear-transient" });
          }}
          selectElement={(element: ElementRef) => post({ type: "pi:select", id: null, element })}
        />
      </div>

      {showFindings ? (
        <Findings
          findings={view.findings}
          onClose={() => setShowFindings(false)}
          onSelect={(pid) => selectNode(pid)}
          nodesById={nodesById}
        />
      ) : null}
    </div>
  );
}
