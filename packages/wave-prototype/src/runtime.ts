/**
 * The prototype runtime: added to each screen the prototype viewer frames.
 *
 * It turns a static mockup into a working screen by reading the data-wave-*
 * attributes the spec already carries:
 *
 * - An MSW mock server built from the feature's OpenAPI document answers every
 *   fetch the page makes. The frame is sandboxed with an opaque origin, where
 *   a service worker cannot register, so the handlers run in the page through
 *   MSW's getResponse instead of setupWorker. Same handlers, same matching.
 * - data-wave-bind, -repeat, -empty, -format and -visible-if fill the screen
 *   from the data the operations with x-wave-provides return.
 * - data-wave-field collects input; data-wave-validate checks it on submit and
 *   shows the error states drawn for it.
 * - data-wave-action / -effect call the operations whose x-wave-effect names
 *   the effect, showing the loading state drawn for the control, then follow
 *   data-wave-to or data-wave-to-failure.
 *
 * It talks to the viewer only by postMessage (see protocol.ts).
 */
import { getResponse, http, HttpResponse } from "msw";
import type { ApiOperation, PrototypeApi } from "./openapi";
import { fillPath, type InitMessage, type Navigate, type PrototypeState, type SettingsMessage } from "./protocol";

type Handler = Parameters<typeof getResponse>[0][number];

