import type { DomElement as Element } from "@wave/spec";
import { attrOf, parseDocument, parseMockup, textContent, walk, type ResourceDoc } from "@wave/spec";
import { providerOf, type ApiProblem, type PrototypeApi } from "./openapi";

/**
 * What the screens of a feature read, write and do, from their data-wave-*
 * attributes, and a first mock API made from it: an OpenAPI document whose
 * examples are the samples the designer drew, so the prototype shows exactly
 * the design until someone gives it better data.
 */

export type DataRead = { path: string; pid: string; kind: "bind" | "repeat" | "condition"; sample: string | null; format: string | null };
export type DataWrite = { path: string; pid: string; form: string | null; sample: string | null; validate: string | null };
export type DataAction = {
  pid: string;
  label: string;
  action: string | null;
  effects: string[];
  to: string | null;
  failure: string | null;
  form: string | null;
};

export type ScreenData = {
  slug: string;
  title: string;
  route: string | null;
  reads: DataRead[];
  writes: DataWrite[];
  actions: DataAction[];
  resources: Record<string, ResourceDoc>;
  /** Example values per data path, including lists drawn as repeated items. */
  samples: Record<string, unknown>;
};

export type ScreenInput = { slug?: string; name: string; html: string };

const PATH_TOKEN = /[A-Za-z_][\w-]*(?:\[\])?(?:\/[A-Za-z_][\w-]*(?:\[\])?)+|[A-Za-z_][\w-]*\[\](?:\.length)?/g;

/** The data root of a path: user/savedAddresses[]/line1 is "user", orders[] is "orders". */
export const rootOf = (path: string) => path.split("/")[0].replace(/\[\]$/, "").replace(/\.length$/, "");

/** Paths a visibility condition reads. */
export function conditionPaths(expr: string): string[] {
  return [...new Set((expr.match(PATH_TOKEN) ?? []).map((p) => p.replace(/\.length$/, "")))];
}

const wave = (el: Element, name: string) => attrOf(el, `data-wave-${name}`) ?? attrOf(el, `data-pi-${name}`);

function elementChildren(el: Element): Element[] {
  return (el.childNodes ?? []).filter((c): c is Element => "tagName" in c);
}

/** The route from an ancestor down to a descendant, as child indexes. */
function indexPath(from: Element, to: Element): number[] | null {
  const path: number[] = [];
  let cur: Element | null = to;
  while (cur && cur !== from) {
    const parent = cur.parentNode as Element | null;
    if (!parent || !("tagName" in parent)) return null;
    path.unshift(elementChildren(parent).indexOf(cur));
    cur = parent;
  }
  return cur === from ? path : null;
}

function follow(from: Element, path: number[]): Element | null {
  let cur: Element | null = from;
  for (const i of path) {
    cur = cur ? elementChildren(cur)[i] ?? null : null;
  }
  return cur;
}

const clean = (s: string) => s.replace(/\s+/g, " ").trim();

/** A sample written as text, turned into the value the data would really hold. */
export function typedSample(text: string | null, format: string | null, type: string | undefined): unknown {
  if (text === null) return null;
  const t = (type ?? "").toLowerCase();
  const f = (format ?? "").toLowerCase();
  if (/^(money|number|int|integer|float|decimal|currency)/.test(t) || /^(currency|number|percent)/.test(f)) {
    const n = Number(text.replace(/[^0-9.-]/g, ""));
    if (text.replace(/[^0-9]/g, "") && Number.isFinite(n)) return f.startsWith("percent") && /%/.test(text) ? n / 100 : n;
  }
  if (/^bool/.test(t)) return /^(true|yes|on|1)$/i.test(text.trim());
  if (/^(date|datetime|timestamp)/.test(t) || /^(date|time)/.test(f)) {
    const d = new Date(text);
    if (!Number.isNaN(d.getTime()) && /\d/.test(text)) return d.toISOString();
    const soon = new Date(Date.UTC(2026, 0, 16, 9, 0, 0));
    return soon.toISOString();
  }
  return text;
}

/** Sets a/b/c in a nested object. Array segments ("items[]") are left to the caller. */
function setPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parts = path.split("/").map((p) => p.replace(/\[\]$/, ""));
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const next = cur[parts[i]];
    if (typeof next !== "object" || next === null || Array.isArray(next)) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  const last = parts[parts.length - 1];
  if (!(last in cur) || cur[last] === null || typeof cur[last] !== "object") cur[last] = value;
}

