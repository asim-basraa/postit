import { parseDestination, targetScreen, type Destination } from "./destination";
import type { ScreenMeta, SpecNode } from "./parse";
import type { OffToken } from "./css";

/**
 * Views over a whole flow, derived from its screens' node indexes.
 *
 * Nothing here is stored. The data dictionary, the action catalog, the graph and
 * the completeness checks are all read out of the HTML's attributes each time,
 * so they can never say something the mockups do not.
 */

export type FlowScreen = {
  pageId: string;
  name: string;
  path: string;
  meta: ScreenMeta;
  nodes: SpecNode[];
  /** Null when the flow has no token page to compare against. */
  offToken: OffToken[] | null;
  unidentifiedInteractive?: { tag: string; text: string }[];
};

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-");
}

/** A screen's slug: its pi:screen, or its page name made into one. */
export function screenSlug(screen: Pick<FlowScreen, "meta" | "name">): string {
  return screen.meta.screen?.trim() || slugify(screen.name);
}

export type Resolved =
  | { ok: true; screen: FlowScreen; node: SpecNode | null }
  | { ok: false; reason: string }
  | { ok: true; external: true };

/** Finds what a destination points at, within the flow. */
export function resolveDestination(
  flow: FlowScreen[],
  from: FlowScreen,
  dest: Destination,
): Resolved {
  if (dest.kind === "back" || dest.kind === "url") return { ok: true, external: true };
  if (dest.kind === "invalid") return { ok: false, reason: `"${dest.raw}" is not a destination` };

  const slug = targetScreen(dest, screenSlug(from));
  const screen = flow.find((s) => screenSlug(s) === slug);
  if (!screen) return { ok: false, reason: `no screen ${slug} in this flow` };

  if (dest.kind === "screen") return { ok: true, screen, node: null };

  // node:<screen>/<parent>/<node>: the last segment is the node, and any
  // segments between must be its ancestors, in order.
  const middle = dest.path.slice(dest.screen ? 1 : 0, -1);
  const node = screen.nodes.find((n) => {
    if (n.slug !== dest.node && n.id !== dest.node) return false;
    if (middle.length === 0) return true;
    const chain = n.ancestors
      .map((id) => screen.nodes.find((a) => a.id === id))
      .map((a) => a?.slug ?? a?.id);
    let i = 0;
    for (const part of chain) if (part === middle[i]) i++;
    return i === middle.length;
  });
  if (!node) return { ok: false, reason: `no node ${dest.path.join("/")} on ${slug}` };
  return { ok: true, screen, node };
}

export type Usage = {
  pageId: string;
  screen: string;
  pid: string;
  slug: string | null;
  kind: "bind" | "repeat" | "field" | "condition";
};

export type DictionaryEntry = {
  path: string;
  type: string | null;
  source: string | null;
  description: string | null;
  usages: Usage[];
};

const RESOURCE_IN_TEXT = /[A-Za-z_][\w.-]*(?:\[\])?(?:\/[\w.-]+(?:\[\])?)+/g;

export function resourcesIn(condition: string): string[] {
  return [...new Set(condition.match(RESOURCE_IN_TEXT) ?? [])];
}

