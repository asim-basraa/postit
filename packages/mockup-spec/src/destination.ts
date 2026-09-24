/**
 * Where an action leads.
 *
 *   screen:<screen-slug>
 *   node:<screen-slug>/<node-slug>      (or node:<screen>/<parent>/<node>, or node:<node> on the same screen)
 *   modal:<screen-slug>/<node-slug>     (a node shown over the current screen)
 *   back
 *   url:<https://...>
 */
export type Destination =
  | { kind: "screen"; screen: string }
  | { kind: "node"; screen: string | null; node: string; path: string[] }
  | { kind: "modal"; screen: string | null; node: string; path: string[] }
  | { kind: "back" }
  | { kind: "url"; url: string }
  | { kind: "invalid"; raw: string };

export function parseDestination(raw: string): Destination {
  const value = raw.trim();
  if (value === "back") return { kind: "back" };

  const colon = value.indexOf(":");
  if (colon < 1) return { kind: "invalid", raw };

  const scheme = value.slice(0, colon);
  const rest = value.slice(colon + 1).trim();
  if (!rest) return { kind: "invalid", raw };

  if (scheme === "screen") {
    return rest.includes("/") ? { kind: "invalid", raw } : { kind: "screen", screen: rest };
  }

  if (scheme === "node" || scheme === "modal") {
    const parts = rest.split("/").filter(Boolean);
    if (parts.length === 0) return { kind: "invalid", raw };
    const node = parts[parts.length - 1];
    const screen = parts.length > 1 ? parts[0] : null;
    return { kind: scheme, screen, node, path: parts };
  }

  if (scheme === "url") return { kind: "url", url: rest };

  // A bare URL is what people type. Accept it rather than reporting it.
  if (scheme === "http" || scheme === "https") return { kind: "url", url: value };

  return { kind: "invalid", raw };
}

export function formatDestination(dest: Destination): string {
  switch (dest.kind) {
    case "screen":
      return `screen:${dest.screen}`;
    case "node":
    case "modal":
      return `${dest.kind}:${dest.path.join("/")}`;
    case "back":
      return "back";
    case "url":
      return `url:${dest.url}`;
    case "invalid":
      return dest.raw;
  }
}

/** The screen a destination lands on, given the screen it is fired from. */
export function targetScreen(dest: Destination, from: string | null): string | null {
  if (dest.kind === "screen") return dest.screen;
  if (dest.kind === "node" || dest.kind === "modal") return dest.screen ?? from;
  return null;
}
