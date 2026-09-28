/** Version of the message protocol; sent with every command. */
export const PROTOCOL_VERSION = 1;

/**
 * Talking to the inspector inside the framed mockup.
 *
 * The frame is an opaque origin, so its messages arrive from "null" and cannot
 * be told apart from anything the mockup's own scripts send. Every message is
 * therefore treated as untrusted input: checked for shape, never rendered as
 * markup, and only ever able to do what a click in the page could do anyway
 * (select something, show something, open another screen of the same flow).
 */

export type Box = { margin: number[]; border: number[]; padding: number[]; content: number[] };

export type StyleEntry = {
  prop: string;
  value: string;
  written: string | null;
  vars: string[];
  isDefault: boolean;
};

export type Styles = {
  groups: Record<string, StyleEntry[]>;
  box: Box;
  unreadableSheets: number;
  rootVars: Record<string, string>;
};

export type ElementRef = {
  selector: string;
  fingerprint: { tag: string; classes: string; text: string; ancestor: string | null };
};

export type FrameMessage =
  | { type: "wave:hello" }
  | { type: "wave:hover"; id: string | null; label: string | null }
  | { type: "wave:select"; id: string | null; element?: ElementRef; ancestors?: string[]; fromUser?: boolean }
  | { type: "wave:range"; pid: string; start: number; end: number; quote: string; ancestors?: string[] }
  | { type: "wave:region"; rect: { x: number; y: number; w: number; h: number }; viewport: number; covered: string[] }
  | { type: "wave:styles"; id: string | null; styles: Styles }
  | { type: "wave:pin-click"; commentId: string }
  | { type: "wave:unresolved"; commentIds: string[] }
  | { type: "wave:navigate"; to: string; from: string | null }
  | { type: "wave:key"; key: string }
  | { type: "wave:scroll"; x: number; y: number }
  | { type: "wave:state-previewed"; id: string | null; state: string | null };

const str = (v: unknown, max = 2000) => (typeof v === "string" && v.length <= max ? v : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strs = (v: unknown, max = 200) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length < 200).slice(0, max) : [];

function readElement(v: unknown): ElementRef | undefined {
  if (!v || typeof v !== "object") return undefined;
  const e = v as Record<string, unknown>;
  const f = (e.fingerprint ?? {}) as Record<string, unknown>;
  const selector = str(e.selector);
  const tag = str(f.tag, 40);
  if (!selector || !tag) return undefined;
  return {
    selector,
    fingerprint: { tag, classes: str(f.classes, 300) ?? "", text: str(f.text, 300) ?? "", ancestor: str(f.ancestor, 100) },
  };
}

/** Validates one message from the frame, or returns null. */
export function readMessage(data: unknown): FrameMessage | null {
  if (!data || typeof data !== "object") return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "wave:hello":
      return { type: "wave:hello" };
    case "wave:hover":
      return { type: "wave:hover", id: str(m.id, 100), label: str(m.label, 300) };
    case "wave:select":
      return { type: "wave:select", id: str(m.id, 100), element: readElement(m.element), ancestors: strs(m.ancestors), fromUser: m.fromUser === true };
    case "wave:range": {
      const pid = str(m.pid, 100);
      const start = num(m.start);
      const end = num(m.end);
      const quote = str(m.quote, 1000);
      return pid && start !== null && end !== null && quote !== null
        ? { type: "wave:range", pid, start, end, quote, ancestors: strs(m.ancestors) }
        : null;
    }
    case "wave:region": {
      const r = (m.rect ?? {}) as Record<string, unknown>;
      const rect = { x: num(r.x), y: num(r.y), w: num(r.w), h: num(r.h) };
      const viewport = num(m.viewport);
      if (Object.values(rect).some((x) => x === null) || viewport === null) return null;
      return { type: "wave:region", rect: rect as { x: number; y: number; w: number; h: number }, viewport, covered: strs(m.covered, 50) };
    }
    case "wave:styles": {
      const s = m.styles as Styles | undefined;
      if (!s || typeof s !== "object" || typeof s.groups !== "object" || !s.box) return null;
      return { type: "wave:styles", id: str(m.id, 100), styles: s };
    }
    case "wave:pin-click": {
      const id = str(m.commentId, 100);
      return id ? { type: "wave:pin-click", commentId: id } : null;
    }
    case "wave:unresolved":
      return { type: "wave:unresolved", commentIds: strs(m.commentIds, 500) };
    case "wave:navigate": {
      const to = str(m.to, 500);
      return to ? { type: "wave:navigate", to, from: str(m.from, 100) } : null;
    }
    case "wave:key": {
      const key = str(m.key, 40);
      return key ? { type: "wave:key", key } : null;
    }
    case "wave:scroll":
      return { type: "wave:scroll", x: num(m.x) ?? 0, y: num(m.y) ?? 0 };
    case "wave:state-previewed":
      return { type: "wave:state-previewed", id: str(m.id, 100), state: str(m.state, 100) };
    default:
      return null;
  }
}