/** Reads what one screen needs and does, and the example data its design shows. */
export function screenData(input: ScreenInput): ScreenData {
  const parsed = parseMockup(input.html);
  const slug = input.slug || parsed.screen.screen?.trim() || input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const resources = parsed.screen.resources ?? {};
  const doc = parseDocument(input.html);
  const byPid = new Map<string, Element>();
  for (const el of walk(doc)) {
    const id = wave(el, "id");
    if (id) byPid.set(id, el);
  }
  const nodeById = new Map(parsed.nodes.map((n) => [n.id, n]));
  const formOf = (pid: string): string | null => {
    const n = nodeById.get(pid);
    if (!n) return null;
    for (const a of [...n.ancestors].reverse()) {
      const an = nodeById.get(a);
      if (an && (an.tag === "form" || an.attrs.role === "form")) return a;
    }
    return null;
  };

  const reads: DataRead[] = [];
  const writes: DataWrite[] = [];
  const actions: DataAction[] = [];
  const samples: Record<string, unknown> = {};
  const repeats: { path: string; el: Element }[] = [];

  for (const n of parsed.nodes) {
    const a = n.attrs;
    if (a.repeat) {
      reads.push({ path: a.repeat.trim(), pid: n.id, kind: "repeat", sample: null, format: null });
      const el = byPid.get(n.id);
      if (el) repeats.push({ path: a.repeat.trim(), el });
    }
    if (a.bind) {
      const el = byPid.get(n.id);
      const sample = a.sample ?? (el ? (el.tagName === "img" ? attrOf(el, "src") : clean(textContent(el))) : n.text) ?? null;
      reads.push({ path: a.bind.trim(), pid: n.id, kind: "bind", sample, format: a.format ?? null });
    }
    if (a["visible-if"]) {
      for (const p of conditionPaths(a["visible-if"])) reads.push({ path: p, pid: n.id, kind: "condition", sample: null, format: null });
    }
    if (a.field) {
      const el = byPid.get(n.id);
      writes.push({
        path: a.field.trim(),
        pid: n.id,
        form: formOf(n.id),
        sample: a.sample ?? (el ? attrOf(el, "value") ?? attrOf(el, "placeholder") : null),
        validate: a.validate ?? null,
      });
    }
    if (a.action || a.effect || a.to || a["to-failure"]) {
      const effects = (a.effect ?? "").split(/\s+/).filter((e) => e && e !== "none");
      actions.push({
        pid: n.id,
        label: n.slug || n.text || n.id,
        action: a.action ?? null,
        effects,
        to: a.to ?? null,
        failure: a["to-failure"] ?? null,
        form: formOf(n.id),
      });
    }
  }

  // Scalars, where they are not inside a list.
  const inRepeat = (path: string) => repeats.some((r) => path.startsWith(`${r.path}/`));
  for (const r of reads) {
    if (r.kind !== "bind" || inRepeat(r.path) || r.path.includes("[]")) continue;
    setPath(samples, r.path, typedSample(r.sample, r.format, resources[r.path]?.type));
  }
  for (const r of reads) {
    if (r.kind === "condition" && !r.path.includes("[]")) setPath(samples, r.path, false);
  }

  // Lists: the item template and every sample item drawn beside it.
  for (const { path, el } of repeats) {
    const kids = elementChildren(el);
    const template = kids.find((k) => wave(k, "item") !== null) ?? kids[0];
    if (!template) continue;
    const items = kids.filter((k) => k === template || (k.tagName === template.tagName && wave(k, "item") === null && !wave(k, "state")));
    const binds: { rel: string; route: number[]; format: string | null; sample: string | null; type?: string }[] = [];
    for (const d of walk(template as unknown as Parameters<typeof walk>[0])) {
      const b = wave(d, "bind");
      if (!b || !b.startsWith(`${path}/`)) continue;
      const route = indexPath(template, d);
      if (route) binds.push({ rel: b.slice(path.length + 1), route, format: wave(d, "format"), sample: wave(d, "sample"), type: resources[b]?.type });
    }
    const templateBind = wave(template, "bind");
    const list = items.map((item, i) => {
      if (!binds.length && templateBind === null) return clean(textContent(item));
      const obj: Record<string, unknown> = {};
      for (const b of binds) {
        const target = follow(item, b.route);
        const text = i === 0 && b.sample ? b.sample : target ? clean(target.tagName === "img" ? attrOf(target, "src") ?? "" : textContent(target)) : null;
        setPath(obj, b.rel, typedSample(text, b.format, b.type));
      }
      return obj;
    });
    // A nested list lives inside its parent's item; the parent writes it.
    if (/\[\]\//.test(path.replace(/\[\]$/, ""))) continue;
    const container = path.replace(/\[\]$/, "");
    const parts = container.split("/");
    let cur = samples as Record<string, unknown>;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = list;
  }

  return {
    slug,
    title: parsed.screen.title || parsed.screen.documentTitle || input.name,
    route: parsed.screen.route,
    reads,
    writes,
    actions,
    resources,
    samples,
  };
}

// The draft API ------------------------------------------------------------------

const camel = (s: string) => s.replace(/[^a-zA-Z0-9]+(.)?/g, (_m, c: string | undefined) => (c ? c.toUpperCase() : "")).replace(/^./, (c) => c.toLowerCase());
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A JSON schema describing an example value. */
export function schemaOf(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (Array.isArray(value)) return { type: "array", items: value.length ? schemaOf(value[0]) : {} };
  if (typeof value === "object") {
    const properties: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) properties[k] = schemaOf(v);
    return { type: "object", properties };
  }
  if (typeof value === "number") return { type: "number" };
  if (typeof value === "boolean") return { type: "boolean" };
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return { type: "string", format: "date-time" };
  return { type: "string" };
}