const w = (el: Element, name: string): string | null => el.getAttribute(`data-wave-${name}`) ?? el.getAttribute(`data-pi-${name}`);
const esc = (v: string) => (typeof CSS !== "undefined" && CSS.escape ? CSS.escape(v) : v.replace(/["\\]/g, "\\$&"));
const sel = (name: string, value?: string) =>
  value === undefined ? `[data-wave-${name}],[data-pi-${name}]` : `[data-wave-${name}="${esc(value)}"],[data-pi-${name}="${esc(value)}"]`;

const HIDDEN = "data-wave-proto";
const style = document.createElement("style");
style.textContent = `[${HIDDEN}~="hidden"]{display:none!important}html.wave-proto-pending body{opacity:0}`;
document.documentElement.classList.add("wave-proto-pending");
(document.head || document.documentElement).appendChild(style);

let api: PrototypeApi | null = null;
let state: PrototypeState = { data: {}, params: {} };
let choices: Record<string, string> = {};
let speed = 1;
let screen = "";
let handlers: Handler[] = [];
const openModals: Element[] = [];

const post = (message: unknown) => window.parent.postMessage(message, "*");
const snapshot = () => JSON.parse(JSON.stringify(state)) as PrototypeState;

let stateTimer: ReturnType<typeof setTimeout> | null = null;
function stateChanged() {
  if (stateTimer) clearTimeout(stateTimer);
  stateTimer = setTimeout(() => post({ type: "wave-proto:state", state: snapshot() }), 150);
}

function navigate(to: Navigate) {
  post({ type: "wave-proto:navigate", to, state: snapshot() });
}

function notice(message: string) {
  post({ type: "wave-proto:notice", message });
}

// The mock server -------------------------------------------------------------------

function apiBase(): string {
  const base = api?.base ?? "/api";
  if (/^https?:\/\//i.test(base)) return base.replace(/\/$/, "");
  return `${location.protocol}//${location.host}${base.startsWith("/") ? "" : "/"}${base}`.replace(/\/$/, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function responseFor(op: ApiOperation) {
  const wanted = choices[op.id];
  return op.responses.find((r) => r.name === wanted) ?? op.responses[0];
}

function buildHandlers(): Handler[] {
  if (!api) return [];
  const base = apiBase();
  return api.operations.map((op) => {
    const url = base + op.path.replace(/\{([^}]+)\}/g, ":$1");
    return http[op.method](url, async () => {
      await sleep((op.delay ?? 350) * speed);
      const r = responseFor(op);
      if (r.body === null || r.body === undefined || r.status === 204) return new HttpResponse(null, { status: r.status });
      return HttpResponse.json(r.body as Parameters<typeof HttpResponse.json>[0], { status: r.status });
    }) as Handler;
  });
}

function operationFor(method: string, url: string): ApiOperation | null {
  if (!api) return null;
  const base = apiBase();
  if (!url.startsWith(base)) return null;
  const path = url.slice(base.length).split("?")[0];
  return (
    api.operations.find((o) => o.method === method.toLowerCase() && new RegExp(`^${o.path.replace(/[.*+?^$()|[\]\\]/g, "\\$&").replace(/\\?\{[^}]+\\?\}/g, "[^/]+").replace(/\{[^}]+\}/g, "[^/]+")}$`).test(path)) ?? null
  );
}

let initialised!: () => void;
const ready = new Promise<void>((resolve) => {
  initialised = resolve;
  // Opened outside the viewer: run without a mock API rather than wait for ever.
  setTimeout(resolve, 3000);
});

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  await ready;
  const request = input instanceof Request ? new Request(input, init) : new Request(new URL(String(input), document.baseURI), init);
  const started = performance.now();
  // MSW reads document.cookie for requests that send credentials, and that
  // throws in a sandboxed frame. Mock handlers need no cookies.
  const response = await getResponse(handlers, new Request(request.clone(), { credentials: "omit" }));
  const op = operationFor(request.method, request.url);
  if (response) {
    post({ type: "wave-proto:request", method: request.method, url: request.url, operation: op?.id ?? null, status: response.status, ms: performance.now() - started });
    return response;
  }
  if (request.url.startsWith(apiBase())) {
    post({ type: "wave-proto:request", method: request.method, url: request.url, operation: null, status: 404, ms: performance.now() - started });
    return Response.json({ message: "No operation in the mock API matches this request." }, { status: 404 });
  }
  return realFetch(input, init);
};

// Data --------------------------------------------------------------------------------

const rootOf = (path: string) => path.split("/")[0].replace(/\[\]$/, "").replace(/\.length$/, "");

/** Paths a repeat's items are known by while rendering, innermost last. */
type Scope = { path: string; item: unknown }[];

function lookup(path: string, scope: Scope): { known: boolean; value: unknown } {
  const clean = path.replace(/\.length$/, "");
  for (let i = scope.length - 1; i >= 0; i--) {
    const s = scope[i];
    if (clean.startsWith(`${s.path}/`)) return { known: true, value: dig(s.item, clean.slice(s.path.length + 1)) };
  }
  const root = rootOf(clean);
  if (!(root in state.data)) return { known: false, value: undefined };
  return { known: true, value: dig(state.data, clean) };
}

function dig(from: unknown, path: string): unknown {
  let cur = from;
  for (const raw of path.split("/")) {
    const key = raw.replace(/\[\]$/, "");
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function setData(path: string, value: unknown) {
  const parts = path.split("/").map((p) => p.replace(/\[\]$/, ""));
  let cur = state.data as Record<string, unknown>;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
  stateChanged();
}

function format(value: unknown, fmt: string | null): string {
  if (value === null || value === undefined) return "";
  const lang = document.documentElement.lang || "en-GB";
  const [kind, arg = ""] = (fmt ?? "").split(":");
  try {
    if (kind === "currency" && typeof value === "number") return new Intl.NumberFormat(lang, { style: "currency", currency: arg || "GBP" }).format(value);
    if (kind === "number" && typeof value === "number") {
      const dp = Number(/^(\d+)dp$/.exec(arg)?.[1] ?? NaN);
      return new Intl.NumberFormat(lang, Number.isFinite(dp) ? { minimumFractionDigits: dp, maximumFractionDigits: dp } : {}).format(value);
    }
    if (kind === "percent" && typeof value === "number") {
      const dp = Number(/^(\d+)dp$/.exec(arg)?.[1] ?? 0);
      return new Intl.NumberFormat(lang, { style: "percent", minimumFractionDigits: dp, maximumFractionDigits: dp }).format(value);
    }
    if ((kind === "date" || kind === "time" || kind === "datetime") && (typeof value === "string" || typeof value === "number")) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) {
        if (arg === "relative") {
          const days = Math.round((d.getTime() - Date.now()) / 86_400_000);
          return new Intl.RelativeTimeFormat(lang, { numeric: "auto" }).format(days, "day");
        }
        if (arg === "weekday") return d.toLocaleDateString(lang, { weekday: "long" });
        if (kind === "time") return d.toLocaleTimeString(lang, { timeStyle: (arg as "short" | "medium") || "short" });
        if (kind === "datetime") return d.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
        return d.toLocaleDateString(lang, { dateStyle: (["short", "medium", "long", "full"].includes(arg) ? arg : "medium") as "medium" });
      }
    }
  } catch {
    // An unknown currency or locale: fall through to plain text.
  }
  if (Array.isArray(value)) return value.map((v) => format(v, null)).join(", ");
  if (typeof value === "object") return Object.values(value as Record<string, unknown>).filter((v) => v !== null && typeof v !== "object").join(", ");
  return String(value);
}

// Showing and hiding ------------------------------------------------------------------

function hide(el: Element | null) {
  if (!el) return;
  const cur = el.getAttribute(HIDDEN) ?? "";
  if (!cur.split(/\s+/).includes("hidden")) el.setAttribute(HIDDEN, `${cur} hidden`.trim());
}

function show(el: Element | null) {
  if (!el) return;
  const rest = (el.getAttribute(HIDDEN) ?? "").split(/\s+/).filter((x) => x && x !== "hidden");
  if (rest.length) el.setAttribute(HIDDEN, rest.join(" "));
  else el.removeAttribute(HIDDEN);
}

/** A node named by id or slug, on this screen. */
function nodeNamed(name: string | null): Element | null {
  if (!name) return null;
  const last = name.split("/").pop()!;
  return document.querySelector(sel("id", last)) ?? document.querySelector(sel("slug", last));
}

type Dest = { kind: "screen"; screen: string } | { kind: "node" | "modal"; screen: string | null; node: string } | { kind: "back" } | { kind: "url"; url: string } | { kind: "none" };

function parseDest(raw: string | null): Dest {
  const v = (raw ?? "").trim();
  if (!v || v === "stay" || v === "none") return { kind: "none" };
  if (v === "back") return { kind: "back" };
  const i = v.indexOf(":");
  const scheme = v.slice(0, i);
  const rest = v.slice(i + 1).trim();
  if (scheme === "screen" && rest) return { kind: "screen", screen: rest };
  if ((scheme === "node" || scheme === "modal") && rest) {
    const parts = rest.split("/").filter(Boolean);
    return { kind: scheme, screen: parts.length > 1 ? parts[0] : null, node: parts[parts.length - 1] };
  }
  if (scheme === "url" && rest) return { kind: "url", url: rest };
  if (scheme === "http" || scheme === "https") return { kind: "url", url: v };
  return { kind: "none" };
}

/** Everything a static design shows at once that a running screen shows only when asked. */
function hideUntilNeeded() {
  document.querySelectorAll(sel("state")).forEach((el) => {
    if ((w(el, "state") ?? "default") !== "default") hide(el);
  });
  const targets = new Set<Element>();
  document.querySelectorAll(`${sel("to")},${sel("to-failure")}`).forEach((el) => {
    for (const key of ["to", "to-failure"]) {
      const d = parseDest(w(el, key));
      if ((d.kind === "node" || d.kind === "modal") && (!d.screen || d.screen === screen)) {
        const t = nodeNamed(d.node);
        if (t && !t.contains(el)) targets.add(t);
      }
    }
  });
  for (const key of ["feedback", "confirm", "empty-state"]) {
    document.querySelectorAll(sel(key)).forEach((el) => {
      const t = nodeNamed(w(el, key));
      if (t && !t.contains(el)) targets.add(t);
    });
  }
  targets.forEach(hide);
}

// Conditions ------------------------------------------------------------------------------

function operand(token: string, scope: Scope): { known: boolean; value: unknown } {
  const t = token.trim();
  if (/^-?\d+(\.\d+)?$/.test(t)) return { known: true, value: Number(t) };
  if (/^(['"]).*\1$/.test(t)) return { known: true, value: t.slice(1, -1) };
  if (t === "true" || t === "false") return { known: true, value: t === "true" };
  if (t === "null") return { known: true, value: null };
  const r = lookup(t, scope);
  if (/\.length$/.test(t)) return { known: r.known, value: Array.isArray(r.value) || typeof r.value === "string" ? (r.value as unknown[]).length : 0 };
  return r;
}

/** Evaluates a visibility condition; null when it reads nothing the prototype has. */
function evaluate(expr: string, scope: Scope): boolean | null {
  const ors = expr.split(/\s*\|\|\s*|\s+or\s+/i);
  let anyKnown = false;
  let result = false;
  for (const or of ors) {
    let all = true;
    for (const raw of or.split(/\s*&&\s*|\s+and\s+/i)) {
      let term = raw.trim();
      let negate = false;
      while (term.startsWith("!")) {
        negate = !negate;
        term = term.slice(1).trim();
      }
      if (/^not\s+/i.test(term)) {
        negate = !negate;
        term = term.replace(/^not\s+/i, "");
      }
      const m = /^(.+?)\s*(==|!=|>=|<=|>|<|=)\s*(.+)$/.exec(term);
      let value: boolean;
      if (m) {
        const a = operand(m[1], scope);
        const b = operand(m[3], scope);
        anyKnown ||= a.known;
        const [x, y] = [a.value as number, b.value as number];
        value = m[2] === "==" || m[2] === "=" ? String(x) === String(y) : m[2] === "!=" ? String(x) !== String(y) : m[2] === ">" ? x > y : m[2] === "<" ? x < y : m[2] === ">=" ? x >= y : x <= y;
      } else {
        const a = operand(term, scope);
        anyKnown ||= a.known;
        value = Array.isArray(a.value) ? a.value.length > 0 : !!a.value;
      }
      if (negate) value = !value;
      all &&= value;
    }
    result ||= all;
  }
  return anyKnown ? result : null;
}

// Rendering -------------------------------------------------------------------------------

const templates = new WeakMap<Element, Element>();

function bindOne(el: Element, scope: Scope) {
  const path = w(el, "bind");
  if (!path) return;
  const { known, value } = lookup(path, scope);
  if (!known) return;
  const empty = value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length);
  if (empty) {
    const fallback = w(el, "empty");
    if (fallback === null || /^(hide|hidden|none)$/i.test(fallback)) {
      if (fallback !== null) hide(el);
      else if (!el.children.length) el.textContent = "";
      return;
    }
    show(el);
    if (!el.children.length) el.textContent = fallback;
    return;
  }
  show(el);
  if (el instanceof HTMLImageElement) {
    el.src = String(value);
    return;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    el.value = String(value);
    return;
  }
  // An element holding other bound elements keeps them: only a leaf is replaced.
  if (!el.children.length) el.textContent = format(value, w(el, "format"));
}

/** The list an element belongs to: its nearest enclosing data-wave-repeat, not counting itself. */
const ownerList = (el: Element) => el.parentElement?.closest(sel("repeat")) ?? null;

/**
 * Renders what belongs to `within` directly: its lists, and the binds and
 * conditions not inside one of those lists (each list renders its own items).
 */
function renderPart(within: ParentNode, outer: Element | null, scope: Scope) {
  const mine = (el: Element) => ownerList(el) === outer;
  within.querySelectorAll(sel("repeat")).forEach((list) => {
    if (mine(list)) renderList(list, scope);
  });
  within.querySelectorAll(sel("bind")).forEach((el) => {
    if (mine(el)) bindOne(el, scope);
  });
  within.querySelectorAll(sel("visible-if")).forEach((el) => {
    if (!mine(el)) return;
    const v = evaluate(w(el, "visible-if") ?? "", scope);
    if (v === true) show(el);
    else if (v === false) hide(el);
  });
}

function render(root: Document, scope: Scope) {
  renderPart(root, null, scope);
}

function renderList(list: Element, scope: Scope) {
  const path = (w(list, "repeat") ?? "").trim();
  if (!path) return;
  const { known, value } = lookup(path, scope);
  if (!known) return;
  const items = Array.isArray(value) ? value : [];
  let template = templates.get(list);
  if (!template) {
    const kids = [...list.children];
    const t = kids.find((k) => w(k, "item") !== null) ?? kids.find((k) => !w(k, "state")) ?? null;
    if (!t) return;
    template = t.cloneNode(true) as Element;
    templates.set(list, template);
    for (const k of kids) {
      if (k === t || (k.tagName === t.tagName && !w(k, "state"))) k.remove();
    }
  } else {
    list.querySelectorAll(":scope > [data-wave-proto~='item']").forEach((k) => k.remove());
  }
  const anchor = list.firstChild;
  for (const item of items) {
    const clone = template.cloneNode(true) as Element;
    clone.setAttribute(HIDDEN, "item");
    list.insertBefore(clone, anchor);
    const inner = [...scope, { path: path.endsWith("[]") ? path : `${path}[]`, item }];
    if (w(clone, "bind")) bindOne(clone, inner);
    renderPart(clone, list, inner);
  }
  const emptyNode = nodeNamed(w(list, "empty-state"));
  if (items.length) {
    show(list);
    hide(emptyNode);
  } else {
    if (emptyNode) hide(list);
    show(emptyNode);
  }
}

function fillFields() {
  document.querySelectorAll(sel("field")).forEach((el) => {
    const path = w(el, "field");
    if (!path) return;
    const { value } = lookup(path, []);
    if (value === undefined || value === null) return;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      el.checked = el.type === "checkbox" ? !!value : el.value === String(value);
    } else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
      el.value = String(value);
    }
  });
}

// Loading the screen's data ---------------------------------------------------------------

function screenStates(name: string): Element[] {
  return [...document.querySelectorAll(sel("state", name))].filter((el) => !w(el, "state-of"));
}

async function callOperation(op: ApiOperation, body?: unknown): Promise<{ ok: boolean; status: number; data: unknown }> {
  const url = apiBase() + fillPath(op.path, state.params, op.params);
  const res = await fetch(url, {
    method: op.method.toUpperCase(),
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = res.status === 204 ? null : await res.json();
  } catch {
    data = null;
  }
  return { ok: res.ok, status: res.status, data };
}

function store(op: ApiOperation, data: unknown) {
  if (!op.provides.length || data === null || data === undefined) return;
  if (op.provides.length === 1) state.data[op.provides[0]] = data;
  else if (typeof data === "object") for (const root of op.provides) state.data[root] = (data as Record<string, unknown>)[root];
  stateChanged();
}

async function loadScreenData() {
  if (!api) return;
  const roots = new Set<string>();
  document.querySelectorAll(`${sel("bind")},${sel("repeat")}`).forEach((el) => {
    const p = w(el, "bind") ?? w(el, "repeat");
    if (p) roots.add(rootOf(p));
  });
  document.querySelectorAll(sel("visible-if")).forEach((el) => {
    for (const m of (w(el, "visible-if") ?? "").match(/[A-Za-z_][\w-]*(?=\/|\[\])/g) ?? []) roots.add(m);
  });
  const ops = new Map<string, ApiOperation>();
  for (const root of roots) {
    const all = api.operations.filter((o) => o.provides.includes(root));
    const op = all.find((o) => o.method === "get") ?? all[0];
    if (op) ops.set(op.id, op);
  }
  if (!ops.size) return;
  const loading = screenStates("loading");
  loading.forEach(show);
  const results = await Promise.all([...ops.values()].map(async (op) => ({ op, r: await callOperation(op).catch(() => ({ ok: false, status: 0, data: null })) })));
  loading.forEach(hide);
  let failed = false;
  for (const { op, r } of results) {
    if (r.ok) store(op, r.data);
    else failed = true;
  }
  if (failed) {
    const errors = screenStates("error");
    errors.forEach(show);
    if (!errors.length) notice("The screen's data failed to load, and the screen has no error state drawn.");
  }
}

// Forms and actions -------------------------------------------------------------------------

const PATTERNS: Record<string, RegExp> = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  "uk-postcode": /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/,
  phone: /^\+?[\d\s()-]{7,}$/,
  numeric: /^\d+$/,
  number: /^-?\d+(\.\d+)?$/,
  url: /^https?:\/\/\S+$/,
};

function fieldValue(el: Element): unknown {
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox") return el.checked;
    if (el.type === "number" || el.type === "range") return el.value === "" ? null : Number(el.value);
    return el.value;
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return el.value;
  return null;
}

function checkField(el: Element): boolean {
  const rules = (w(el, "validate") ?? "").split(";").map((r) => r.trim()).filter(Boolean);
  const value = fieldValue(el);
  const text = value === null || value === undefined ? "" : String(value);
  let ok = true;
  for (const rule of rules) {
    const [name, arg = ""] = rule.split(":").map((x) => x.trim());
    if (name === "required" && (text === "" || value === false)) ok = false;
    else if (name === "pattern" && text && PATTERNS[arg] && !PATTERNS[arg].test(text)) ok = false;
    else if (name === "email" && text && !PATTERNS.email.test(text)) ok = false;
    else if (name === "max" && text && (typeof value === "number" ? value > Number(arg) : text.length > Number(arg))) ok = false;
    else if (name === "min" && text && (typeof value === "number" ? value < Number(arg) : text.length < Number(arg))) ok = false;
  }
  if (el instanceof HTMLInputElement && !el.checkValidity()) ok = false;
  const id = w(el, "id");
  const errors = id ? [...document.querySelectorAll(sel("state-of", id))].filter((e) => w(e, "state") === "error") : [];
  errors.forEach(ok ? hide : show);
  if (ok) el.removeAttribute("aria-invalid");
  else el.setAttribute("aria-invalid", "true");
  return ok;
}

function formOf(el: Element): Element | null {
  return el.closest(`form,${sel("role", "form")}`);
}

function formBody(form: Element | null): Record<string, unknown> | undefined {
  if (!form) return undefined;
  const out: Record<string, unknown> = {};
  form.querySelectorAll(sel("field")).forEach((f) => {
    const path = w(f, "field");
    if (!path) return;
    const parts = path.split("/");
    let cur = out;
    for (let i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== "object" || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = fieldValue(f);
  });
  return out;
}

function reveal(node: Element | null, modal: boolean) {
  if (!node) return;
  show(node);
  let p = node.parentElement;
  while (p) {
    if ((p.getAttribute(HIDDEN) ?? "").includes("hidden")) show(p);
    p = p.parentElement;
  }
  if (modal) openModals.push(node);
  node.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function flash(node: Element | null) {
  if (!node) return;
  reveal(node, false);
  const secs = Number(/auto:(\d+)/.exec(w(node, "dismiss") ?? "")?.[1] ?? 4);
  setTimeout(() => hide(node), secs * 1000);
}

function go(raw: string | null): boolean {
  const d = parseDest(raw);
  switch (d.kind) {
    case "none":
      return false;
    case "screen":
      navigate({ kind: "screen", screen: d.screen, reveal: null });
      return true;
    case "node":
    case "modal":
      if (d.screen && d.screen !== screen) navigate({ kind: "screen", screen: d.screen, reveal: d.node });
      else reveal(nodeNamed(d.node), d.kind === "modal");
      return true;
    case "back":
      if (openModals.length) hide(openModals.pop()!);
      else navigate({ kind: "back" });
      return true;
    case "url":
      window.open(d.url, "_blank", "noopener");
      return true;
  }
}

let busy = false;

/** An action waiting on its "are you sure" dialog. */
let pending: { el: Element; dialog: Element } | null = null;

const CANCEL_WORDS = /^(cancel|no\b|not now|keep|stay|go back|back|close|dismiss|never mind)/i;

function closeConfirm() {
  if (!pending) return;
  hide(pending.dialog);
  const i = openModals.indexOf(pending.dialog);
  if (i >= 0) openModals.splice(i, 1);
  pending = null;
}

/** A click inside an open confirmation dialog: cancel, confirm, or neither. */
function answerConfirm(target: Element): boolean {
  if (!pending || !pending.dialog.contains(target)) return false;
  const control = target.closest(`button,a,[role=button],input[type=submit],input[type=button],${ACTIONABLE}`);
  if (!control || !pending.dialog.contains(control)) return true;
  const label = (control.textContent || (control as HTMLInputElement).value || control.getAttribute("aria-label") || "").trim();
  if (w(control, "to") === "back" || w(control, "to") === "none" || CANCEL_WORDS.test(label)) {
    closeConfirm();
    return true;
  }
  const { el } = pending;
  closeConfirm();
  void run(el, true);
  return true;
}

async function run(el: Element, confirmed = false) {
  if (busy) return;
  const form = formOf(el);
  const submits = w(el, "trigger") === "submit" || (el instanceof HTMLButtonElement && el.type === "submit" && !!form);
  if (form && submits) {
    const fields = [...form.querySelectorAll(sel("field"))];
    const results = fields.map(checkField);
    const first = fields[results.indexOf(false)];
    if (first) {
      (first as HTMLElement).focus?.();
      return;
    }
  }
  // "Are you sure?" first, when the design says so and draws the dialog.
  const confirmWith = w(el, "confirm");
  if (!confirmed && confirmWith && confirmWith !== "none") {
    const dialog = nodeNamed(confirmWith);
    if (dialog) {
      pending = { el, dialog };
      reveal(dialog, true);
      const first = dialog.querySelector("button,a[href],[role=button]") as HTMLElement | null;
      first?.focus?.();
      return;
    }
    notice(`The confirmation dialog "${confirmWith}" is not on this screen, so the action runs without it.`);
  }
  const effects = (w(el, "effect") ?? "").split(/\s+/).filter(Boolean);
  const ops = api ? effects.map((e) => api!.operations.find((o) => o.effects.includes(e))).filter((o): o is ApiOperation => !!o) : [];
  let failed = false;
  if (ops.length) {
    busy = true;
    const id = w(el, "id");
    const loading = id ? [...document.querySelectorAll(sel("state-of", id))].filter((e) => w(e, "state") === "loading") : [];
    if (loading.length) {
      hide(el);
      loading.forEach(show);
    }
    try {
      for (const op of ops) {
        const r = await callOperation(op, op.method === "get" ? undefined : formBody(form) ?? {});
        if (!r.ok) {
          failed = true;
          break;
        }
        store(op, r.data);
      }
    } catch {
      failed = true;
    } finally {
      loading.forEach(hide);
      if (loading.length) show(el);
      busy = false;
    }
  }
  if (failed) {
    if (!go(w(el, "to-failure"))) notice(`${w(el, "action") ?? w(el, "slug") ?? "The action"} failed, and it has no failure destination (data-wave-to-failure).`);
    return;
  }
  render(document, []);
  flash(nodeNamed(w(el, "feedback")));
  go(w(el, "to"));
}

const ACTIONABLE = [sel("action"), sel("to"), sel("effect")].join(",");

function onClick(event: MouseEvent) {
  const target = event.target as Element | null;
  if (!target) return;
  if (pending) {
    if (answerConfirm(target)) {
      event.preventDefault();
      return;
    }
    // A click on the dialog's backdrop, or anywhere else, cancels it.
    if (target === pending.dialog || !pending.dialog.contains(target)) {
      event.preventDefault();
      closeConfirm();
      return;
    }
  }
  for (const modal of openModals) {
    if (target === modal && /backdrop/.test(w(modal, "dismiss") ?? "")) {
      hide(openModals.splice(openModals.indexOf(modal), 1)[0]);
      return;
    }
  }
  const el = target.closest(ACTIONABLE);
  const link = target.closest("a[href]") as HTMLAnchorElement | null;
  if (!el) {
    if (link) {
      const href = link.getAttribute("href") ?? "";
      event.preventDefault();
      if (/^https?:/i.test(href)) window.open(href, "_blank", "noopener");
    }
    return;
  }
  if ((el as HTMLButtonElement).disabled) return;
  event.preventDefault();
  void run(el);
}

function onSubmit(event: SubmitEvent) {
  event.preventDefault();
  const form = event.target as HTMLFormElement;
  const submitter = (event.submitter as Element | null) ?? form.querySelector(`${sel("trigger", "submit")},button[type=submit],button:not([type])`);
  if (submitter && submitter.matches(ACTIONABLE)) void run(submitter);
}

function onInput(event: Event) {
  const el = event.target as Element | null;
  const path = el ? w(el, "field") : null;
  if (!el || !path) return;
  setData(path, fieldValue(el));
  if (el.getAttribute("aria-invalid") === "true") checkField(el);
}

function onKey(event: KeyboardEvent) {
  if (event.key !== "Escape") return;
  if (pending) closeConfirm();
  else if (openModals.length) hide(openModals.pop()!);
}

// Start ---------------------------------------------------------------------------------------

function domReady(): Promise<void> {
  return document.readyState === "loading" ? new Promise((r) => document.addEventListener("DOMContentLoaded", () => r(), { once: true })) : Promise.resolve();
}

window.addEventListener("message", (event) => {
  if (event.source !== window.parent) return;
  const m = event.data as InitMessage | SettingsMessage | null;
  if (m && m.type === "wave-proto:settings") {
    choices = m.choices ?? {};
    speed = typeof m.speed === "number" ? Math.max(0, Math.min(5, m.speed)) : speed;
    return;
  }
  if (!m || m.type !== "wave-proto:init") return;
  api = m.api;
  state = m.state && typeof m.state === "object" ? { data: m.state.data ?? {}, params: m.state.params ?? {} } : { data: {}, params: {} };
  choices = m.choices ?? {};
  speed = typeof m.speed === "number" ? Math.max(0, Math.min(5, m.speed)) : 1;
  screen = m.screen ?? "";
  handlers = buildHandlers();
  // Route parameters an operation needs start from its examples.
  for (const op of api?.operations ?? []) for (const p of op.params) state.params[p.name] ??= p.example;
  initialised();
  void start(m.reveal);
});

let started = false;
async function start(revealNode: string | null) {
  if (started) return;
  started = true;
  await domReady();
  hideUntilNeeded();
  fillFields();
  render(document, []);
  document.documentElement.classList.remove("wave-proto-pending");
  document.addEventListener("click", onClick, true);
  document.addEventListener("submit", onSubmit, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("change", onInput, true);
  document.addEventListener("keydown", onKey, true);
  await loadScreenData();
  render(document, []);
  fillFields();
  if (revealNode) reveal(nodeNamed(revealNode), false);
}

// Without a viewer, still show the page.
setTimeout(() => {
  if (!started) void start(null);
}, 3000);

post({ type: "wave-proto:ready" });