/** Every resource path used anywhere in the flow, with where. */
export function dataDictionary(flow: FlowScreen[]): DictionaryEntry[] {
  const entries = new Map<string, DictionaryEntry>();
  const docs = new Map<string, { type?: string; source?: string; description?: string }>();
  for (const s of flow) for (const [k, v] of Object.entries(s.meta.resources)) docs.set(k, { ...docs.get(k), ...v });

  const add = (path: string, usage: Usage) => {
    const key = path.trim();
    if (!key) return;
    const entry =
      entries.get(key) ??
      { path: key, type: null, source: null, description: null, usages: [] };
    entry.usages.push(usage);
    entries.set(key, entry);
  };

  for (const s of flow) {
    const screen = screenSlug(s);
    for (const n of s.nodes) {
      const base = { pageId: s.pageId, screen, pid: n.id, slug: n.slug };
      if (n.attrs.bind) add(n.attrs.bind, { ...base, kind: "bind" });
      if (n.attrs.repeat) add(n.attrs.repeat, { ...base, kind: "repeat" });
      if (n.attrs.field) add(n.attrs.field, { ...base, kind: "field" });
      if (n.attrs["visible-if"]) {
        for (const r of resourcesIn(n.attrs["visible-if"])) add(r, { ...base, kind: "condition" });
      }
    }
  }

  // Described but unused resources still belong in the dictionary.
  for (const key of docs.keys()) if (!entries.has(key)) entries.set(key, { path: key, type: null, source: null, description: null, usages: [] });

  for (const entry of entries.values()) {
    const doc = docs.get(entry.path);
    entry.type = doc?.type ?? null;
    entry.source = doc?.source ?? null;
    entry.description = doc?.description ?? null;
  }

  return [...entries.values()].sort((a, b) => a.path.localeCompare(b.path));
}

export type ActionEntry = {
  name: string;
  triggers: string[];
  effects: string[];
  to: string[];
  toFailure: string[];
  sources: { pageId: string; screen: string; pid: string; slug: string | null; text: string }[];
};

export function splitEffects(value: string | undefined): string[] {
  return (value ?? "").split(/[\s,]+/).map((e) => e.trim()).filter(Boolean);
}

