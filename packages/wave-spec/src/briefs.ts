import { parse as parseYaml } from "yaml";
import { parseDestination } from "./destination";
import { followsPathGrammar } from "./vocabulary";

/**
 * The two briefs that answer most of Wave's questions before a screen is drawn.
 *
 * DESIGN.md sits at the project root. Its front matter holds the project's
 * defaults (how copy is managed, who can see things, analytics, forms, icons,
 * responsive behaviour); its prose is the design language Claude Design
 * follows. Every element inherits these defaults unless it says otherwise.
 *
 * FEATURE.md sits in each feature folder. Its front matter lists the feature's
 * screens, the fields people fill in, the data the screens show and the
 * actions they take; its prose is the brief. Elements that write a field, show
 * data or take an action inherit what the brief says about it.
 *
 * Both are Markdown with a YAML front matter block between --- lines, so a
 * person reads them as documents and Wave reads the block.
 */

export type BriefProblem = { path: string; message: string };

// DESIGN.md --------------------------------------------------------------------------------

export type DesignDefaults = {
  name: string | null;
  lang: string | null;
  /** Widths every screen is designed for, space separated, e.g. "390 1280". */
  viewports: string | null;
  /** Who can open a screen unless its feature says otherwise: public, signed-in, role:<name>. */
  access: string | null;
  /** Who can see an element unless it says otherwise, e.g. everyone. */
  elementAccess: string;
  /** The icon set: a library name (lucide, material) or inline for drawn SVGs. */
  icons: string | null;
  /** Default copy status of fixed text: final, draft or placeholder. */
  copy: "final" | "draft" | "placeholder" | null;
  /** Where fixed copy lives: code, cms or i18n. */
  copySource: string | null;
  /** Default analytics for controls: none, or a naming convention such as object_action. */
  track: string | null;
  /** The page-view event convention, or none. */
  pageViews: string | null;
  /** Feature flags unless an element says otherwise: none. */
  flags: string | null;
  /** What sections and cards do on small screens by default: stack, hide, collapse, scroll. */
  responsive: string | null;
  validateOn: "submit" | "blur" | "change" | null;
  dirtyGuard: "on" | "off" | null;
  /** What data-driven text shows when there is no value: hide, a dash, or text. */
  empty: string | null;
  overflow: string | null;
  fit: string | null;
  externalTarget: "_blank" | "_self" | null;
  modalDismiss: string | null;
  toastDismiss: string | null;
};

export type DesignBrief = { design: DesignDefaults; prose: string; sections: string[]; problems: BriefProblem[] };

/** The sections a DESIGN.md should have, in order. Missing ones are recommended, not blocking. */
export const DESIGN_SECTIONS = [
  "Product",
  "Voice and copy",
  "Visual language",
  "Layout and breakpoints",
  "Components",
  "Interaction and states",
  "Forms",
  "Accessibility",
  "Content and data",
  "Analytics",
] as const;

export const DESIGN_PAGE = "design-md";
export const FEATURE_PAGE = "feature-md";

function splitFrontMatter(markdown: string): { data: Record<string, unknown> | null; body: string; problems: BriefProblem[] } {
  const text = markdown.replace(/^﻿/, "");
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text);
  if (!m) return { data: null, body: text, problems: [{ path: "", message: "No front matter. Start the file with a --- block of settings." }] };
  try {
    const v = parseYaml(m[1]);
    if (v && typeof v === "object" && !Array.isArray(v)) return { data: v as Record<string, unknown>, body: text.slice(m[0].length), problems: [] };
    return { data: null, body: text.slice(m[0].length), problems: [{ path: "", message: "The front matter is not a set of key: value settings." }] };
  } catch (e) {
    return { data: null, body: text.slice(m[0].length), problems: [{ path: "", message: `The front matter is not valid YAML: ${(e as Error).message.split("\n")[0]}` }] };
  }
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  if (typeof v === "boolean") return v ? "on" : "off";
  if (Array.isArray(v)) return v.map(String).join(" ");
  const s = String(v).trim();
  return s ? s : null;
};

