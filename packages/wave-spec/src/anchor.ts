/**
 * Where on a screen a comment points. Null for a comment about the screen as a
 * whole. Stored by the host with its comment; Wave reads and writes the shape.
 */
export type CommentAnchor =
  | { kind: "node"; pid: string; slug?: string | null; text?: string }
  | { kind: "range"; pid: string; start: number; end: number; quote: string; slug?: string | null }
  | { kind: "region"; rect: { x: number; y: number; w: number; h: number }; viewport: number; covered?: string[] }
  | { kind: "element"; selector: string; fingerprint: { tag: string; classes: string; text: string; ancestor: string | null } };

export type CommentStatus = "open" | "addressed" | "resolved" | "wont_fix";

export const STATUS_LABELS: Record<CommentStatus, string> = {
  open: "Open",
  addressed: "Addressed",
  resolved: "Resolved",
  wont_fix: "Won't fix",
};

/** A short description of where a comment points, for lists and handovers. */
export function describeAnchor(anchor: CommentAnchor | null | undefined): string {
  if (!anchor) return "the page";
  switch (anchor.kind) {
    case "node":
      return anchor.slug ?? anchor.pid;
    case "range":
      return `"${anchor.quote}" in ${anchor.slug ?? anchor.pid}`;
    case "region":
      return `an area (${Math.round(anchor.rect.w)}x${Math.round(anchor.rect.h)} at ${Math.round(anchor.rect.x)},${Math.round(anchor.rect.y)})`;
    case "element":
      return `<${anchor.fingerprint.tag}>${anchor.fingerprint.text ? ` "${anchor.fingerprint.text.slice(0, 30)}"` : ""}`;
  }
}
