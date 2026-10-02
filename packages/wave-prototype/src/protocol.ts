import type { PrototypeApi } from "./openapi";

/**
 * Messages between the prototype viewer and the screen it frames.
 *
 * The frame runs somebody's markup in an opaque origin, so everything it sends
 * is untrusted: readFrameMessage checks every field before the viewer acts on
 * it. The viewer only listens to its own frame's window.
 */

/** What the prototype remembers across screens: the data it has loaded or collected, and route parameters. */
export type PrototypeState = {
  data: Record<string, unknown>;
  params: Record<string, string>;
};

export const emptyState = (): PrototypeState => ({ data: {}, params: {} });

/** Viewer to frame. */
export type InitMessage = {
  type: "wave-proto:init";
  screen: string;
  api: PrototypeApi | null;
  state: PrototypeState;
  /** Which response each operation gives, by operation id and response name. Default: the first success. */
  choices: Record<string, string>;
  /** Multiplies every operation's delay: 0 instant, 1 as written, 3 slow network. */
  speed: number;
  /** A node to show on arrival (a node:screen/slug destination on another screen). */
  reveal: string | null;
  /**
   * Without an API (the Figma flow), what an action that would call the backend does:
   * succeed (follow data-wave-to) or fail (follow data-wave-to-failure). Default: succeed.
   */
  outcome?: Outcome;
  /** The design system's component variants, so a chip or a card shows its selected look when chosen. */
  variants?: ComponentVariant[];
  /** The CSS those variants need (their utility classes and token variables). */
  variantCss?: string;
};

export type Outcome = "success" | "failure";

/** One variant of a catalogue component, rendered: its root element's markup and the CSS it needs. */
export type ComponentVariant = { component: string; variant: string; state: string; html: string };

/** Viewer to frame: new scenario choices or network speed, without reloading the screen. */
export type SettingsMessage = { type: "wave-proto:settings"; choices: Record<string, string>; speed: number; outcome?: Outcome };

export type Navigate = { kind: "screen"; screen: string; reveal: string | null } | { kind: "back" };

/** Frame to viewer. */
export type FrameMessage =
  | { type: "wave-proto:ready" }
  | { type: "wave-proto:navigate"; to: Navigate; state: PrototypeState }
  | { type: "wave-proto:state"; state: PrototypeState }
  | { type: "wave-proto:request"; method: string; url: string; operation: string | null; status: number; ms: number }
  | { type: "wave-proto:notice"; message: string };

const MAX_STATE = 2_000_000;

const str = (v: unknown, max = 500): string | null => (typeof v === "string" && v.length <= max ? v : null);

function readState(v: unknown): PrototypeState | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (!o.data || typeof o.data !== "object" || Array.isArray(o.data)) return null;
  const params: Record<string, string> = {};
  if (o.params && typeof o.params === "object") {
    for (const [k, val] of Object.entries(o.params as Record<string, unknown>)) {
      if (typeof val === "string" && k.length < 100 && val.length < 500) params[k] = val;
    }
  }
  try {
    const data = JSON.parse(JSON.stringify(o.data)) as Record<string, unknown>;
    if (JSON.stringify(data).length > MAX_STATE) return null;
    return { data, params };
  } catch {
    return null;
  }
}

/** A message from the frame, checked; null for anything malformed. */
export function readFrameMessage(data: unknown): FrameMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "wave-proto:ready":
      return { type: m.type };
    case "wave-proto:state": {
      const state = readState(m.state);
      return state ? { type: m.type, state } : null;
    }
    case "wave-proto:navigate": {
      const state = readState(m.state);
      const to = m.to as Record<string, unknown> | undefined;
      if (!state || !to) return null;
      if (to.kind === "back") return { type: m.type, to: { kind: "back" }, state };
      const screen = str(to.screen, 200);
      if (to.kind === "screen" && screen) return { type: m.type, to: { kind: "screen", screen, reveal: str(to.reveal, 200) }, state };
      return null;
    }
    case "wave-proto:request": {
      const method = str(m.method, 10);
      const url = str(m.url, 2000);
      if (!method || !url || typeof m.status !== "number" || typeof m.ms !== "number") return null;
      return { type: m.type, method, url, operation: str(m.operation, 200), status: m.status, ms: Math.round(m.ms) };
    }
    case "wave-proto:notice": {
      const message = str(m.message, 1000);
      return message ? { type: m.type, message } : null;
    }
    default:
      return null;
  }
}

/** Fills an OpenAPI path's {params} from the prototype's state, or the operation's examples. */
export function fillPath(path: string, params: Record<string, string>, examples: { name: string; example: string }[]): string {
  return path.replace(/\{([^}]+)\}/g, (_m, name: string) => encodeURIComponent(params[name] ?? examples.find((e) => e.name === name)?.example ?? "1"));
}

/** A screen's route with its parameters filled, for the viewer's address bar. */
export function fillRoute(route: string, params: Record<string, string>, fallback: Record<string, string> = {}): string {
  return route.replace(/:([A-Za-z_]\w*)/g, (_m, name: string) => params[name] ?? fallback[name] ?? `:${name}`);
}