function oneOf<T extends string>(v: unknown, allowed: readonly T[], path: string, problems: BriefProblem[]): T | null {
  const s = str(v);
  if (s === null) return null;
  if ((allowed as readonly string[]).includes(s)) return s as T;
  problems.push({ path, message: `${path} must be one of ${allowed.join(", ")}.` });
  return null;
}

function headings(body: string): string[] {
  return [...body.matchAll(/^##\s+(.+?)\s*$/gm)].map((m) => m[1]);
}

export function parseDesignMd(markdown: string): DesignBrief {
  const { data, body, problems } = splitFrontMatter(markdown);
  const d = obj(data);
  const content = obj(d.content);
  const analytics = obj(d.analytics);
  const forms = obj(d.forms);
  const dataDefaults = obj(d.data);
  const images = obj(d.images);
  const links = obj(d.links);
  const overlays = obj(d.overlays);
  const viewports = Array.isArray(d.viewports) ? d.viewports.map(String).join(" ") : str(d.viewports);
  if (viewports && !/^\d+(\s+\d+)*$/.test(viewports)) problems.push({ path: "viewports", message: "viewports lists widths in pixels, e.g. [390, 1280]." });
  const design: DesignDefaults = {
    name: str(d.name),
    lang: str(d.lang),
    viewports: viewports && /^\d+(\s+\d+)*$/.test(viewports) ? viewports : null,
    access: str(d.access),
    elementAccess: str(d["element-access"]) ?? "everyone",
    icons: str(d.icons),
    copy: oneOf(content.copy, ["final", "draft", "placeholder"] as const, "content.copy", problems),
    copySource: str(content.source),
    track: str(analytics.controls ?? analytics.track),
    pageViews: str(analytics["page-views"]),
    flags: str(d.flags),
    responsive: str(d.responsive),
    validateOn: oneOf(forms["validate-on"], ["submit", "blur", "change"] as const, "forms.validate-on", problems),
    dirtyGuard: oneOf(forms["dirty-guard"], ["on", "off"] as const, "forms.dirty-guard", problems),
    empty: str(dataDefaults.empty),
    overflow: str(dataDefaults.overflow),
    fit: str(images.fit),
    externalTarget: oneOf(links.external, ["_blank", "_self"] as const, "links.external", problems),
    modalDismiss: str(overlays.modal),
    toastDismiss: str(overlays.toast),
  };
  if (data) {
    const need: [keyof DesignDefaults, string][] = [
      ["name", "name"],
      ["lang", "lang"],
      ["viewports", "viewports"],
      ["access", "access"],
      ["copy", "content.copy"],
      ["copySource", "content.source"],
      ["track", "analytics.controls"],
      ["validateOn", "forms.validate-on"],
    ];
    for (const [k, path] of need) if (design[k] === null && !problems.some((p) => p.path === path)) problems.push({ path, message: `Set ${path}; every screen inherits it.` });
    if (design.copySource && !/^(code|cms|i18n)(:.+)?$/.test(design.copySource)) problems.push({ path: "content.source", message: "content.source is code, cms or i18n." });
  }
  const sections = headings(body);
  return { design, prose: body.trim(), sections, problems };
}

/** Sections the prose is missing, for the Wave Brief interview. */
export function missingDesignSections(brief: DesignBrief): string[] {
  const have = brief.sections.map((s) => s.toLowerCase());
  return DESIGN_SECTIONS.filter((s) => !have.some((h) => h.startsWith(s.toLowerCase().split(" ")[0])));
}

// FEATURE.md -------------------------------------------------------------------------------

export type FeatureScreen = { slug: string; title: string | null; route: string | null; access: string | null; entry: string | null; track: string | null };

export type FeatureField = {
  path: string;
  label: string | null;
  type: string | null;
  validate: string | null;
  options: string | null;
  default: string | null;
  visibleIf: string | null;
  format: string | null;
  description: string | null;
  /** The value the end-to-end tests fill in (several, for a list, separated by commas). */
  sample: string | null;
};

export type FeatureData = {
  path: string;
  type: string | null;
  source: string | null;
  description: string | null;
  empty: string | null;
  format: string | null;
  max: string | null;
  sort: string | null;
  paginate: string | null;
};

export type FeatureAction = {
  id: string;
  screen: string | null;
  /** Slugs (or ids) of the elements that take this action, when they do not carry data-wave-action. */
  on: string[];
  trigger: string | null;
  effect: string | null;
  to: string | null;
  failure: string | null;
  confirm: string | null;
  feedback: string | null;
  track: string | null;
  disabledIf: string | null;
};

export type FeatureBrief = {
  feature: string | null;
  name: string | null;
  screens: FeatureScreen[];
  fields: Map<string, FeatureField>;
  data: Map<string, FeatureData>;
  actions: FeatureAction[];
};

export type FeatureBriefResult = { feature: FeatureBrief; prose: string; problems: BriefProblem[] };

const normAction = (id: string) => id.trim().replace(/^action\//, "");

export function parseFeatureMd(markdown: string): FeatureBriefResult {
  const { data, body, problems } = splitFrontMatter(markdown);
  const d = obj(data);
  const screens: FeatureScreen[] = [];
  const rawScreens = d.screens;
  const screenEntries: [string, Record<string, unknown>][] = Array.isArray(rawScreens)
    ? rawScreens.map((s) => [String(obj(s).slug ?? ""), obj(s)])
    : Object.entries(obj(rawScreens)).map(([k, v]) => [k, obj(v)]);
  for (const [slug, s] of screenEntries) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
      problems.push({ path: `screens.${slug}`, message: `Screen slug "${slug}" must be lowercase words joined by dashes.` });
      continue;
    }
    screens.push({ slug, title: str(s.title), route: str(s.route), access: str(s.access), entry: str(s.entry), track: str(s.track) });
  }
  const fields = new Map<string, FeatureField>();
  for (const [path, raw] of Object.entries(obj(d.fields))) {
    const f = obj(raw);
    if (!followsPathGrammar(path)) problems.push({ path: `fields.${path}`, message: `${path} is not a data path such as lead/email.` });
    const options = Array.isArray(f.options) ? f.options.map(String).join(" | ") : str(f.options);
    fields.set(path, {
      path,
      label: str(f.label),
      type: str(f.type),
      validate: str(f.validate) ?? (f.required === true ? "required" : f.required === false ? "optional" : null),
      options,
      default: str(f.default),
      visibleIf: str(f["visible-if"]),
      format: str(f.format),
      description: str(f.description),
      sample: Array.isArray(f.sample) ? f.sample.map(String).join(", ") : str(f.sample),
    });
  }
  const dataMap = new Map<string, FeatureData>();
  for (const [path, raw] of Object.entries(obj(d.data))) {
    const f = obj(raw);
    if (!followsPathGrammar(path.replace(/\[\]$/, "")) ) problems.push({ path: `data.${path}`, message: `${path} is not a data path such as user/firstName or orders[].` });
    dataMap.set(path, {
      path,
      type: str(f.type),
      source: str(f.source),
      description: str(f.description),
      empty: str(f.empty),
      format: str(f.format),
      max: str(f.max),
      sort: str(f.sort),
      paginate: str(f.paginate),
    });
    if (!str(f.type) || !str(f.source)) problems.push({ path: `data.${path}`, message: `${path} needs a type and a source.` });
  }
  const actions: FeatureAction[] = [];
  for (const [id, raw] of Object.entries(obj(d.actions))) {
    const a = obj(raw);
    const on = Array.isArray(a.on) ? a.on.map(String) : str(a.on)?.split(/[\s,]+/).filter(Boolean) ?? [];
    const act: FeatureAction = {
      id: normAction(id),
      screen: str(a.screen),
      on,
      trigger: str(a.trigger),
      effect: str(a.effect),
      to: str(a.to),
      failure: str(a.failure),
      confirm: str(a.confirm),
      feedback: str(a.feedback),
      track: str(a.track),
      disabledIf: str(a["disabled-if"]),
    };
    for (const [k, v] of [["to", act.to], ["failure", act.failure]] as const) {
      if (v && !/^(stay|none)$/i.test(v) && parseDestination(v).kind === "invalid") problems.push({ path: `actions.${id}.${k}`, message: `${v} is not a destination (screen:, node:, modal:, back, url:, stay or none).` });
    }
    if (act.trigger && !["click", "submit", "change", "load"].includes(act.trigger)) problems.push({ path: `actions.${id}.trigger`, message: "trigger is click, submit, change or load." });
    if (act.screen && screens.length && !screens.some((s) => s.slug === act.screen)) problems.push({ path: `actions.${id}.screen`, message: `There is no screen ${act.screen} in screens.` });
    actions.push(act);
  }
  if (data && !screens.length) problems.push({ path: "screens", message: "List the feature's screens." });
  return {
    feature: { feature: str(d.feature), name: str(d.name), screens, fields, data: dataMap, actions },
    prose: body.trim(),
    problems,
  };
}

/** The action a brief gives an element: by its data-wave-action, else by its slug or id on the action's screen. */
export function actionFor(
  brief: FeatureBrief,
  screen: string,
  node: { id: string; slug: string | null; attrs: Record<string, string>; html?: Record<string, string> },
): FeatureAction | null {
  const named = node.attrs.action ? normAction(node.attrs.action) : null;
  if (named) return brief.actions.find((a) => a.id === named) ?? null;
  const onScreen = brief.actions.filter((a) => !a.screen || a.screen === screen);
  const byName = onScreen.find((a) => a.on.some((o) => o === node.slug || o === node.id));
  if (byName) return byName;
  // The screen's submit action belongs to its submit buttons (desktop and mobile alike).
  const submits = (node.attrs.trigger ?? "") === "submit" || (node.html?.type ?? "").toLowerCase() === "submit";
  if (submits) {
    const submit = onScreen.filter((a) => a.screen === screen && a.trigger === "submit" && !a.on.length);
    if (submit.length === 1) return submit[0];
  }
  return null;
}

/** A starting DESIGN.md for the Wave Brief skill to fill in. */
export function designMdTemplate(name: string): string {
  return `---
wave: 1
name: ${name}
lang: en
viewports: [390, 1280]
access: public            # who opens a screen by default: public, signed-in, role:<name>
element-access: everyone
icons: inline             # a library name (lucide, material) or inline
content:
  copy: final             # fixed text is final, draft or placeholder
  source: code            # code, cms or i18n
analytics:
  controls: none          # none, or a convention such as object_action
  page-views: none
flags: none
responsive: stack         # sections and cards on small screens: stack, hide, collapse, scroll
forms:
  validate-on: submit     # submit, blur or change
  dirty-guard: off
data:
  empty: hide             # what data-driven text shows with no value
  overflow: wrap
images:
  fit: cover
links:
  external: _blank
overlays:
  modal: close-button escape
  toast: auto:5
---

# ${name} design

${DESIGN_SECTIONS.map((s) => `## ${s}\n\n`).join("")}`;
}

/** A starting FEATURE.md for the Wave Feature skill to fill in. */
export function featureMdTemplate(slug: string, name: string): string {
  return `---
wave: 1
feature: ${slug}
name: ${name}
screens:
  first-screen: { title: First screen, route: /path }
fields:
  # path: { type, validate, options, default, sample, visible-if, label }
data:
  # path: { type, source, description, empty, format }
actions:
  # id: { screen, on: [slug], trigger, effect, to, failure, confirm, feedback, track }
---

# ${name}

## Goal

## Flow

## Rules

## Outcomes
`;
}
