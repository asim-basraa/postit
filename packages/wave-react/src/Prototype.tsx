"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { PrototypeView } from "@wave/server/prototype";
import { emptyState, fillRoute, readFrameMessage, type PrototypeState } from "@wave/prototype/protocol";
import { WaveLink, useWave } from "./context";

/**
 * A feature played as a working prototype: its screens in one frame, driven by
 * the prototype runtime against the feature's mock API. View only: no
 * inspector, no comments. The bar on top chooses the device, the screen, the
 * mock API's answers and the network speed.
 */

const DEVICES = [
  { key: "mobile", label: "Mobile", width: 390, height: 844 },
  { key: "tablet", label: "Tablet", width: 834, height: 1194 },
  { key: "desktop", label: "Desktop", width: 1440, height: 900 },
  { key: "fit", label: "Fit", width: 0, height: 0 },
] as const;

type DeviceKey = (typeof DEVICES)[number]["key"];

const SPEEDS = [
  { value: 0, label: "Instant" },
  { value: 1, label: "Normal" },
  { value: 4, label: "Slow network" },
];

type Request = { method: string; url: string; operation: string | null; status: number; ms: number; at: number };

function readQuery(): { screen: string | null; device: DeviceKey | null } {
  if (typeof window === "undefined") return { screen: null, device: null };
  const q = new URLSearchParams(window.location.search);
  const device = q.get("device");
  return { screen: q.get("screen"), device: DEVICES.some((d) => d.key === device) ? (device as DeviceKey) : null };
}