function merge(into: Record<string, unknown>, from: Record<string, unknown>) {
  for (const [k, v] of Object.entries(from)) {
    const cur = into[k];
    if (cur && typeof cur === "object" && !Array.isArray(cur) && v && typeof v === "object" && !Array.isArray(v)) {
      merge(cur as Record<string, unknown>, v as Record<string, unknown>);
    } else if (cur === undefined || cur === null || cur === false) {
      into[k] = v;
    }
  }
}

function nestFields(writes: DataWrite[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const w of writes) setPath(out, w.path, w.sample ?? "");
  return out;
}

export type GeneratedApi = {
  /** The OpenAPI 3.1 document, with examples. */
  openapi: Record<string, unknown>;
  screens: ScreenData[];
};

/**
 * A first mock API for a feature: one GET per data root the screens read,
 * returning what the design shows; one POST per api/... effect an action
 * names, with a success response and the failures its to-failure leads to.
 */
export function generateApi(featureName: string, inputs: ScreenInput[]): GeneratedApi {
  const screens = inputs.map(screenData);
  const readRoots = new Map<string, { screens: Set<string>; example: Record<string, unknown>; routes: Set<string> }>();
  for (const s of screens) {
    for (const r of s.reads) {
      const root = rootOf(r.path);
      const entry = readRoots.get(root) ?? { screens: new Set(), example: {}, routes: new Set() };
      entry.screens.add(s.slug);
      if (s.route) entry.routes.add(s.route);
      readRoots.set(root, entry);
    }
    for (const [root, value] of Object.entries(s.samples)) {
      const entry = readRoots.get(root);
      if (entry && value && typeof value === "object") merge(entry.example, value as Record<string, unknown>);
      else if (entry && value !== undefined) entry.example = value as Record<string, unknown>;
    }
  }

  const paths: Record<string, Record<string, unknown>> = {};
  const errorBody = (message: string) => ({ message });
  const errorSchema = { type: "object", properties: { message: { type: "string" } } };

  for (const [root, info] of readRoots) {
    // A route with :orderId next to the root "order" says the resource is one of many.
    const idParam = [...info.routes].flatMap((r) => r.match(/:([A-Za-z]\w*)/g) ?? []).map((p) => p.slice(1)).find((p) => p.toLowerCase() === `${root.toLowerCase()}id`);
    const path = idParam ? `/${root}s/{${idParam}}` : `/${root}`;
    const body = Array.isArray(info.example) ? info.example : info.example;
    paths[path] = {
      ...(paths[path] ?? {}),
      get: {
        operationId: `get${cap(camel(root))}`,
        summary: `The ${root} data the screens show`,
        "x-wave-provides": root,
        "x-wave-screens": [...info.screens],
        ...(idParam ? { parameters: [{ name: idParam, in: "path", required: true, schema: { type: "string" }, example: "1001" }] } : {}),
        responses: {
          "200": { description: "OK", content: { "application/json": { schema: schemaOf(body), example: body } } },
          "500": {
            description: "The data could not be loaded",
            content: { "application/json": { schema: errorSchema, example: errorBody(`We could not load this. Try again in a moment.`) } },
          },
        },
      },
    };
  }

  const effects = new Map<string, { screens: Set<string>; request: Record<string, unknown>; hasFailure: boolean; labels: Set<string> }>();
  for (const s of screens) {
    for (const a of s.actions) {
      for (const e of a.effects.filter((x) => x.startsWith("api/"))) {
        const entry = effects.get(e) ?? { screens: new Set(), request: {}, hasFailure: false, labels: new Set() };
        entry.screens.add(s.slug);
        entry.labels.add(a.label);
        if (a.failure && a.failure !== "none") entry.hasFailure = true;
        if (a.form) merge(entry.request, nestFields(s.writes.filter((w) => w.form === a.form)));
        effects.set(e, entry);
      }
    }
  }
  for (const [effect, info] of effects) {
    const path = `/${effect.slice(4)}`;
    const hasBody = Object.keys(info.request).length > 0;
    paths[path] = {
      ...(paths[path] ?? {}),
      post: {
        operationId: camel(effect.slice(4)),
        summary: `${[...info.labels].join(", ")}`,
        "x-wave-effect": effect,
        "x-wave-screens": [...info.screens],
        ...(hasBody ? { requestBody: { content: { "application/json": { schema: schemaOf(info.request), example: info.request } } } } : {}),
        responses: {
          "200": { description: "Done", content: { "application/json": { schema: { type: "object" }, example: { ok: true } } } },
          ...(hasBody
            ? {
                "422": {
                  description: "The request was refused",
                  content: { "application/json": { schema: errorSchema, example: errorBody("Check the highlighted fields and try again.") } },
                },
              }
            : {}),
          "500": {
            description: info.hasFailure ? "It failed; the screen shows its failure state" : "It failed",
            content: { "application/json": { schema: errorSchema, example: errorBody("That did not work. Nothing was changed. Try again in a moment.") } },
          },
        },
      },
    };
  }

  return {
    openapi: {
      openapi: "3.1.0",
      info: {
        title: `${featureName} (mock API)`,
        version: "0.1.0",
        description:
          "Made by Wave from the screens' data-wave-* attributes. Examples are the values the design shows. x-wave-provides names the data root an operation returns; x-wave-effect names the action effect that calls it.",
      },
      servers: [{ url: "/api" }],
      paths,
    },
    screens,
  };
}