/** Every named action, with what fires it and where it leads. */
export function actionCatalog(flow: FlowScreen[]): ActionEntry[] {
  const out = new Map<string, ActionEntry>();
  const push = <T>(list: T[], v: T | undefined) => {
    if (v !== undefined && v !== "" && !list.includes(v)) list.push(v);
  };
  for (const s of flow) {
    const screen = screenSlug(s);
    for (const n of s.nodes) {
      const name = n.attrs.action?.trim();
      if (!name) continue;
      const entry = out.get(name) ?? { name, triggers: [], effects: [], to: [], toFailure: [], sources: [] };
      push(entry.triggers, n.attrs.trigger || "click");
      for (const e of splitEffects(n.attrs.effect)) push(entry.effects, e);
      push(entry.to, n.attrs.to);
      push(entry.toFailure, n.attrs["to-failure"]);
      entry.sources.push({ pageId: s.pageId, screen, pid: n.id, slug: n.slug, text: n.text });
      out.set(name, entry);
    }
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export type Edge = { from: string; to: string; label: string; failure: boolean };

export type FlowGraph = {
  mermaid: string;
  edges: Edge[];
  /** Screens with no way out. */
  deadEnds: string[];
  /** Screens nothing leads to, other than the first. */
  unreachable: string[];
};

function mermaidId(slug: string) {
  return `s_${slug.replace(/[^A-Za-z0-9_]/g, "_")}`;
}

function mermaidLabel(text: string) {
  return text.replace(/["`]/g, "'").replace(/[\[\]{}()|<>]/g, " ").slice(0, 60);
}

export function flowGraph(flow: FlowScreen[]): FlowGraph {
  const slugs = flow.map(screenSlug);
  const edges: Edge[] = [];
  const seen = new Set<string>();

  for (const s of flow) {
    const from = screenSlug(s);
    for (const n of s.nodes) {
      for (const [key, failure] of [["to", false], ["to-failure", true]] as const) {
        const raw = n.attrs[key];
        if (!raw) continue;
        const dest = parseDestination(raw);
        const target = targetScreen(dest, from);
        if (!target || !slugs.includes(target)) continue;
        const label = n.attrs.action || n.slug || n.text || n.id;
        const k = `${from}>${target}>${label}>${failure}`;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push({ from, to: target, label, failure });
      }
    }
  }

  const outgoing = new Set(edges.filter((e) => e.from !== e.to).map((e) => e.from));
  const incoming = new Set(edges.filter((e) => e.from !== e.to).map((e) => e.to));
  const deadEnds = slugs.filter((s) => !outgoing.has(s));
  const unreachable = slugs.slice(1).filter((s) => !incoming.has(s));

  const lines = ["flowchart LR"];
  flow.forEach((s, i) => {
    const slug = slugs[i];
    const route = s.meta.route ? `<br/>${mermaidLabel(s.meta.route)}` : "";
    lines.push(`  ${mermaidId(slug)}["${mermaidLabel(s.meta.title || s.name)}${route}"]`);
  });
  for (const e of edges) {
    const arrow = e.failure ? "-.->" : "-->";
    lines.push(`  ${mermaidId(e.from)} ${arrow}|"${mermaidLabel(e.label)}"| ${mermaidId(e.to)}`);
  }
  lines.push("  classDef deadend stroke:#b45309,stroke-width:2px,stroke-dasharray:4 2");
  lines.push("  classDef unreachable stroke:#b91c1c,stroke-width:2px");
  if (deadEnds.length) lines.push(`  class ${deadEnds.map(mermaidId).join(",")} deadend`);
  if (unreachable.length) lines.push(`  class ${unreachable.map(mermaidId).join(",")} unreachable`);

  return { mermaid: lines.join("\n"), edges, deadEnds, unreachable };
}

export type Check = {
  /** Stable across revisions, so a waiver keeps applying. */
  key: string;
  code:
    | "no-action"
    | "unbound-dynamic"
    | "input-no-field"
    | "unresolved-destination"
    | "no-states"
    | "off-token"
    | "unidentified-control";
  pageId: string;
  screen: string;
  pid?: string;
  message: string;
};

export const CHECK_LABELS: Record<Check["code"], string> = {
  "no-action": "Control with no action",
  "unbound-dynamic": "Dynamic content with no binding",
  "input-no-field": "Input with no field",
  "unresolved-destination": "Destination that does not resolve",
  "no-states": "Interactive component with no states",
  "off-token": "Off-token style values",
  "unidentified-control": "Controls with no id",
};

/** Everything a flow still needs before a developer could build it without asking. */
export function completenessChecks(flow: FlowScreen[]): Check[] {
  const out: Check[] = [];
  for (const s of flow) {
    const screen = screenSlug(s);
    const name = (n: SpecNode) => n.slug ?? (n.text ? `"${n.text.slice(0, 40)}"` : n.id);
    for (const n of s.nodes) {
      const base = { pageId: s.pageId, screen, pid: n.id };
      // State depictions are pictures of another node, not controls of their own.
      if (n.attrs["state-of"]) continue;

      if (n.interactive && !n.attrs.action && !n.attrs.to) {
        out.push({ ...base, key: `no-action:${screen}:${n.id}`, code: "no-action", message: `${name(n)} can be pressed but has no action or destination.` });
      }
      if (n.attrs.content === "dynamic" && !n.attrs.bind) {
        out.push({ ...base, key: `unbound-dynamic:${screen}:${n.id}`, code: "unbound-dynamic", message: `${name(n)} is dynamic but says nothing about where its content comes from.` });
      }
      if (n.formControl && !n.attrs.field && n.html.type !== "submit" && n.html.type !== "button") {
        out.push({ ...base, key: `input-no-field:${screen}:${n.id}`, code: "input-no-field", message: `${name(n)} is an input with no field.` });
      }
      for (const key of ["to", "to-failure"] as const) {
        const raw = n.attrs[key];
        if (!raw) continue;
        const r = resolveDestination(flow, s, parseDestination(raw));
        if (!r.ok) {
          out.push({ ...base, key: `unresolved-destination:${screen}:${n.id}:${key}`, code: "unresolved-destination", message: `${name(n)} leads to ${raw}, but there is ${r.reason}.` });
        }
      }
      if ((n.interactive || n.formControl) && !n.attrs.states) {
        out.push({ ...base, key: `no-states:${screen}:${n.id}`, code: "no-states", message: `${name(n)} is interactive but declares no states.` });
      }
    }
    if (s.offToken && s.offToken.length > 0) {
      const sample = s.offToken.slice(0, 6).map((o) => `${o.property}: ${o.value}`).join(", ");
      out.push({
        key: `off-token:${screen}`,
        code: "off-token",
        pageId: s.pageId,
        screen,
        message: `${s.offToken.length} style value${s.offToken.length === 1 ? "" : "s"} match no token (${sample}${s.offToken.length > 6 ? ", …" : ""}).`,
      });
    }
    const unidentified = s.unidentifiedInteractive ?? [];
    if (unidentified.length > 0) {
      out.push({
        key: `unidentified-control:${screen}`,
        code: "unidentified-control",
        pageId: s.pageId,
        screen,
        message: `${unidentified.length} control${unidentified.length === 1 ? " has" : "s have"} no data-pi-id, so nothing can be specified on ${unidentified.length === 1 ? "it" : "them"} (${unidentified.slice(0, 4).map((u) => `<${u.tag}>${u.text ? ` "${u.text.slice(0, 24)}"` : ""}`).join(", ")}).`,
      });
    }
  }
  return out;
}

export type ComponentStates = {
  component: string;
  states: string[];
  nodes: { pageId: string; screen: string; pid: string; slug: string | null; depicted: string[] }[];
};

/** States declared per component, and which ones have a picture. */
export function statesByComponent(flow: FlowScreen[]): ComponentStates[] {
  const out = new Map<string, ComponentStates>();
  for (const s of flow) {
    const screen = screenSlug(s);
    for (const n of s.nodes) {
      if (!n.attrs.states) continue;
      const component = n.attrs.component || n.tag;
      const entry = out.get(component) ?? { component, states: [], nodes: [] };
      for (const st of n.attrs.states.split(/\s+/).filter(Boolean)) if (!entry.states.includes(st)) entry.states.push(st);
      const depicted = s.nodes
        .filter((d) => d.attrs["state-of"] === n.id && d.attrs.state)
        .map((d) => d.attrs.state);
      entry.nodes.push({ pageId: s.pageId, screen, pid: n.id, slug: n.slug, depicted });
      out.set(component, entry);
    }
  }
  return [...out.values()].sort((a, b) => a.component.localeCompare(b.component));
}

/** Every name used for each kind of free-text field, with how often, for autocomplete. */
export function vocabularyOf(flow: FlowScreen[]): Record<"resources" | "actions" | "effects" | "fields" | "components", { name: string; count: number }[]> {
  const bag = {
    resources: new Map<string, number>(),
    actions: new Map<string, number>(),
    effects: new Map<string, number>(),
    fields: new Map<string, number>(),
    components: new Map<string, number>(),
  };
  const inc = (m: Map<string, number>, k: string | undefined) => {
    const key = k?.trim();
    if (key) m.set(key, (m.get(key) ?? 0) + 1);
  };
  for (const s of flow) {
    for (const k of Object.keys(s.meta.resources)) inc(bag.resources, k);
    for (const n of s.nodes) {
      inc(bag.resources, n.attrs.bind);
      inc(bag.resources, n.attrs.repeat);
      for (const r of resourcesIn(n.attrs["visible-if"] ?? "")) inc(bag.resources, r);
      inc(bag.actions, n.attrs.action);
      for (const e of splitEffects(n.attrs.effect)) inc(bag.effects, e);
      inc(bag.fields, n.attrs.field);
      inc(bag.components, n.attrs.component);
    }
  }
  const list = (m: Map<string, number>) =>
    [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return {
    resources: list(bag.resources),
    actions: list(bag.actions),
    effects: list(bag.effects),
    fields: list(bag.fields),
    components: list(bag.components),
  };
}

/** Names that differ only by case or separators, which are nearly always the same thing typed twice. */
export function nearDuplicates(names: string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const n of names) {
    const k = n.toLowerCase().replace(/[-_.\s]/g, "");
    const g = groups.get(k) ?? [];
    if (!g.includes(n)) g.push(n);
    groups.set(k, g);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