export function PrototypeApp({
  view,
  backHref,
  requirementsHref = null,
}: {
  view: PrototypeView;
  /** Where "back" leaves the prototype for; null when it is opened by a link, with nowhere to go back to. */
  backHref: string | null;
  requirementsHref?: string | null;
}) {
  const ui = useWave();
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const state = useRef<PrototypeState>(emptyState());
  const [history, setHistory] = useState<string[]>([]);
  const [screen, setScreen] = useState<string | null>(view.start);
  const [reveal, setReveal] = useState<string | null>(null);
  const [load, setLoad] = useState(0);
  const [device, setDevice] = useState<DeviceKey>("desktop");
  const [landscape, setLandscape] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [speed, setSpeed] = useState(1);
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [panel, setPanel] = useState<"none" | "scenarios" | "requests" | "notes">("none");
  const [requests, setRequests] = useState<Request[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const current = view.screens.find((s) => s.slug === screen) ?? null;
  const settings = useRef({ choices, speed, screen, reveal });
  settings.current = { choices, speed, screen, reveal };

  // Start where the address says, on the device the screen was designed for.
  useEffect(() => {
    const q = readQuery();
    if (q.screen && view.screens.some((s) => s.slug === q.screen)) setScreen(q.screen);
    const first = view.screens.find((s) => s.slug === (q.screen ?? view.start));
    const widest = first?.viewports.length ? Math.max(...first.viewports) : 1440;
    setDevice(q.device ?? (widest <= 480 ? "mobile" : widest <= 900 ? "tablet" : "desktop"));
  }, [view]);

  useEffect(() => {
    if (!screen) return;
    const url = new URL(window.location.href);
    url.searchParams.set("screen", screen);
    url.searchParams.set("device", device);
    window.history.replaceState(null, "", url.toString());
  }, [screen, device]);

  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 4000);
  }, []);

  const go = useCallback(
    (slug: string, revealNode: string | null, push: boolean) => {
      if (!view.screens.some((s) => s.slug === slug)) {
        flash(`"${slug}" is not a screen in this feature.`);
        return;
      }
      if (push && settings.current.screen) setHistory((h) => [...h, settings.current.screen!]);
      setScreen(slug);
      setReveal(revealNode);
      setLoad((n) => n + 1);
    },
    [view.screens, flash],
  );

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const m = readFrameMessage(event.data);
      if (!m) return;
      switch (m.type) {
        case "wave-proto:ready":
          frame.current.contentWindow?.postMessage(
            {
              type: "wave-proto:init",
              screen: settings.current.screen,
              api: view.api,
              state: state.current,
              choices: settings.current.choices,
              speed: settings.current.speed,
              reveal: settings.current.reveal,
            },
            "*",
          );
          break;
        case "wave-proto:state":
          state.current = m.state;
          break;
        case "wave-proto:navigate":
          state.current = m.state;
          if (m.to.kind === "back") {
            setHistory((h) => {
              const prev = h[h.length - 1];
              if (prev) {
                setScreen(prev);
                setReveal(null);
                setLoad((n) => n + 1);
              }
              return h.slice(0, -1);
            });
          } else {
            go(m.to.screen, m.to.reveal, true);
          }
          break;
        case "wave-proto:request":
          setRequests((r) => [{ ...m, at: Date.now() }, ...r].slice(0, 100));
          break;
        case "wave-proto:notice":
          flash(m.message);
          break;
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [view.api, go, flash]);

  // Scenario and speed changes reach the running screen without reloading it.
  useEffect(() => {
    frame.current?.contentWindow?.postMessage({ type: "wave-proto:settings", choices, speed }, "*");
  }, [choices, speed]);

  useLayoutEffect(() => {
    const el = stage.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = DEVICES.find((x) => x.key === device)!;
  // Room for the stage's padding, the address bar above the device, and a phone's bezel.
  const padX = 48;
  const padY = 90;
  const size =
    device === "fit"
      ? { w: Math.max(320, box.w - padX), h: Math.max(320, box.h - padY) }
      : landscape && device !== "desktop"
        ? { w: d.height, h: d.width }
        : { w: d.width, h: d.height };
  const scale = device === "fit" ? 1 : Math.min(1, (box.w - padX) / size.w, (box.h - padY) / size.h);

  function restart() {
    state.current = emptyState();
    setHistory([]);
    setRequests([]);
    go(view.start ?? view.screens[0]?.slug ?? "", null, false);
  }

  function back() {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (prev) {
        setScreen(prev);
        setReveal(null);
        setLoad((n) => n + 1);
      }
      return h.slice(0, -1);
    });
  }

  const address = current?.route
    ? fillRoute(current.route, state.current.params, Object.fromEntries((view.api?.operations ?? []).flatMap((o) => o.params.map((p) => [p.name, p.example]))))
    : `/${current?.slug ?? ""}`;
  const failures = useMemo(() => (view.api?.operations ?? []).filter((o) => o.responses.length > 1), [view.api]);
  const chosen = Object.values(choices).filter(Boolean).length;
  const errors = view.problems.filter((p) => p.level === "error").length;

  if (!view.screens.length) {
    return (
      <div className="rv pt">
        <div className="rv-bar">
          {backHref ? (
            <WaveLink href={backHref} className="rv-back">
              ← {view.flow.name}
            </WaveLink>
          ) : (
            <strong>{view.flow.name}</strong>
          )}
        </div>
        <p className="rv-empty">This feature has no screens yet.</p>
      </div>
    );
  }

  return (
    <div className="rv pt">
      <div className="rv-bar pt-bar">
        <div className="rv-bar-group">
          {backHref ? (
            <WaveLink href={backHref} className="rv-back">
              ← {view.flow.name}
            </WaveLink>
          ) : (
            <strong className="rv-title">{view.flow.name}</strong>
          )}
          <span className="pt-badge">Prototype</span>
        </div>

        <div className="rv-bar-group" role="group" aria-label="Device">
          {DEVICES.map((x) => (
            <button key={x.key} type="button" className={`rv-toggle${device === x.key ? " is-on" : ""}`} aria-pressed={device === x.key} onClick={() => setDevice(x.key)}>
              {x.label}
            </button>
          ))}
          {device === "mobile" || device === "tablet" ? (
            <button type="button" className={`rv-toggle${landscape ? " is-on" : ""}`} aria-pressed={landscape} onClick={() => setLandscape((v) => !v)} title="Rotate">
              Rotate
            </button>
          ) : null}
          <span className="rv-muted pt-size">
            {size.w}×{size.h}
            {scale < 1 ? ` at ${Math.round(scale * 100)}%` : ""}
          </span>
        </div>

        <div className="rv-bar-group">
          <button type="button" className="rv-toggle" onClick={back} disabled={!history.length} title="Back">
            Back
          </button>
          <select className="rv-select" aria-label="Screen" value={screen ?? ""} onChange={(e) => go(e.target.value, null, true)}>
            {view.screens.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.title}
              </option>
            ))}
          </select>
          <button type="button" className="rv-toggle" onClick={restart} title="Start again with no data">
            Restart
          </button>
        </div>

        <div className="rv-bar-group">
          <select className="rv-select" aria-label="Network" value={speed} onChange={(e) => setSpeed(Number(e.target.value))}>
            {SPEEDS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          {view.api ? (
            <button type="button" className={`rv-toggle${panel === "scenarios" ? " is-on" : ""}`} onClick={() => setPanel((p) => (p === "scenarios" ? "none" : "scenarios"))}>
              Scenarios{chosen ? ` (${chosen})` : ""}
            </button>
          ) : null}
          <button type="button" className={`rv-toggle${panel === "requests" ? " is-on" : ""}`} onClick={() => setPanel((p) => (p === "requests" ? "none" : "requests"))}>
            Requests{requests.length ? ` (${requests.length})` : ""}
          </button>
          {view.problems.length ? (
            <button
              type="button"
              className={`rv-toggle${panel === "notes" ? " is-on" : ""}${errors ? " has-errors" : ""}`}
              onClick={() => setPanel((p) => (p === "notes" ? "none" : "notes"))}
            >
              Notes ({view.problems.length})
            </button>
          ) : null}
        </div>
      </div>

      <div className="pt-body">
        <div className="rv-stage pt-stage" ref={stage}>
          <div className="pt-address" style={{ width: Math.round(size.w * scale) }}>
            <span className="pt-dot" />
            <span className="pt-url">{address}</span>
            <span className="rv-muted">{current?.title}</span>
          </div>
          <div
            className={`pt-device pt-${device}`}
            style={{ width: Math.round(size.w * scale), height: Math.round(size.h * scale) }}
          >
            {current ? (
              <iframe
                key={`${current.pageId}:${load}`}
                ref={frame}
                className="rv-frame"
                title={`${current.title} (prototype)`}
                src={`${ui.api}/screens/${current.pageId}/prototype`}
                sandbox="allow-scripts allow-popups"
                style={{ width: size.w, height: size.h, transform: scale < 1 ? `scale(${scale})` : undefined }}
              />
            ) : null}
          </div>
          {toast ? (
            <div className="rv-toast" role="status">
              {toast}
            </div>
          ) : null}
        </div>

        {panel !== "none" ? (
          <aside className="pt-panel" aria-label={panel}>
            {panel === "scenarios" ? (
              <>
                <h3>Scenarios</h3>
                <p className="wv-hint">Choose what each call answers, to walk through errors and edge cases. It applies from the next call.</p>
                {failures.length ? (
                  failures.map((o) => (
                    <label key={o.id} className="pt-row">
                      <span>
                        <strong>{o.summary || o.id}</strong>
                        <span className="rv-block rv-muted wv-code">
                          {o.method.toUpperCase()} {o.path}
                        </span>
                      </span>
                      <select
                        className="rv-select"
                        value={choices[o.id] ?? o.responses[0].name}
                        onChange={(e) => setChoices((c) => ({ ...c, [o.id]: e.target.value }))}
                      >
                        {o.responses.map((r) => (
                          <option key={r.name} value={r.name}>
                            {r.name}
                            {r.description ? `: ${r.description}` : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))
                ) : (
                  <p className="rv-empty">Every call has a single answer. Add error responses or named examples to the OpenAPI document to choose between them here.</p>
                )}
                {chosen ? (
                  <button type="button" className="wv-btn wv-btn-secondary wv-btn-small" onClick={() => setChoices({})}>
                    Everything succeeds
                  </button>
                ) : null}
              </>
            ) : null}
            {panel === "requests" ? (
              <>
                <h3>Requests</h3>
                <p className="wv-hint">Every call the screens made, answered by the mock server.</p>
                {requests.length ? (
                  <ul className="pt-requests">
                    {requests.map((r, i) => (
                      <li key={`${r.at}-${i}`}>
                        <span className={`pt-status${r.status >= 400 ? " is-bad" : ""}`}>{r.status}</span>
                        <span className="wv-code">
                          {r.method} {r.url.replace(/^https?:\/\/[^/]+/, "")}
                        </span>
                        <span className="rv-muted">
                          {r.operation ?? "no operation"} · {r.ms} ms
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rv-empty">No calls yet.</p>
                )}
              </>
            ) : null}
            {panel === "notes" ? (
              <>
                <h3>About the mock API</h3>
                <ul className="pt-notes">
                  {view.problems.map((p, i) => (
                    <li key={i} className={p.level === "error" ? "rv-error" : undefined}>
                      {p.message}
                    </li>
                  ))}
                </ul>
                {requirementsHref ? (
                  <p>
                    <WaveLink href={requirementsHref} className="rv-link">
                      Data requirements
                    </WaveLink>
                  </p>
                ) : null}
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