// Coverage and the requirements page ---------------------------------------------

const get = (obj: unknown, path: string[]): unknown => {
  let cur = obj;
  for (const p of path) {
    if (Array.isArray(cur)) cur = cur[0];
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
};

/** What the prototype cannot serve, screen by screen: the gaps to fill in the API. */
export function checkCoverage(api: PrototypeApi, screens: ScreenData[]): ApiProblem[] {
  const problems: ApiProblem[] = [];
  const missingRoots = new Map<string, Set<string>>();
  const missingFields = new Map<string, Set<string>>();
  for (const s of screens) {
    for (const r of s.reads) {
      const root = rootOf(r.path);
      const op = providerOf(api, root);
      if (!op) {
        const set = missingRoots.get(root) ?? new Set();
        set.add(`${s.slug}: ${r.path}`);
        missingRoots.set(root, set);
        continue;
      }
      if (r.kind === "condition") continue;
      const ok = op.responses.find((x) => x.status < 300);
      const rest = r.path.split("/").slice(1).map((p) => p.replace(/\[\]$/, ""));
      if (ok && rest.length && get(ok.body, rest) === undefined) {
        const set = missingFields.get(op.id) ?? new Set();
        set.add(r.path);
        missingFields.set(op.id, set);
      }
    }
    for (const a of s.actions) {
      for (const e of a.effects.filter((x) => x.startsWith("api/"))) {
        if (!api.operations.some((o) => o.effects.includes(e))) {
          problems.push({ level: "warning", message: `${s.slug}: ${a.label} calls ${e}, which no operation handles (x-wave-effect). The prototype treats it as done.` });
        }
      }
    }
  }
  for (const [root, where] of missingRoots) {
    const list = [...where];
    problems.push({
      level: "warning",
      message: `No operation provides "${root}" (x-wave-provides: ${root}), read at ${list.slice(0, 3).join("; ")}${list.length > 3 ? ` and ${list.length - 3} more` : ""}. The prototype shows the design's sample text there.`,
    });
  }
  for (const [id, fields] of missingFields) {
    problems.push({ level: "warning", message: `${id}'s example has no value for ${[...fields].join(", ")}.` });
  }
  return problems;
}

const cell = (v: unknown) =>
  String(v ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ")
    .slice(0, 160) || " ";

const shortJson = (v: unknown) => {
  if (v === undefined) return "";
  const s = JSON.stringify(v);
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
};

/** The data requirements page: what each screen reads, sends and calls, and what serves it. */
export function renderRequirements(featureName: string, screens: ScreenData[], api: PrototypeApi | null, problems: ApiProblem[]): string {
  const lines: string[] = [];
  lines.push(`# Data requirements: ${featureName}`, "");
  lines.push(
    "Made by Wave from the screens and the feature's mock API. It lists every piece of data each screen shows, every field it sends, and every action that calls the API, with the operation that serves it in the prototype.",
    "",
  );
  if (problems.length) {
    lines.push("## Gaps", "");
    for (const p of problems) lines.push(`- ${p.level === "error" ? "**Error:** " : ""}${p.message}`);
    lines.push("");
  }
  const byEffect = (e: string) => api?.operations.find((o) => o.effects.includes(e));
  for (const s of screens) {
    lines.push(`## ${s.title} (${s.slug})`, "");
    if (s.route) lines.push(`Route: \`${s.route}\``, "");
    const reads = s.reads.filter((r, i, all) => all.findIndex((x) => x.path === r.path) === i);
    if (reads.length) {
      lines.push("### Shows", "", "| Data | Type | Source | Meaning | Example | Served by |", "| --- | --- | --- | --- | --- | --- |");
      for (const r of reads) {
        const doc = s.resources[r.path] ?? s.resources[r.path.replace(/\[\]$/, "")] ?? {};
        const op = api ? providerOf(api, rootOf(r.path)) : null;
        lines.push(
          `| \`${cell(r.path)}\` | ${cell(doc.type ?? (r.kind === "repeat" ? "list" : r.kind === "condition" ? "condition" : ""))} | ${cell(doc.source)} | ${cell(doc.description)} | ${cell(r.sample ?? "")} | ${op ? `\`${op.method.toUpperCase()} ${op.path}\`` : "**none**"} |`,
        );
      }
      lines.push("");
    }
    if (s.writes.length) {
      lines.push("### Collects", "", "| Field | Rules | Example | Sent by |", "| --- | --- | --- | --- |");
      for (const w of s.writes) {
        const sender = s.actions.find((a) => a.form && a.form === w.form && a.effects.some((e) => e.startsWith("api/")));
        const op = sender ? sender.effects.map(byEffect).find(Boolean) : null;
        lines.push(`| \`${cell(w.path)}\` | ${cell(w.validate)} | ${cell(w.sample)} | ${op ? `\`${op.method.toUpperCase()} ${op.path}\`` : sender ? cell(sender.label) : "not sent"} |`);
      }
      lines.push("");
    }
    const calls = s.actions.filter((a) => a.effects.length || a.to);
    if (calls.length) {
      lines.push("### Actions", "", "| Action | Calls | On success | On failure |", "| --- | --- | --- | --- |");
      for (const a of calls) {
        const ops = a.effects.map((e) => {
          const op = e.startsWith("api/") ? byEffect(e) : null;
          return op ? `\`${op.method.toUpperCase()} ${op.path}\`` : e;
        });
        lines.push(`| ${cell(a.action ?? a.label)} | ${ops.length ? ops.join(", ") : "nothing"} | ${cell(a.to ?? "stay")} | ${cell(a.failure ?? "")} |`);
      }
      lines.push("");
    }
  }
  if (api && api.operations.length) {
    lines.push("## Mock API", "", `Base: \`${api.base || "/"}\``, "", "| Operation | Request | Provides or effect | Responses |", "| --- | --- | --- | --- |");
    for (const o of api.operations) {
      lines.push(
        `| ${cell(o.id)} | \`${o.method.toUpperCase()} ${o.path}\` | ${cell([...o.provides.map((p) => `provides ${p}`), ...o.effects].join(", "))} | ${cell(o.responses.map((r) => r.name).join(", "))} |`,
      );
    }
    lines.push("");
    lines.push("### Example responses", "");
    for (const o of api.operations) {
      const ok = o.responses.find((r) => r.status < 300);
      if (ok && ok.body !== null) lines.push(`- **${o.id}**: \`${shortJson(ok.body)}\``);
    }
    lines.push("");
  }
  return lines.join("\n");
}
