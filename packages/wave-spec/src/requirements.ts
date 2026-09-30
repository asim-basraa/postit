import { detectType, isElementType, looksLikePlaceholderCopy, valueShape, BEHAVIOURS, ELEMENT_TYPES as ELEMENT_TYPES_META, type Detected, type ElementType } from "./elements";
import { parseDestination } from "./destination";
import { slugify, splitEffects } from "./flow";
import type { ParsedMockup, SpecNode } from "./parse";
import type { TokenSet } from "./tokens";
import { styleIssues } from "./styles";
import { assetIssues } from "./assets";
import { matchInstances, parseSpecimen, type Catalogue, type ComponentDefinition } from "./catalogue";
import { actionFor, type DesignDefaults, type FeatureAction, type FeatureBrief, type FeatureData, type FeatureField } from "./briefs";

/**
 * What every element must say, and whether it says it.
 *
 * One table drives everything: the Claude Design interview, the dry run's
 * question sheet, the red and amber marks in the inspector, preflight and the
 * flow's approval. A field is answered by an attribute in the HTML (the HTML is
 * the spec), by a native attribute that already says it (alt, type, min), or,
 * for checks, by something existing (a label, an error state drawn). Anything
 * Wave can work out on its own is offered as a proposal the designer confirms.
 */

export type Level = "mandatory" | "recommended";
export type Owner = "design" | "product";
export type Tab = "identity" | "styles" | "content" | "behavior" | "inputs" | "states";

/** Where an answer is written. */
export type Write =
  | { kind: "attr"; key: string }
  | { kind: "native"; name: string }
  | { kind: "meta"; key: string }
  | { kind: "resource"; path: string }
  /** Satisfied by the design itself (a label, a drawn state). Only waivable. */
  | { kind: "check" };

export type Inference = { value: string; tier: "set" | "proposed"; reason: string };

export type Status = "answered" | "waived" | "proposed" | "missing";

/**
 * Where an answer came from: the element's own HTML, the project's DESIGN.md,
 * its design-system component, the feature's FEATURE.md, or Wave working it
 * out for certain (a name, a type, a submit button's trigger).
 */
export type Source = "html" | "design" | "component" | "feature" | "auto";

export type Requirement = {
  /** Stable question id: screen/pid/field, screen/screen/field or screen/resource/path. */
  qid: string;
  screen: string;
  pid: string | null;
  address: string | null;
  type: ElementType | "screen";
  field: string;
  label: string;
  question: string;
  tab: Tab;
  owner: Owner;
  level: Level;
  status: Status;
  value: string | null;
  proposal: Inference | null;
  waivedReason: string | null;
  write: Write;
  /** Allowed answers, when the field has a fixed set. */
  choices?: string[];
  /** Where the answer came from, when answered. */
  source?: Source;
};

export type ElementInfo = {
  pid: string;
  type: ElementType;
  certain: boolean;
  reason: string;
  slug: string | null;
  address: string;
  parent: string | null;
  parentAddress: string | null;
  component: string | null;
  variant: string | null;
  behaviours: string[];
};

type Ctx = {
  node: SpecNode;
  type: ElementType;
  detected: Detected;
  screen: string;
  nodes: SpecNode[];
  byId: Map<string, SpecNode>;
  types: Map<string, ElementType>;
  dependents: SpecNode[];
  design: DesignDefaults | null;
  brief: FeatureBrief | null;
  /** The catalogue component this element is an instance of, or sits inside. */
  def: ComponentDefinition | null;
  /** True when def is an ancestor's component, not this element's own. */
  inside: boolean;
  action: FeatureAction | null;
  field: FeatureField | null;
  data: FeatureData | null;
  autoSlug: string;
};

type FieldDef = {
  key: string;
  label: string;
  tab: Tab;
  owner: Owner;
  level: Level | ((c: Ctx) => Level);
  question: string;
  when?: (c: Ctx) => boolean;
  /** The condition in words, for the skill's decision tree. */
  whenText?: string;
  write: Write;
  answered?: (c: Ctx) => string | null;
  infer?: (c: Ctx) => Inference | null;
  choices?: string[];
};

// Small helpers ----------------------------------------------------------------------

const attr = (key: string) => (c: Ctx) => {
  const v = c.node.attrs[key];
  return v === undefined ? null : v;
};
const nonEmptyAttr = (key: string) => (c: Ctx) => {
  const v = c.node.attrs[key];
  return v === undefined || (v.trim() === "" && key !== "item") ? null : v;
};
const native = (name: string) => (c: Ctx) => c.node.html[name] ?? null;
const proposed = (value: string, reason: string): Inference => ({ value, tier: "proposed", reason });
const certain = (value: string, reason: string): Inference => ({ value, tier: "set", reason });
const isNone = (v: string | null | undefined) => !v || /^none$/i.test(v.trim());
const effectsOf = (c: Ctx) => splitEffects(c.node.attrs.effect).filter((e) => !/^none$/i.test(e));
const hasEffects = (c: Ctx) => effectsOf(c).length > 0;
const statesOf = (c: Ctx) => (c.node.attrs.states ?? "").split(/\s+/).filter(Boolean);
const textOf = (c: Ctx) => c.node.text || c.node.html["aria-label"] || c.node.html.alt || c.node.html.placeholder || "";
const insideForm = (c: Ctx) => c.node.ancestors.some((id) => c.types.get(id) === "form");
const depicts = (c: Ctx, state: string) => c.dependents.some((d) => (d.attrs.state ?? "").toLowerCase() === state);
const destructive = (c: Ctx) =>
  /\b(delete|remove|cancel (my |your )?(subscription|order|account|booking)|unsubscribe|close account|discard|revoke|deactivate)\b/i.test(c.node.text) ||
  /danger|destructive|delete/i.test(`${c.node.attrs.variant ?? ""} ${c.node.classes.join(" ")}`);
const referencedBy = (c: Ctx, keys: string[]) => {
  const names = new Set([c.node.id, c.node.slug].filter(Boolean) as string[]);
  return c.nodes.some((n) =>
    keys.some((k) => {
      const raw = n.attrs[k];
      if (!raw) return false;
      if (names.has(raw.trim())) return true;
      const d = parseDestination(raw);
      return (d.kind === "node" || d.kind === "modal") && names.has(d.node);
    }),
  );
};

function variantFromClasses(c: Ctx): string | null {
  for (const cls of c.node.classes) {
    const m = /(?:^|[-_])(primary|secondary|tertiary|ghost|outline|link|danger|destructive|success|warning|info|neutral)$/i.exec(cls);
    if (m) return m[1].toLowerCase() === "danger" ? "destructive" : m[1].toLowerCase();
    if (/^(secondary|primary|ghost|outline|danger|destructive)$/i.test(cls)) return cls.toLowerCase();
  }
  return null;
}

function componentFromClasses(c: Ctx): string | null {
  const base: Partial<Record<ElementType, string>> = {
    button: "Button", link: "Link", textInput: "TextInput", select: "Select", checkbox: "Checkbox", radioGroup: "RadioGroup",
    switch: "Switch", datePicker: "DatePicker", slider: "Slider", fileUpload: "FileUpload", card: "Card", badge: "Badge",
    modal: "Modal", navigation: "Navigation", menu: "Menu", toast: "Toast", tooltip: "Tooltip", avatar: "Avatar",
    loadingState: "Skeleton", chart: "Chart", map: "Map", richTextEditor: "RichTextEditor", table: "Table", emptyState: "EmptyState",
  };
  const name = base[c.type];
  return name ?? null;
}

// Fields shared by several types ---------------------------------------------------------

const F = {
  slug: (level: Level | ((c: Ctx) => Level)): FieldDef => ({
    key: "slug",
    label: "Name (slug)",
    tab: "identity",
    owner: "design",
    level,
    question: "What do we call this? A short name, unique on the screen.",
    write: { kind: "attr", key: "slug" },
    answered: nonEmptyAttr("slug"),
    infer: (c) => {
      const t = textOf(c) || c.node.html.name || c.node.classes[0] || "";
      const s = slugify(t.split(/\s+/).slice(0, 4).join(" "));
      return s ? proposed(s, `from "${t.slice(0, 40)}"`) : null;
    },
  }),
  type: (): FieldDef => ({
    key: "type",
    label: "Element type",
    tab: "identity",
    owner: "design",
    level: "mandatory",
    question: "What kind of element is this?",
    when: (c) => !c.detected.certain,
    whenText: "only when Wave had to guess the type",
    write: { kind: "attr", key: "role" },
    answered: (c) => (c.node.attrs.role && isElementType(c.node.attrs.role) ? c.node.attrs.role : null),
    infer: (c) => proposed(c.type, c.detected.reason),
    choices: undefined,
  }),
  component: (level: Level): FieldDef => ({
    key: "component",
    label: "Component",
    tab: "identity",
    owner: "design",
    level,
    question: "Which design-system component is this?",
    write: { kind: "attr", key: "component" },
    answered: nonEmptyAttr("component"),
    infer: (c) => {
      const n = componentFromClasses(c);
      return n ? proposed(n, `a ${c.type}`) : null;
    },
  }),
  variant: (level: Level): FieldDef => ({
    key: "variant",
    label: "Variant",
    tab: "identity",
    owner: "design",
    level,
    question: "Which variant: primary, secondary, tertiary, destructive, or another the system has?",
    write: { kind: "attr", key: "variant" },
    answered: nonEmptyAttr("variant"),
    infer: (c) => {
      const v = variantFromClasses(c);
      return v ? proposed(v, "from its classes") : c.type === "button" ? proposed("primary", "default") : null;
    },
  }),
  visibleIf: (): FieldDef => ({
    key: "visible-if",
    label: "Shown when",
    tab: "states",
    owner: "product",
    level: (c) => (c.node.hidden ? "mandatory" : "recommended"),
    when: (c) => (c.node.hidden || c.node.attrs["visible-if"] !== undefined) && !c.node.attrs["state-of"] && !["errorMessage", "emptyState", "loadingState", "toast", "tooltip", "modal"].includes(c.type),
    whenText: "when it is hidden in the mockup",
    question: "This is hidden in the mockup. When is it shown?",
    write: { kind: "attr", key: "visible-if" },
    answered: nonEmptyAttr("visible-if"),
  }),
  access: (): FieldDef => ({
    key: "access",
    label: "Who can see it",
    tab: "identity",
    owner: "product",
    level: "recommended",
    question: "Can everyone on this screen see it, or only some roles or plans?",
    write: { kind: "attr", key: "access" },
    answered: nonEmptyAttr("access"),
  }),
  flag: (): FieldDef => ({
    key: "flag",
    label: "Feature flag",
    tab: "identity",
    owner: "product",
    level: "recommended",
    question: "Is this behind a feature flag? Which one, or none?",
    write: { kind: "attr", key: "flag" },
    answered: nonEmptyAttr("flag"),
  }),
  responsive: (): FieldDef => ({
    key: "responsive",
    label: "On small screens",
    tab: "identity",
    owner: "design",
    level: "recommended",
    question: "What happens to this on mobile: stack, hide, collapse, scroll?",
    write: { kind: "attr", key: "responsive" },
    answered: nonEmptyAttr("responsive"),
  }),
  track: (): FieldDef => ({
    key: "track",
    label: "Analytics event",
    tab: "behavior",
    owner: "product",
    level: "recommended",
    question: "Is using this tracked? Event name, or none.",
    write: { kind: "attr", key: "track" },
    answered: (c) => c.node.attrs.track ?? (effectsOf(c).find((e) => e.startsWith("analytics/")) ?? null),
  }),
  content: (): FieldDef => ({
    key: "content",
    label: "Fixed or from data",
    tab: "content",
    owner: "product",
    level: "mandatory",
    question: "Is this text fixed, or does it come from data?",
    write: { kind: "attr", key: "content" },
    choices: ["static", "dynamic"],
    answered: nonEmptyAttr("content"),
    infer: (c) => {
      if (looksLikePlaceholderCopy(c.node.text)) return proposed("static", "placeholder copy");
      const shape = valueShape(c.node.text);
      if (shape) return proposed("dynamic", `"${c.node.text.slice(0, 30)}" looks like ${shape.kind === "money" ? "a price" : `a ${shape.kind}`}`);
      if (c.type === "inlineValue") return proposed("dynamic", "words picked out inside a sentence");
      return proposed("static", "reads as copy");
    },
  }),
};

const isStatic = (c: Ctx) => (c.node.attrs.content ?? "") === "static";
const isDynamic = (c: Ctx) => (c.node.attrs.content ?? "") === "dynamic";

const staticText: FieldDef[] = [
  {
    key: "copy",
    label: "Copy status",
    tab: "content",
    owner: "product",
    level: "mandatory",
    question: "Is this the final copy? final, draft or placeholder.",
    when: (c) => !isDynamic(c),
    whenText: "if fixed text",
    write: { kind: "attr", key: "copy" },
    choices: ["final", "draft", "placeholder"],
    answered: nonEmptyAttr("copy"),
    infer: (c) => (looksLikePlaceholderCopy(c.node.text) ? certain("placeholder", "placeholder text") : proposed("final", "reads as real copy")),
  },
  {
    key: "copy-source",
    label: "Where the copy lives",
    tab: "content",
    owner: "product",
    level: "recommended",
    question: "Where will this copy live: code, cms, or a translation key (i18n:<key>)?",
    when: (c) => !isDynamic(c),
    whenText: "if fixed text",
    write: { kind: "attr", key: "copy-source" },
    answered: nonEmptyAttr("copy-source"),
  },
];

const dynamicText: FieldDef[] = [
  {
    key: "bind",
    label: "Data",
    tab: "content",
    owner: "product",
    level: "mandatory",
    question: "Which data does it show? A path such as user/firstName.",
    when: isDynamic,
    whenText: "if from data",
    write: { kind: "attr", key: "bind" },
    answered: nonEmptyAttr("bind"),
  },
  {
    key: "empty",
    label: "When empty",
    tab: "content",
    owner: "product",
    level: "mandatory",
    question: "What shows if there is no value: hide it, a dash, or some text?",
    when: isDynamic,
    whenText: "if from data",
    write: { kind: "attr", key: "empty" },
    answered: nonEmptyAttr("empty"),
  },
  {
    key: "overflow",
    label: "Overflow",
    tab: "content",
    owner: "design",
    level: "mandatory",
    question: "If it is too long: wrap, truncate, or clamp to N lines (clamp:2)?",
    when: isDynamic,
    whenText: "if from data",
    write: { kind: "attr", key: "overflow" },
    answered: nonEmptyAttr("overflow"),
    infer: () => proposed("wrap", "default"),
  },
  {
    key: "sample",
    label: "Example value",
    tab: "content",
    owner: "product",
    level: "recommended",
    question: "Is the text shown a realistic example?",
    when: isDynamic,
    whenText: "if from data",
    write: { kind: "attr", key: "sample" },
    answered: nonEmptyAttr("sample"),
    infer: (c) => (c.node.text ? certain(c.node.text, "the text drawn") : null),
  },
  {
    key: "max",
    label: "Max length",
    tab: "content",
    owner: "product",
    level: "recommended",
    question: "How long can it get?",
    when: isDynamic,
    whenText: "if from data",
    write: { kind: "attr", key: "max" },
    answered: nonEmptyAttr("max"),
  },
];

const formatField = (level: Level): FieldDef => ({
  key: "format",
  label: "Format",
  tab: "content",
  owner: "product",
  level,
  question: "How is it formatted? e.g. currency:GBP, date:relative, number:0dp, percent:1dp.",
  when: (c) => c.type === "formattedValue" || isDynamic(c),
    whenText: "for values and dynamic text",
  write: { kind: "attr", key: "format" },
  answered: nonEmptyAttr("format"),
  infer: (c) => {
    const s = valueShape(c.node.text);
    return s ? proposed(s.format, `"${c.node.text.slice(0, 30)}"`) : null;
  },
});

const textFields = (): FieldDef[] => [F.content(), ...staticText, ...dynamicText];

const labelCheck = (question = "It needs a label people and screen readers can read."): FieldDef => ({
  key: "label",
  label: "Label",
  tab: "inputs",
  owner: "design",
  level: "mandatory",
  question,
  write: { kind: "check" },
  answered: (c) => c.node.label ?? c.node.html["aria-label"] ?? null,
});

const fieldField = (): FieldDef => ({
  key: "field",
  label: "Writes to",
  tab: "inputs",
  owner: "product",
  level: "mandatory",
  question: "Which data does this set? A path such as address/postcode.",
  write: { kind: "attr", key: "field" },
  answered: nonEmptyAttr("field"),
  infer: (c) => {
    const form = c.node.ancestors.map((id) => c.byId.get(id)).find((n) => n && c.types.get(n.id) === "form");
    const base = c.node.html.name || c.node.html.id || c.node.html.autocomplete?.replace(/^(shipping|billing) /, "") || c.node.slug;
    if (!base) return null;
    const group = form?.slug ?? c.screen;
    return proposed(`${group}/${base.replace(/[^A-Za-z0-9_-]+/g, "-")}`, c.node.html.name ? `name="${c.node.html.name}"` : "its name");
  },
});

function inferValidate(c: Ctx): Inference | null {
  const rules: string[] = [];
  const why: string[] = [];
  const h = c.node.html;
  const label = c.node.label ?? "";
  if (h.required !== undefined || h["aria-required"] === "true") {
    rules.push("required");
    why.push("required attribute");
  } else if (/\*\s*$|\*\)|\(required\)/i.test(label)) {
    rules.push("required");
    why.push("the label has a *");
  } else if (/\(optional\)/i.test(label)) {
    rules.push("optional");
    why.push('the label says "optional"');
  }
  const t = (h.type ?? "").toLowerCase();
  if (["email", "url", "tel", "number"].includes(t)) {
    rules.push(t === "tel" ? "phone" : t);
    why.push(`type="${t}"`);
  }
  for (const [n, rule] of [["minlength", "min-length"], ["maxlength", "max-length"], ["min", "min"], ["max", "max"], ["pattern", "pattern"]] as const) {
    if (h[n] !== undefined) {
      rules.push(`${rule}:${h[n]}`);
      why.push(`${n}="${h[n]}"`);
    }
  }
  if (c.type === "fileUpload" && h.accept) why.push(`accept="${h.accept}"`);
  if (!rules.length) return null;
  const tier = why.every((w) => w.includes("attribute") || w.includes("=")) ? "set" : "proposed";
  return { value: rules.join("; "), tier, reason: why.join(", ") };
}

const validateField = (question = "Must it be filled in, and what rules apply (format, length, range)? Say optional if none."): FieldDef => ({
  key: "validate",
  label: "Required and rules",
  tab: "inputs",
  owner: "product",
  level: "mandatory",
  question,
  write: { kind: "attr", key: "validate" },
  answered: nonEmptyAttr("validate"),
  infer: inferValidate,
});

const errorDrawn: FieldDef = {
  key: "error-state",
  label: "Error message drawn",
  tab: "states",
  owner: "design",
  level: "mandatory",
  question: "Draw the error message for each rule (an element with data-wave-state-of pointing here and data-wave-state=\"error\").",
  when: (c) => {
    const v = (c.node.attrs.validate ?? "").toLowerCase();
    return !!v && !/^\s*(optional|none)\s*$/.test(v);
  },
    whenText: "if it has validation rules",
  write: { kind: "check" },
  answered: (c) => (depicts(c, "error") ? "drawn" : null),
};

const statesField = (defaults: (c: Ctx) => string): FieldDef => ({
  key: "states",
  label: "States",
  tab: "states",
  owner: "design",
  level: "mandatory",
  question: "Which states does it have? e.g. default hover focus disabled loading error.",
  write: { kind: "attr", key: "states" },
  answered: nonEmptyAttr("states"),
  infer: (c) => proposed(defaults(c), "usual states for this element"),
});

const optionsField: FieldDef = {
  key: "options",
  label: "Options",
  tab: "inputs",
  owner: "product",
  level: "mandatory",
  question: "What are the choices, and where do they come from? A list separated by |, or a data path.",
  write: { kind: "attr", key: "options" },
  answered: nonEmptyAttr("options"),
  infer: (c) => {
    const opts = c.node.options.length
      ? c.node.options
      : c.nodes.filter((n) => n.ancestors.includes(c.node.id) && c.types.get(n.id) === "radio").map((n) => n.label ?? n.text);
    return opts.length ? proposed(opts.filter(Boolean).join(" | "), "the options drawn") : null;
  },
};

const defaultField = (infer?: (c: Ctx) => Inference | null): FieldDef => ({
  key: "default",
  label: "Starting value",
  tab: "inputs",
  owner: "product",
  level: "mandatory",
  question: "What is it set to at the start? A value, or none.",
  write: { kind: "attr", key: "default" },
  answered: nonEmptyAttr("default"),
  infer,
});

// Actions ---------------------------------------------------------------------------------

const actionFields = (opts: { requireTo: boolean }): FieldDef[] => [
  {
    key: "action",
    label: "Action",
    tab: "behavior",
    owner: "product",
    level: "mandatory",
    question: "What is this action called? e.g. action/checkout/add-address.",
    write: { kind: "attr", key: "action" },
    answered: nonEmptyAttr("action"),
    infer: (c) => {
      const t = slugify(textOf(c).split(/\s+/).slice(0, 4).join(" "));
      return t ? proposed(`action/${c.screen}/${t}`, `from "${textOf(c).slice(0, 30)}"`) : null;
    },
  },
  {
    key: "trigger",
    label: "Trigger",
    tab: "behavior",
    owner: "product",
    level: "mandatory",
    question: "What triggers it: click, submit, change or load?",
    write: { kind: "attr", key: "trigger" },
    choices: ["click", "submit", "change", "load"],
    answered: nonEmptyAttr("trigger"),
    infer: (c) =>
      (c.node.html.type ?? "").toLowerCase() === "submit" || (c.node.tag === "button" && !c.node.html.type && insideForm(c))
        ? certain("submit", "a submit button in a form")
        : ["switch", "checkbox", "select"].includes(c.type)
          ? certain("change", `a ${c.type}`)
          : certain("click", "a pressed control"),
  },
  {
    key: "effect",
    label: "Side effects",
    tab: "behavior",
    owner: "product",
    level: "mandatory",
    question: "What happens behind it: API calls, analytics, emails, payments? Space separated, or none.",
    write: { kind: "attr", key: "effect" },
    answered: nonEmptyAttr("effect"),
    infer: (c) => {
      const href = c.node.html.href ?? "";
      if (href.startsWith("mailto:")) return certain("email/compose", "a mailto: link");
      if (href.startsWith("tel:")) return certain("phone/call", "a tel: link");
      return null;
    },
  },
  {
    key: "to",
    label: "On success",
    tab: "behavior",
    owner: "product",
    level: opts.requireTo ? "mandatory" : "mandatory",
    question: "Where does the user end up when it works? screen:, node:, modal:, back, url:, or stay.",
    write: { kind: "attr", key: "to" },
    answered: nonEmptyAttr("to"),
    infer: inferTo,
  },
  {
    key: "to-failure",
    label: "On failure",
    tab: "behavior",
    owner: "product",
    level: "mandatory",
    question: "What happens if it fails? The node that shows the error (node:screen/slug), a screen, or none.",
    when: hasEffects,
    whenText: "if it has side effects",
    write: { kind: "attr", key: "to-failure" },
    answered: nonEmptyAttr("to-failure"),
  },
];

function inferTo(c: Ctx): Inference | null {
  const href = c.node.html.href;
  if (!href || href === "#" || href.startsWith("javascript:")) return null;
  if (/^https?:\/\//i.test(href)) return certain(`url:${href}`, "an external link");
  if (/^(mailto|tel):/i.test(href)) return certain("stay", `a ${href.split(":")[0]}: link`);
  if (href.startsWith("#")) return proposed(`node:${c.screen}/${href.slice(1)}`, "an in-page link");
  const base = href.split(/[?#]/)[0].replace(/\/$/, "").split("/").pop()?.replace(/\.html?$/i, "");
  return base ? proposed(`screen:${base}`, `href="${href}"`) : null;
}

const buttonFields = (): FieldDef[] => [
  {
    key: "label",
    label: "Label",
    tab: "identity",
    owner: "design",
    level: "mandatory",
    question: "An icon-only button needs an aria-label saying what it does.",
    write: { kind: "native", name: "aria-label" },
    answered: (c) => (c.node.text || c.node.html["aria-label"] || c.node.html.title || null),
  },
  F.component("mandatory"),
  F.variant("mandatory"),
  ...actionFields({ requireTo: true }),
  statesField((c) => ["default", "hover", "focus", ...(c.node.html.disabled !== undefined ? ["disabled"] : []), ...(hasEffects(c) ? ["loading"] : [])].join(" ")),
  {
    key: "loading-state",
    label: "Loading state drawn",
    tab: "states",
    owner: "design",
    level: "mandatory",
    question: "It does work behind the scenes, so draw its loading state (data-wave-state-of here, data-wave-state=\"loading\").",
    when: (c) => hasEffects(c) && statesOf(c).includes("loading"),
    whenText: "if it has side effects",
    write: { kind: "check" },
    answered: (c) => (depicts(c, "loading") ? "drawn" : null),
  },
  {
    key: "disabled-if",
    label: "Disabled when",
    tab: "behavior",
    owner: "product",
    level: "mandatory",
    question: "When can it not be pressed?",
    when: (c) => statesOf(c).includes("disabled") || c.node.html.disabled !== undefined,
    whenText: "if it can be disabled",
    write: { kind: "attr", key: "disabled-if" },
    answered: nonEmptyAttr("disabled-if"),
  },
  {
    key: "confirm",
    label: "Asks to confirm",
    tab: "behavior",
    owner: "product",
    level: "mandatory",
    question: "This looks destructive. Does it ask \"are you sure\" first? The dialog's slug, or none.",
    when: destructive,
    whenText: "if it looks destructive (delete, remove, cancel…)",
    write: { kind: "attr", key: "confirm" },
    answered: nonEmptyAttr("confirm"),
  },
  {
    key: "feedback",
    label: "Success message",
    tab: "behavior",
    owner: "product",
    level: "recommended",
    question: "Is there a message when it works? The toast's slug, or none.",
    when: hasEffects,
    whenText: "if it has side effects",
    write: { kind: "attr", key: "feedback" },
    answered: nonEmptyAttr("feedback"),
  },
  F.track(),
  {
    key: "shortcut",
    label: "Keyboard shortcut",
    tab: "behavior",
    owner: "product",
    level: "recommended",
    question: "Is there a keyboard shortcut? e.g. mod+s, or none.",
    when: () => false,
    write: { kind: "attr", key: "shortcut" },
    answered: nonEmptyAttr("shortcut"),
  },
];

// Per type --------------------------------------------------------------------------------

const SLUG_MANDATORY_UNLESS_STATIC: ElementType[] = ["heading", "text", "label"];

function slugLevel(c: Ctx): Level {
  if (c.type === "container" || c.type === "stateDepiction") return "recommended";
  if (c.type === "icon" && c.node.html["aria-hidden"] === "true") return "recommended";
  if (SLUG_MANDATORY_UNLESS_STATIC.includes(c.type) && !isDynamic(c)) return "recommended";
  return "mandatory";
}

const TYPE_FIELDS: Record<ElementType, () => FieldDef[]> = {
  section: () => [F.access(), F.responsive(), F.flag()],
  container: () => [],
  stateDepiction: () => [],
  card: () => [F.component("mandatory"), F.variant("mandatory"), F.access(), F.responsive()],
  list: () => [
    {
      key: "repeat",
      label: "List of",
      tab: "content",
      owner: "product",
      level: "mandatory",
      question: "What is this a list of? A data path ending in [], e.g. orders[].",
      write: { kind: "attr", key: "repeat" },
      answered: nonEmptyAttr("repeat"),
    },
    {
      key: "item",
      label: "Item template",
      tab: "content",
      owner: "design",
      level: "mandatory",
      question: "Mark the one child that is the item template (data-wave-item). Other copies are samples.",
      write: { kind: "check" },
      answered: (c) => (c.nodes.some((n) => n.attrs.item !== undefined && n.ancestors.includes(c.node.id)) ? "marked" : null),
    },
    {
      key: "sort",
      label: "Order",
      tab: "content",
      owner: "product",
      level: "mandatory",
      question: "In what order: newest, price, alphabetical, as returned?",
      write: { kind: "attr", key: "sort" },
      answered: nonEmptyAttr("sort"),
    },
    {
      key: "paginate",
      label: "How many",
      tab: "content",
      owner: "product",
      level: "mandatory",
      question: "All at once, pages, load more, or infinite scroll? all, pages:20, load-more:20, infinite:20.",
      write: { kind: "attr", key: "paginate" },
      answered: nonEmptyAttr("paginate"),
    },
    {
      key: "empty-state",
      label: "When empty",
      tab: "content",
      owner: "design",
      level: "mandatory",
      question: "What shows when there are none? The empty state's slug.",
      write: { kind: "attr", key: "empty-state" },
      answered: nonEmptyAttr("empty-state"),
    },
    {
      key: "filter",
      label: "Filters",
      tab: "content",
      owner: "product",
      level: "recommended",
      question: "Which controls filter it, and on what?",
      write: { kind: "attr", key: "filter" },
      answered: nonEmptyAttr("filter"),
    },
    F.access(),
    F.responsive(),
  ],
  table: () => [...TYPE_FIELDS.list(), { ...F.responsive(), level: "mandatory", question: "On a small screen: scroll, stack, or hide columns?" }],
  modal: () => [
    {
      key: "kind",
      label: "Kind",
      tab: "identity",
      owner: "design",
      level: "mandatory",
      question: "Modal, drawer, sheet or full screen?",
      write: { kind: "attr", key: "role" },
      choices: ["dialog", "drawer", "sheet", "fullscreen"],
      answered: (c) => (["dialog", "drawer", "sheet", "fullscreen", "modal"].includes((c.node.attrs.role ?? "").toLowerCase()) ? c.node.attrs.role : null),
      infer: (c) => (c.node.tag === "dialog" ? certain("dialog", "<dialog>") : /drawer/.test(c.node.classes.join(" ")) ? proposed("drawer", "named drawer") : proposed("dialog", "default")),
    },
    {
      key: "opened-by",
      label: "Opened by",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "Nothing opens this. Give the control that opens it data-wave-to=\"modal:<screen>/<this slug>\".",
      write: { kind: "check" },
      answered: (c) => (referencedBy(c, ["to", "to-failure", "confirm"]) ? "linked" : null),
    },
    {
      key: "dismiss",
      label: "Closes by",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "How does it close: close-button, backdrop, escape, or only by choosing?",
      write: { kind: "attr", key: "dismiss" },
      answered: nonEmptyAttr("dismiss"),
      infer: (c) =>
        c.nodes.some((n) => n.ancestors.includes(c.node.id) && /^(×|✕|x|close)$/i.test((n.text || n.html["aria-label"] || "").trim()))
          ? proposed("close-button escape", "it has a close button")
          : null,
    },
    F.component("mandatory"),
  ],
  navigation: () => [
    {
      key: "active-if",
      label: "Current item",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "How do we know which item is current?",
      write: { kind: "attr", key: "active-if" },
      answered: nonEmptyAttr("active-if"),
      infer: (c) => (c.nodes.some((n) => n.ancestors.includes(c.node.id) && (n.html["aria-current"] || n.classes.some((k) => /active|current|selected/.test(k)))) ? proposed("route", "an item is marked current") : null),
    },
    {
      key: "items",
      label: "Every item goes somewhere",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "Every item needs a destination (data-wave-to).",
      write: { kind: "check" },
      answered: (c) => {
        const items = c.nodes.filter((n) => n.ancestors.includes(c.node.id) && ["link", "button"].includes(c.types.get(n.id) ?? ""));
        return items.length && items.every((n) => n.attrs.to) ? "all set" : null;
      },
    },
    F.component("mandatory"),
    { ...F.responsive(), level: "recommended" },
  ],
  menu: () => [
    {
      key: "trigger",
      label: "Opens on",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "What opens it: click or hover?",
      write: { kind: "attr", key: "trigger" },
      choices: ["click", "hover"],
      answered: nonEmptyAttr("trigger"),
      infer: () => proposed("click", "default"),
    },
    F.component("mandatory"),
  ],
  heading: () => textFields(),
  text: () => textFields(),
  label: () => textFields(),
  inlineValue: () => [...textFields(), formatField("recommended")],
  formattedValue: () => [...textFields(), formatField("mandatory")],
  image: () => [
    {
      key: "alt",
      label: "Alt text",
      tab: "content",
      owner: "design",
      level: "mandatory",
      question: "Describe it for screen readers, or leave alt empty if it is decorative.",
      write: { kind: "native", name: "alt" },
      answered: native("alt"),
    },
    { ...F.content(), question: "Is it always this image, or from data?", infer: () => proposed("static", "default") },
    { ...dynamicText[0], question: "Which data gives the image?" },
    { ...dynamicText[1], label: "Fallback", owner: "design", question: "What shows if there is no image or it fails to load?" },
    {
      key: "fit",
      label: "Fit",
      tab: "content",
      owner: "design",
      level: "mandatory",
      question: "Crop to fill or fit inside, and what ratio? e.g. cover 16:9.",
      write: { kind: "attr", key: "fit" },
      answered: nonEmptyAttr("fit"),
      infer: () => proposed("cover", "default"),
    },
    {
      key: "asset",
      label: "Where it lives",
      tab: "content",
      owner: "product",
      level: "recommended",
      question: "Where will the real image live: cdn, bundled, user-upload?",
      write: { kind: "attr", key: "asset" },
      answered: nonEmptyAttr("asset"),
    },
  ],
  icon: () => [
    {
      key: "meaning",
      label: "Decorative or meaningful",
      tab: "content",
      owner: "design",
      level: "mandatory",
      question: "Does it mean something on its own? If yes give it an aria-label; if not, aria-hidden=\"true\".",
      write: { kind: "native", name: "aria-label" },
      answered: (c) => (c.node.html["aria-hidden"] === "true" ? "decorative" : c.node.html["aria-label"] || c.node.html.title || null),
      infer: (c) => {
        const parent = c.node.parent ? c.byId.get(c.node.parent) : undefined;
        return parent && parent.text ? proposed("decorative", "it sits next to text") : null;
      },
    },
    {
      key: "icon",
      label: "Icon name",
      tab: "identity",
      owner: "design",
      level: "mandatory",
      question: "Which icon from the library? e.g. lucide:search.",
      write: { kind: "attr", key: "icon" },
      answered: nonEmptyAttr("icon"),
      infer: (c) => (c.node.iconHints[0] ? proposed(c.node.iconHints[0].replace(/^(lucide|icon|ico|fa|mdi|ph|bi|ri|ti)[-_]/, "$1:"), "its class or sprite") : null),
    },
  ],
  avatar: () => [...TYPE_FIELDS.image(), F.component("mandatory")],
  badge: () => [
    F.content(),
    dynamicText[0],
    {
      key: "values",
      label: "Values and looks",
      tab: "content",
      owner: "product",
      level: "mandatory",
      question: "Every value it can take and how each looks, e.g. paid:success pending:warning failed:danger.",
      when: isDynamic,
    whenText: "if from data",
      write: { kind: "attr", key: "values" },
      answered: nonEmptyAttr("values"),
    },
    F.component("mandatory"),
    F.variant("recommended"),
  ],
  media: () => [
    { ...F.content(), question: "Always this media, or from data?", infer: () => proposed("static", "default") },
    dynamicText[0],
    {
      key: "playback",
      label: "Playback",
      tab: "content",
      owner: "design",
      level: "mandatory",
      question: "Autoplay, muted, loop, controls?",
      write: { kind: "attr", key: "playback" },
      answered: nonEmptyAttr("playback"),
    },
  ],
  chart: () => [
    { ...dynamicText[0], when: () => true, question: "Which data, over what period?" },
    F.component("mandatory"),
    { ...dynamicText[1], when: () => true, question: "What shows with no data?" },
  ],
  map: () => [
    { ...dynamicText[0], when: () => true, question: "Which location data and markers does it show?" },
    { ...dynamicText[1], when: () => true, question: "What shows with no locations?" },
    F.component("mandatory"),
    {
      key: "config",
      label: "Interactions",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "What can people do on the map: pan, zoom, select a marker (and what that does)?",
      write: { kind: "attr", key: "config" },
      answered: nonEmptyAttr("config"),
    },
  ],
  button: buttonFields,
  link: () => [
    { ...actionFields({ requireTo: true })[3], question: "Where does it go? screen:<slug>, url:https://…, node:, modal:, back." },
    {
      key: "target",
      label: "New tab",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "It leaves the product. Open in a new tab (_blank) or the same one (_self)?",
      when: (c) => /^url:/i.test(c.node.attrs.to ?? "") || /^https?:/i.test(c.node.html.href ?? ""),
    whenText: "if it goes to another website",
      write: { kind: "native", name: "target" },
      choices: ["_blank", "_self"],
      answered: native("target"),
    },
    F.track(),
  ],
  form: () => [
    {
      key: "submit",
      label: "Submit button",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "Which button submits it? Give one button data-wave-trigger=\"submit\".",
      write: { kind: "check" },
      answered: (c) =>
        c.nodes.some((n) => n.ancestors.includes(c.node.id) && (n.attrs.trigger === "submit" || (n.html.type ?? "") === "submit" || (n.tag === "button" && !n.html.type)))
          ? "present"
          : null,
    },
    {
      key: "validate-on",
      label: "Shows errors on",
      tab: "inputs",
      owner: "product",
      level: "mandatory",
      question: "When are errors shown: submit, blur (leaving a field) or change (as they type)?",
      write: { kind: "attr", key: "validate-on" },
      choices: ["submit", "blur", "change"],
      answered: nonEmptyAttr("validate-on"),
      infer: () => proposed("submit", "default"),
    },
    {
      key: "dirty-guard",
      label: "Warn on leaving",
      tab: "inputs",
      owner: "product",
      level: "recommended",
      question: "Warn if they leave with unsaved changes? on or off.",
      write: { kind: "attr", key: "dirty-guard" },
      answered: nonEmptyAttr("dirty-guard"),
    },
  ],
  textInput: () => [
    fieldField(),
    {
      key: "input-type",
      label: "Input type",
      tab: "inputs",
      owner: "design",
      level: "mandatory",
      question: "Which input type: text, email, password, number, tel, url, search?",
      write: { kind: "native", name: "type" },
      answered: (c) => (c.node.tag === "textarea" ? "textarea" : c.node.html.type ?? null),
      infer: (c) => (c.node.tag === "input" ? proposed("text", "no type given") : null),
    },
    labelCheck(),
    validateField(),
    errorDrawn,
    statesField((c) => ["default", "focus", "filled", "error", ...(c.node.html.disabled !== undefined ? ["disabled"] : [])].join(" ")),
    F.component("mandatory"),
    {
      key: "format",
      label: "Input mask",
      tab: "inputs",
      owner: "product",
      level: "recommended",
      question: "Is it auto-formatted as they type (phone, card, date)?",
      when: (c) => ["tel", "text"].includes(c.node.html.type ?? "text"),
    whenText: "for text and phone inputs",
      write: { kind: "attr", key: "format" },
      answered: nonEmptyAttr("format"),
    },
    {
      key: "autocomplete",
      label: "Autocomplete",
      tab: "inputs",
      owner: "design",
      level: "recommended",
      question: "Browser autocomplete hint (e.g. email, postal-code, cc-number)?",
      write: { kind: "native", name: "autocomplete" },
      answered: native("autocomplete"),
    },
  ],
  select: () => [
    fieldField(),
    labelCheck(),
    optionsField,
    defaultField((c) => (c.node.options.length ? proposed("none", "no option pre-selected") : null)),
    validateField("Must a choice be made? required or optional."),
    errorDrawn,
    statesField(() => "default focus open error disabled"),
    F.component("mandatory"),
  ],
  checkbox: () => [
    fieldField(),
    labelCheck(),
    defaultField((c) => certain(c.node.html.checked !== undefined ? "checked" : "unchecked", c.node.html.checked !== undefined ? "checked attribute" : "not checked")),
    validateField("Must it be ticked (e.g. terms)? required or optional."),
    {
      key: "commit",
      label: "Acts",
      tab: "behavior",
      owner: "product",
      level: "recommended",
      question: "Does ticking it do something immediately (instant) or only on save (save)?",
      write: { kind: "attr", key: "commit" },
      choices: ["instant", "save"],
      answered: nonEmptyAttr("commit"),
      infer: (c) => (insideForm(c) ? proposed("save", "inside a form") : null),
    },
    F.component("mandatory"),
  ],
  radio: () => [labelCheck("Each option needs a label.")],
  radioGroup: () => [
    fieldField(),
    labelCheck("The group needs a label (a legend or aria-label)."),
    optionsField,
    defaultField(),
    F.component("mandatory"),
  ],
  switch: () => [
    labelCheck(),
    {
      key: "commit",
      label: "Acts",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "Does flipping it take effect immediately (instant) or on save (save)?",
      write: { kind: "attr", key: "commit" },
      choices: ["instant", "save"],
      answered: nonEmptyAttr("commit"),
      infer: (c) => (insideForm(c) ? proposed("save", "inside a form") : proposed("instant", "outside a form")),
    },
    { ...fieldField(), when: (c) => c.node.attrs.commit !== "instant", whenText: "if it acts on save" },
    ...actionFields({ requireTo: false }).map((f) => ({ ...f, when: (c: Ctx) => c.node.attrs.commit === "instant" && (f.when ? f.when(c) : true), whenText: `if it acts instantly${f.whenText ? ` and ${f.whenText.replace(/^if /, "")}` : ""}` })),
    defaultField((c) => certain(c.node.html.checked !== undefined ? "on" : "off", "as drawn")),
    F.component("mandatory"),
  ],
  datePicker: () => [
    ...TYPE_FIELDS.textInput().filter((f) => f.key !== "input-type" && f.key !== "format" && f.key !== "autocomplete"),
    {
      key: "range",
      label: "Allowed range",
      tab: "inputs",
      owner: "product",
      level: "mandatory",
      question: "Earliest and latest allowed? Past dates allowed? (min/max attributes, or rules like future-only)",
      write: { kind: "native", name: "min" },
      answered: (c) => c.node.html.min ?? c.node.html.max ?? (/\b(min|max|past|future)/.test(c.node.attrs.validate ?? "") ? c.node.attrs.validate : null),
    },
    { ...formatField("mandatory"), when: () => true, question: "How is the date shown? e.g. date:medium, time:short (and whose time zone)." },
  ],
  slider: () => [
    fieldField(),
    labelCheck(),
    ...(["min", "max", "step"] as const).map(
      (n): FieldDef => ({
        key: n,
        label: n === "min" ? "Minimum" : n === "max" ? "Maximum" : "Step",
        tab: "inputs",
        owner: "product",
        level: "mandatory",
        question: `The ${n === "step" ? "step size" : `${n}imum value`}?`,
        write: { kind: "native", name: n },
        answered: native(n),
      }),
    ),
    defaultField((c) => (c.node.html.value ? certain(c.node.html.value, "value attribute") : null)),
    F.component("mandatory"),
  ],
  fileUpload: () => [
    fieldField(),
    labelCheck(),
    {
      key: "accept",
      label: "Accepted types",
      tab: "inputs",
      owner: "product",
      level: "mandatory",
      question: "Which file types are accepted? e.g. image/*,.pdf",
      write: { kind: "native", name: "accept" },
      answered: native("accept"),
    },
    { ...validateField("Maximum size and count? e.g. required; max-size:5MB; max-files:3"), answered: (c) => (/max-size/.test(c.node.attrs.validate ?? "") ? c.node.attrs.validate : null) },
    { ...actionFields({ requireTo: false })[0], question: "What happens to the file: uploaded immediately, or with the form? Name the action." },
    statesField(() => "default dragover uploading done error"),
    F.component("mandatory"),
  ],
  richTextEditor: () => [
    fieldField(),
    labelCheck(),
    {
      key: "config",
      label: "Allowed formatting",
      tab: "inputs",
      owner: "product",
      level: "mandatory",
      question: "Which formatting is allowed? e.g. formats:bold italic link list",
      write: { kind: "attr", key: "config" },
      answered: nonEmptyAttr("config"),
    },
    { ...formatField("mandatory"), when: () => true, question: "What does it save as: html, markdown or json?" },
    validateField("Required? Maximum length?"),
    F.component("mandatory"),
  ],
  errorMessage: () => [
    {
      key: "belongs-to",
      label: "Belongs to",
      tab: "states",
      owner: "product",
      level: "mandatory",
      question: "What is this the error of? Point data-wave-state-of at the field, or make an action's data-wave-to-failure lead here.",
      write: { kind: "check" },
      answered: (c) => (c.node.attrs["state-of"] || c.node.attrs["visible-if"] || referencedBy(c, ["to-failure"]) ? "linked" : null),
    },
    { ...F.content(), question: "Fixed text, or the message the server returns?", infer: () => proposed("static", "default") },
    { ...staticText[0], level: "recommended" },
  ],
  emptyState: () => [
    {
      key: "shown-when",
      label: "Shown when",
      tab: "states",
      owner: "product",
      level: "mandatory",
      question: "When does it show? Point a list's data-wave-empty-state here, or give it data-wave-visible-if.",
      write: { kind: "check" },
      answered: (c) => (c.node.attrs["visible-if"] || c.node.attrs["state-of"] || referencedBy(c, ["empty-state"]) ? "linked" : null),
    },
  ],
  loadingState: () => [
    {
      key: "loading-of",
      label: "Loading of",
      tab: "states",
      owner: "design",
      level: "mandatory",
      question: "What is this the loading state of? Point data-wave-state-of at it.",
      write: { kind: "check" },
      answered: (c) => c.node.attrs["state-of"] ?? null,
    },
    F.component("mandatory"),
  ],
  toast: () => [
    {
      key: "shown-by",
      label: "Shown by",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "What shows it? Point an action's data-wave-feedback here, or give it data-wave-visible-if.",
      write: { kind: "check" },
      answered: (c) => (c.node.attrs["visible-if"] || referencedBy(c, ["feedback", "to", "to-failure"]) ? "linked" : null),
    },
    { ...F.variant("mandatory"), question: "Severity: info, success, warning or error?", choices: ["info", "success", "warning", "error"] },
    {
      key: "dismiss",
      label: "Goes away",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "Does it hide by itself (auto:5) or need closing (close-button)?",
      write: { kind: "attr", key: "dismiss" },
      answered: nonEmptyAttr("dismiss"),
    },
    F.component("mandatory"),
  ],
  tooltip: () => [
    {
      key: "trigger",
      label: "Opens on",
      tab: "behavior",
      owner: "product",
      level: "mandatory",
      question: "Hover, focus or click?",
      write: { kind: "attr", key: "trigger" },
      answered: nonEmptyAttr("trigger"),
      infer: () => proposed("hover focus", "default"),
    },
    {
      key: "anchor",
      label: "Describes",
      tab: "states",
      owner: "design",
      level: "mandatory",
      question: "Which element does it describe? Point data-wave-state-of at it.",
      write: { kind: "check" },
      answered: (c) => c.node.attrs["state-of"] ?? null,
    },
    F.content(),
  ],
};

/** Settings each behaviour must declare in data-wave-config, and attributes it needs. */
const BEHAVIOUR_NEEDS: Record<string, { config: string[]; attrs: string[] }> = {
  carousel: { config: ["autoplay", "loop", "controls"], attrs: [] },
  reorderable: { config: ["keyboard"], attrs: ["action"] },
  draggable: { config: ["drops"], attrs: ["action"] },
  "drop-target": { config: [], attrs: ["action"] },
  accordion: { config: ["open", "multiple"], attrs: [] },
  collapsible: { config: ["open"], attrs: [] },
  "infinite-scroll": { config: [], attrs: ["paginate"] },
  "swipe-actions": { config: [], attrs: [] },
  sticky: { config: ["position"], attrs: [] },
  "pull-to-refresh": { config: [], attrs: ["action"] },
  "copy-to-clipboard": { config: ["copies"], attrs: ["feedback"] },
};

export function parseConfig(value: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (value ?? "").split(";")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function behaviourFields(c: Ctx): FieldDef[] {
  const out: FieldDef[] = [];
  const names = (c.node.attrs.behavior ?? "").split(/\s+/).filter(Boolean);
  for (const name of names) {
    const need = BEHAVIOUR_NEEDS[name];
    if (!need) continue;
    for (const key of need.config) {
      out.push({
        key: `${name}:${key}`,
        label: `${name}: ${key}`,
        tab: "behavior",
        owner: "product",
        level: "mandatory",
        question: `The ${name} needs "${key}" in data-wave-config (e.g. ${key}:…).`,
        write: { kind: "attr", key: "config" },
        answered: (x) => parseConfig(x.node.attrs.config)[key] ?? null,
      });
    }
    for (const key of need.attrs) {
      if (out.some((f) => f.key === key)) continue;
      out.push({
        key,
        label: `${name}: ${key}`,
        tab: "behavior",
        owner: "product",
        level: "mandatory",
        question: `The ${name} behaviour needs data-wave-${key}.`,
        write: { kind: "attr", key },
        answered: nonEmptyAttr(key),
      });
    }
  }
  return out;
}

// Screen level --------------------------------------------------------------------------

type ScreenField = {
  whenText?: string;
  key: string;
  label: string;
  owner: Owner;
  level: Level;
  question: string;
  when?: (p: ParsedMockup) => boolean;
  write: Write;
  answered: (p: ParsedMockup) => string | null;
  infer?: (p: ParsedMockup) => Inference | null;
};

const meta = (key: keyof ParsedMockup["screen"]) => (p: ParsedMockup) => {
  const v = p.screen[key];
  return typeof v === "string" && v.trim() ? v : null;
};
const loadsData = (p: ParsedMockup) => p.nodes.some((n) => n.attrs.bind || n.attrs.repeat || n.attrs.trigger === "load");

const SCREEN_FIELDS: ScreenField[] = [
  { key: "screen", label: "Screen slug", owner: "product", level: "mandatory", question: "What is this screen called? A slug unique in the project.", write: { kind: "meta", key: "screen" }, answered: meta("screen"), infer: (p) => (p.screen.documentTitle ? proposed(slugify(p.screen.documentTitle), "the page title") : null) },
  { key: "title", label: "Title", owner: "product", level: "mandatory", question: "The page title?", write: { kind: "meta", key: "title" }, answered: meta("title"), infer: (p) => (p.screen.documentTitle ? certain(p.screen.documentTitle, "<title>") : null) },
  { key: "route", label: "Route", owner: "product", level: "mandatory", question: "What URL is it at, with parameters? e.g. /checkout/:orderId/address", write: { kind: "meta", key: "route" }, answered: meta("route") },
  { key: "flow", label: "Feature", owner: "product", level: "mandatory", question: "Which feature (flow) is this part of?", write: { kind: "meta", key: "flow" }, answered: meta("flow") },
  { key: "access", label: "Who can open it", owner: "product", level: "mandatory", question: "Who can open this: public, signed-in, role:<name>?", write: { kind: "meta", key: "access" }, answered: meta("access") },
  { key: "viewports", label: "Designed for widths", owner: "design", level: "mandatory", question: "Which widths is it designed for? e.g. 375 768 1440", write: { kind: "meta", key: "viewports" }, answered: meta("viewports"), infer: inferViewports },
  { key: "entry", label: "How people arrive", owner: "product", level: "recommended", question: "How do people arrive here: link, email, push, another screen?", write: { kind: "meta", key: "entry" }, answered: meta("entry") },
  { key: "track", label: "Page-view event", owner: "product", level: "recommended", question: "What is the page-view analytics event, or none?", write: { kind: "meta", key: "track" }, answered: meta("track") },
  { key: "lang", label: "Language", owner: "design", level: "recommended", question: "Which language is the page in (html lang)?", write: { kind: "native", name: "lang" }, answered: meta("lang") },
  {
    key: "viewport-meta",
    label: "Viewport tag",
    owner: "design",
    level: "mandatory",
    question: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
    write: { kind: "check" },
    answered: (p) => (p.screen.hasViewportMeta ? "present" : null),
  },
  {
    key: "loading-state",
    label: "Screen loading state",
    owner: "design",
    level: "mandatory",
    question: "The screen shows data. Draw what it looks like while loading (an element with data-wave-state=\"loading\").",
    when: loadsData,
    whenText: "if the screen shows data",
    write: { kind: "check" },
    answered: (p) => (p.nodes.some((n) => (n.attrs.state ?? "") === "loading") ? "drawn" : null),
  },
  {
    key: "error-state",
    label: "Screen error state",
    owner: "design",
    level: "mandatory",
    question: "The screen shows data. Draw what it looks like if loading fails (an element with data-wave-state=\"error\").",
    when: loadsData,
    whenText: "if the screen shows data",
    write: { kind: "check" },
    answered: (p) => (p.nodes.some((n) => (n.attrs.state ?? "") === "error" && !n.attrs["state-of"]) || p.nodes.some((n) => n.attrs.state === "error" && n.attrs["state-of"] && !p.nodes.find((x) => x.id === n.attrs["state-of"])?.formControl) ? "drawn" : null),
  },
];

function inferViewports(p: ParsedMockup): Inference | null {
  const widths = new Set<number>();
  for (const css of p.css) {
    for (const m of css.matchAll(/@media[^{]*\((?:min|max)-width\s*:\s*([\d.]+)(px|rem|em)\)/g)) {
      const n = parseFloat(m[1]) * (m[2] === "px" ? 1 : 16);
      widths.add(Math.round(n));
    }
  }
  if (!widths.size) return p.screen.hasViewportMeta ? proposed("375 1440", "a viewport tag but no breakpoints") : proposed("1440", "no breakpoints");
  return proposed([...widths].sort((a, b) => a - b).join(" "), "its media queries");
}

// Inheritance -----------------------------------------------------------------------------

type Inherited = { value: string; source: Source };

const from = (value: string | null | undefined, source: Source): Inherited | null => (value === null || value === undefined || value === "" ? null : { value, source });

/**
 * What an element inherits for a field it does not answer itself. In order:
 * the feature brief (the fields, data and actions it names), the component it
 * is an instance of (or a part of), the project's DESIGN.md, and what Wave
 * works out for certain. The HTML always wins; this is only asked when it is
 * silent.
 */
function inherit(c: Ctx, key: string): Inherited | null {
  const d = c.design;
  const a = c.action;
  const fb = c.field;
  const db = c.data;
  const partOf = c.inside && c.def ? `part of ${c.def.name}` : null;
  switch (key) {
    case "type":
      return { value: c.type, source: "auto" };
    case "slug":
      return { value: c.autoSlug, source: "auto" };
    case "component":
      return partOf ? { value: partOf, source: "component" } : null;
    case "variant":
      if (partOf) return { value: partOf, source: "component" };
      return c.def && c.def.variants.length === 1 ? { value: c.def.variants[0], source: "component" } : null;
    case "states":
      return c.def && c.def.states.length ? { value: c.def.states.join(" "), source: "component" } : null;
    case "responsive":
      return from(c.def?.responsive, "component") ?? from(d?.responsive, "design");
    case "content": {
      if (c.node.attrs.bind) return { value: "dynamic", source: "auto" };
      if (!d) return null;
      if (c.type === "inlineValue" || valueShape(c.node.text) || looksLikePlaceholderCopy(c.node.text)) return null;
      if (["image", "media", "avatar"].includes(c.type)) return { value: "static", source: "design" };
      return { value: "static", source: "design" };
    }
    case "copy":
      return d?.copy && !looksLikePlaceholderCopy(c.node.text) ? { value: d.copy, source: "design" } : null;
    case "copy-source":
      return from(d?.copySource, "design");
    case "access":
      return from(d?.elementAccess, "design");
    case "flag":
      return from(d?.flags, "design");
    case "track":
      return from(a?.track, "feature") ?? from(d?.track, "design");
    case "empty":
      return from(db?.empty, "feature") ?? from(d?.empty, "design");
    case "overflow":
      return from(d?.overflow, "design");
    case "format":
      return from(db?.format, "feature") ?? from(fb?.format, "feature");
    case "max":
      return from(db?.max, "feature");
    case "sort":
      return from(db?.sort, "feature");
    case "paginate":
      return from(db?.paginate, "feature");
    case "validate":
      return from(fb?.validate, "feature");
    case "options":
      return from(fb?.options, "feature");
    case "default":
      return from(fb?.default, "feature");
    case "visible-if": {
      const own = from(fb?.visibleIf, "feature");
      if (own) return own;
      // A hidden wrapper is shown when the field inside it is.
      const inner = c.nodes.find((n) => n.ancestors.includes(c.node.id) && n.attrs["visible-if"]);
      return inner ? { value: inner.attrs["visible-if"], source: "auto" } : null;
    }
    case "validate-on":
      return from(d?.validateOn, "design");
    case "dirty-guard":
      return from(d?.dirtyGuard, "design");
    case "fit":
      return from(d?.fit, "design");
    case "target":
      return from(d?.externalTarget, "design");
    case "dismiss":
      return c.type === "toast" ? from(d?.toastDismiss, "design") : from(d?.modalDismiss, "design");
    case "icon":
      if (partOf) return { value: partOf, source: "component" };
      return d?.icons === "inline" ? { value: "inline", source: "design" } : null;
    case "action":
      if (a) return { value: `action/${a.id}`, source: "feature" };
      return { value: `action/${c.screen}/${c.autoSlug}`, source: "auto" };
    case "trigger":
      if (a?.trigger) return { value: a.trigger, source: "feature" };
      if (c.def?.events) {
        const ev = Object.values(c.def.events)[0];
        if (ev && ["click", "submit", "change", "load"].includes(ev)) return { value: ev, source: "component" };
      }
      return null;
    case "effect":
      if (a?.effect) return { value: a.effect, source: "feature" };
      // A control that only takes people somewhere does nothing behind the scenes.
      return c.node.attrs.to && !c.node.attrs.action ? { value: "none", source: "auto" } : null;
    case "to":
      return from(a?.to, "feature");
    case "to-failure":
      return from(a?.failure, "feature");
    case "confirm":
      return from(a?.confirm, "feature");
    case "feedback":
      return from(a?.feedback, "feature");
    case "disabled-if":
      return from(a?.disabledIf, "feature");
    case "loading-state":
      return c.def && !c.inside && c.def.states.includes("loading") ? { value: `drawn in ${c.def.name}`, source: "component" } : null;
  }
  return null;
}

/** Names for elements that have none, unique on the screen: from the field, action, component or text. */
export function assignSlugs(nodes: SpecNode[], types: Map<string, ElementType>): Map<string, string> {
  const taken = new Set(nodes.map((n) => n.slug).filter(Boolean) as string[]);
  const out = new Map<string, string>();
  for (const n of nodes) {
    if (n.slug) {
      out.set(n.id, n.slug);
      continue;
    }
    const type = types.get(n.id) ?? "container";
    const last = (v: string | undefined) => (v ? v.replace(/\[\]$/, "").split("/").pop() ?? "" : "");
    const words = (t: string) => t.split(/\s+/).slice(0, 4).join(" ");
    const text = n.text || n.html["aria-label"] || n.html.alt || n.html.placeholder || "";
    const base =
      slugify(last(n.attrs.field)) ||
      slugify(last(n.attrs.action)) ||
      slugify(last(n.attrs.repeat)) ||
      slugify(last(n.attrs.bind)) ||
      slugify(`${n.attrs.component ?? ""} ${n.attrs.variant ?? ""}`.trim() && !text ? `${n.attrs.component} ${n.attrs.variant ?? ""}` : words(text)) ||
      slugify(n.html.name ?? n.html.id ?? "") ||
      slugify(n.classes[0]?.replace(/^[a-z]-/, "") ?? "") ||
      slugify(type);
    const inControl = type === "label" && n.ancestors.some((id) => nodes.some((x) => x.id === id && ["button", "a"].includes(x.tag)));
    let slug = (base.slice(0, 40).replace(/-+$/, "") || "element") + (inControl ? "-text" : "");
    if (taken.has(slug)) {
      let i = 2;
      while (taken.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    taken.add(slug);
    out.set(n.id, slug);
  }
  return out;
}

// Evaluation ------------------------------------------------------------------------------

export type ScreenRequirements = {
  screen: string;
  elements: ElementInfo[];
  requirements: Requirement[];
  counts: { mandatoryOpen: number; recommendedOpen: number; waived: number; answered: number; proposed: number };
};

function waivedMap(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export function addressOf(screen: string, type: ElementType | string, node: Pick<SpecNode, "slug" | "id">): string {
  return `${screen}.${type}.${node.slug ?? node.id}`;
}

/** Every element's type, address and parent, in document order. */
export function describeElements(parsed: ParsedMockup, screen: string): ElementInfo[] {
  const byId = new Map(parsed.nodes.map((n) => [n.id, n]));
  const detected = new Map(parsed.nodes.map((n) => [n.id, detectType(n, byId)]));
  return parsed.nodes.map((n) => {
    const d = detected.get(n.id)!;
    const parent = n.parent ? byId.get(n.parent) : undefined;
    return {
      pid: n.id,
      type: d.type,
      certain: d.certain,
      reason: d.reason,
      slug: n.slug,
      address: addressOf(screen, d.type, n),
      parent: n.parent,
      parentAddress: parent ? addressOf(screen, detected.get(parent.id)!.type, parent) : null,
      component: n.attrs.component ?? null,
      variant: n.attrs.variant ?? null,
      behaviours: (n.attrs.behavior ?? "").split(/\s+/).filter((b) => (BEHAVIOURS as readonly string[]).includes(b)),
    };
  });
}

export type EvaluateOptions = {
  /** The screen's HTML, needed to compare component instances with the catalogue. */
  html?: string;
  /** The project's tokens. Undefined skips the token checks; null means the project has none. */
  tokens?: TokenSet | null;
  /** Where the project's assets are served. Undefined skips the asset checks. */
  assetBase?: string | null;
  /** The project's catalogue. Undefined skips the catalogue checks; null means there is none yet. */
  catalogue?: Catalogue | null;
  /** The project's DESIGN.md defaults, inherited by every element. */
  design?: DesignDefaults | null;
  /** The feature's FEATURE.md: its screens, fields, data and actions. */
  feature?: FeatureBrief | null;
};

function inheritScreen(key: string, screen: string, d: DesignDefaults | null, b: FeatureBrief | null): Inherited | null {
  const fs = b?.screens.find((x) => x.slug === screen) ?? null;
  switch (key) {
    case "route":
      return from(fs?.route, "feature");
    case "title":
      return from(fs?.title, "feature");
    case "flow":
      return from(b?.feature, "feature");
    case "access":
      return from(fs?.access, "feature") ?? from(d?.access, "design");
    case "entry":
      return from(fs?.entry, "feature");
    case "track":
      return from(fs?.track, "feature") ?? from(d?.pageViews, "design");
    case "viewports":
      return from(d?.viewports, "design");
    case "lang":
      return from(d?.lang, "design");
  }
  return null;
}

/** Everything one screen still has to say, and what it already says. */
export function evaluateScreen(parsed: ParsedMockup, screenSlugValue: string, options: EvaluateOptions = {}): ScreenRequirements {
  const screen = screenSlugValue;
  const byId = new Map(parsed.nodes.map((n) => [n.id, n]));
  const elements = describeElements(parsed, screen);
  const types = new Map(elements.map((e) => [e.pid, e.type]));
  const out: Requirement[] = [];

  const screenWaived = waivedMap(parsed.screen.waived);
  const specimen = parsed.screen.component && options.html ? parseSpecimen(options.html, parsed) : null;
  for (const problem of specimen?.problems ?? []) {
    const key = `specimen:${problem.slice(0, 60)}`;
    const waivedReason = screenWaived[key] ?? null;
    out.push({
      qid: `${screen}/screen/${key}`,
      screen,
      pid: null,
      address: screen,
      type: "screen",
      field: key,
      label: "Catalogue specimen",
      question: problem,
      tab: "identity",
      owner: "design",
      level: "mandatory",
      status: waivedReason !== null ? "waived" : "missing",
      value: null,
      proposal: null,
      waivedReason,
      write: { kind: "check" },
    });
  }
  for (const f of parsed.screen.component ? [] : SCREEN_FIELDS) {
    if (f.when && !f.when(parsed)) continue;
    let value = f.answered(parsed);
    let source: Source | undefined = value !== null ? "html" : undefined;
    if (value === null) {
      const got = inheritScreen(f.key, screen, options.design ?? null, options.feature ?? null);
      if (got) {
        value = got.value;
        source = got.source;
      }
    }
    const waivedReason = screenWaived[f.key] ?? null;
    let proposal = value === null && f.infer ? f.infer(parsed) : null;
    if (value === null && proposal?.tier === "set" && waivedReason === null) {
      value = proposal.value;
      source = "auto";
      proposal = null;
    }
    out.push({
      source,
      qid: `${screen}/screen/${f.key}`,
      screen,
      pid: null,
      address: screen,
      type: "screen",
      field: f.key,
      label: f.label,
      question: f.question,
      tab: "identity",
      owner: f.owner,
      level: f.level,
      status: value !== null ? "answered" : waivedReason !== null ? "waived" : proposal ? "proposed" : "missing",
      value,
      proposal,
      waivedReason,
      write: f.write,
    });
  }

  // Every data path used must be described in the resources block.
  const used = new Set<string>();
  for (const n of parsed.nodes) {
    for (const k of ["bind", "repeat", "field"] as const) if (n.attrs[k] && !isNone(n.attrs[k])) used.add(n.attrs[k].trim());
  }
  for (const path of [...used].sort()) {
    const doc = parsed.screen.resources[path];
    const waivedReason = screenWaived[`resource:${path}`] ?? null;
    let value = doc ? [doc.type, doc.source, doc.description].filter(Boolean).join("; ") || "described" : null;
    let source: Source | undefined = value !== null ? "html" : undefined;
    if (value === null && options.feature) {
      const b = options.feature;
      const d = b.data.get(path) ?? b.data.get(path.replace(/\[\]$/, ""));
      const fl = b.fields.get(path);
      if (d?.type && d.source) value = [d.type, d.source, d.description ?? path].join("; ");
      else if (fl) value = [fl.type ?? "string", "form", fl.description ?? fl.label ?? path].join("; ");
      if (value !== null) source = "feature";
    }
    out.push({
      source,
      qid: `${screen}/resource/${path}`,
      screen,
      pid: null,
      address: screen,
      type: "screen",
      field: `resource:${path}`,
      label: `Data: ${path}`,
      question: `What is ${path}? Its type, where it comes from, and what it means (type; source; description).`,
      tab: "content",
      owner: "product",
      level: "mandatory",
      status: value ? "answered" : waivedReason !== null ? "waived" : "missing",
      value,
      proposal: null,
      waivedReason,
      write: { kind: "resource", path },
    });
  }

  const autoSlugs = assignSlugs(parsed.nodes, types);
  const defs = new Map((options.catalogue?.components ?? []).map((c) => [c.name.toLowerCase(), c as ComponentDefinition]));
  const defOf = (name: string | undefined) => (name ? (defs.get(name.trim().toLowerCase()) ?? null) : null);
  const brief = options.feature ?? null;
  const design = options.design ?? null;
  for (const node of parsed.screen.component ? [] : parsed.nodes) {
    const info = elements.find((e) => e.pid === node.id)!;
    const ownDef = defOf(node.attrs.component);
    const owner = ownDef ? null : [...node.ancestors].reverse().map((id) => byId.get(id)).find((n) => n?.attrs.component);
    const ownerDef = owner ? defOf(owner.attrs.component) ?? { name: owner.attrs.component, type: null, description: null, variants: [], states: [], anatomy: [], a11y: null, status: "proposed" as const } : null;
    const dataPath = (node.attrs.bind ?? node.attrs.repeat ?? "").trim();
    const ctx: Ctx = {
      node,
      type: info.type,
      detected: { type: info.type, certain: info.certain, reason: info.reason },
      screen,
      nodes: parsed.nodes,
      byId,
      types,
      dependents: parsed.nodes.filter((d) => d.attrs["state-of"] === node.id),
      design,
      brief,
      def: ownDef ?? ownerDef,
      inside: !ownDef && !!ownerDef && !node.attrs.component,
      action: brief ? actionFor(brief, screen, { ...node, slug: node.slug ?? autoSlugs.get(node.id) ?? null }) : null,
      field: brief && node.attrs.field ? (brief.fields.get(node.attrs.field.trim()) ?? null) : null,
      data: brief && dataPath ? (brief.data.get(dataPath) ?? brief.data.get(dataPath.replace(/\[\]$/, "")) ?? null) : null,
      autoSlug: autoSlugs.get(node.id) ?? node.id,
    };
    // Conditions ("if it has side effects", "if fixed text") see inherited answers too.
    const effective: Record<string, string> = {};
    for (const key of ["effect", "content", "validate", "states", "to", "trigger", "commit"]) {
      if (node.attrs[key] !== undefined) continue;
      const got = inherit(ctx, key);
      if (got && !/^part of /.test(got.value)) effective[key] = got.value;
    }
    const whenCtx: Ctx = Object.keys(effective).length ? { ...ctx, node: { ...node, attrs: { ...effective, ...node.attrs } } } : ctx;
    const waived = waivedMap(node.attrs.waived);
    const fields: FieldDef[] = [F.type(), F.slug(slugLevel), ...TYPE_FIELDS[info.type](), F.visibleIf(), ...behaviourFields(ctx)];
    const seen = new Set<string>();
    for (const f of fields) {
      if (seen.has(f.key)) continue;
      seen.add(f.key);
      // Being able to be disabled is the component's; this instance is asked only when it is drawn disabled.
      if (f.when && !f.when(f.key === "disabled-if" ? ctx : whenCtx)) continue;
      const level = typeof f.level === "function" ? f.level(whenCtx) : f.level;
      let value = f.answered ? f.answered(ctx) : null;
      let source: Source | undefined = value !== null ? "html" : undefined;
      if (value === null && (f.write.kind !== "check" || f.key === "loading-state")) {
        const got = inherit(ctx, f.key);
        if (got) {
          value = got.value;
          source = got.source;
        }
      }
      const waivedReason = waived[f.key] ?? null;
      let proposal = value === null && f.infer ? f.infer(ctx) : null;
      // What Wave knows for certain is an answer, not a question.
      if (value === null && proposal?.tier === "set" && waivedReason === null) {
        value = proposal.value;
        source = "auto";
        proposal = null;
      }
      out.push({
        qid: `${screen}/${node.id}/${f.key}`,
        screen,
        pid: node.id,
        address: info.address,
        type: info.type,
        field: f.key,
        label: f.label,
        question: f.question,
        tab: f.tab,
        owner: f.owner,
        level,
        status: value !== null ? "answered" : waivedReason !== null ? "waived" : proposal ? "proposed" : "missing",
        value,
        proposal,
        waivedReason,
        write: f.write,
        choices: f.choices,
        source,
      });
    }
  }

  const screenReq = (field: string, label: string, question: string, tab: Tab, pid: string | null = null, owner: Owner = "design"): Requirement => {
    const node = pid ? byId.get(pid) : undefined;
    const waivedReason = (node ? waivedMap(node.attrs.waived)[field] : screenWaived[field]) ?? null;
    return {
      qid: `${screen}/${pid ?? "screen"}/${field}`,
      screen,
      pid,
      address: pid ? (elements.find((e) => e.pid === pid)?.address ?? screen) : screen,
      type: pid ? (types.get(pid) ?? "container") : "screen",
      field,
      label,
      question,
      tab,
      owner,
      level: "mandatory",
      status: waivedReason !== null ? "waived" : "missing",
      value: null,
      proposal: null,
      waivedReason,
      write: { kind: "check" },
    };
  };

  if (options.tokens !== undefined) {
    for (const issue of styleIssues(parsed.css, options.tokens)) {
      const label =
        issue.kind === "literal"
          ? `Not a token: ${issue.property} ${issue.value}`
          : issue.kind === "unknown-var"
            ? `Unknown variable ${issue.value}`
            : issue.kind === "missing-category"
              ? `No ${issue.value} tokens`
              : issue.kind === "redefined"
                ? `Token redefined: ${issue.property}`
                : "No token file";
      out.push(screenReq(issue.key, label, `${issue.message}${issue.suggestion ? ` Use ${issue.suggestion}.` : ""}${issue.selector ? ` (in ${issue.selector})` : ""}`, "styles"));
    }
  }

  if (options.assetBase !== undefined) {
    for (const issue of assetIssues(parsed.assets, options.assetBase)) {
      const pid = issue.pid && byId.has(issue.pid) ? issue.pid : null;
      out.push(screenReq(issue.key, `Asset not hosted: ${issue.url.startsWith("data:") ? "inline file" : issue.url.slice(0, 60)}`, issue.message, "content", pid));
    }
  }

  if (options.catalogue !== undefined && !parsed.screen.component) {
    if (options.catalogue === null || options.catalogue.components.length === 0) {
      out.push(screenReq("catalogue", "Design system catalogue", "The project has no approved design system catalogue yet. Run Wave Design's catalogue setup and have the designer approve it before uploading screens.", "identity"));
    } else if (options.html) {
      for (const [pid, m] of matchInstances(options.html, parsed, options.catalogue)) {
        if (m.status === "match") continue;
        const question =
          m.status === "new-component"
            ? `${m.component} is not in the catalogue. Is it a new component? If yes, add it to the catalogue; if not, rebuild this element from an existing component.`
            : m.status === "new-variant"
              ? `${m.details[0]} Is ${m.variant} a new variant? If yes, add it to ${m.component}'s specimen; if not, use an existing variant.`
              : m.status === "drift"
                ? `${m.details.join(" ")} Make it match the catalogue exactly, or, if the designer says so, update the component or add a new variant.`
                : `${m.details[0]} The designer approves it in the catalogue.`;
        const label = m.status === "drift" ? `Differs from ${m.component}` : m.status === "unapproved" ? `${m.component} not approved` : m.status === "new-variant" ? `New variant ${m.variant}?` : `New component ${m.component}?`;
        out.push(screenReq("catalogue", label, question, "identity", pid));
      }
    }
  }

  return { screen, elements, requirements: out, counts: countRequirements(out) };
}

export function countRequirements(reqs: Requirement[]) {
  const open = (r: Requirement) => r.status === "missing" || r.status === "proposed";
  return {
    mandatoryOpen: reqs.filter((r) => r.level === "mandatory" && open(r)).length,
    recommendedOpen: reqs.filter((r) => r.level === "recommended" && open(r)).length,
    waived: reqs.filter((r) => r.status === "waived").length,
    answered: reqs.filter((r) => r.status === "answered").length,
    proposed: reqs.filter((r) => r.status === "proposed").length,
  };
}


/**
 * The decision tree as Markdown: for every element type, what is asked, of
 * whom, and when. Generated from the same table the validator uses, so the
 * skill and the checks can never disagree.
 */
export function decisionTreeMarkdown(): string {
  const lines: string[] = [];
  const row = (f: { label: string; key: string; question: string; owner: Owner; level: Level | ((c: Ctx) => Level); whenText?: string; write: Write; when?: unknown }, typeName: string) => {
    if (f.key === "shortcut") return;
    const level = typeof f.level === "function" ? "mandatory when hidden, else recommended" : f.level;
    const where =
      f.write.kind === "attr" ? `\`data-wave-${f.write.key}\`` : f.write.kind === "native" ? `\`${f.write.name}\`` : f.write.kind === "meta" ? `\`wave:${f.write.key}\`` : f.write.kind === "resource" ? "wave-resources" : "the design";
    const cond = f.whenText ? ` (${f.whenText})` : f.when && typeName !== "any" ? " (when it applies)" : "";
    lines.push(`| ${f.label}${cond} | ${level === "mandatory" ? "**mandatory**" : level} | ${f.owner === "design" ? "designer" : "product"} | ${where} | ${f.question.replace(/\|/g, "\\|")} |`);
  };
  lines.push("### Every element", "", "| Field | Level | Asked of | Written as | Question |", "| --- | --- | --- | --- | --- |");
  row(F.type(), "any");
  row({ ...F.slug("mandatory"), level: "mandatory" }, "any");
  lines.push("| Name (slug) is recommended, not mandatory, for fixed text, decorative icons, containers and state pictures. | | | | |");
  row(F.visibleIf(), "any");
  lines.push("");
  lines.push("### The screen", "", "| Field | Level | Asked of | Written as | Question |", "| --- | --- | --- | --- | --- |");
  for (const f of SCREEN_FIELDS) row(f as never, "screen");
  lines.push("| Data: each path (bind, repeat, field) | **mandatory** | product | wave-resources | What is it? Its type, where it comes from, and what it means (type; source; description). |");
  lines.push("");
  const groups: Record<string, ElementType[]> = {};
  for (const t of Object.keys(TYPE_FIELDS) as ElementType[]) {
    if (t === "stateDepiction" || t === "container") continue;
    const g = ELEMENT_TYPES_GROUP[t];
    (groups[g] ??= []).push(t);
  }
  for (const [g, types] of Object.entries(groups)) {
    lines.push(`### ${g[0].toUpperCase()}${g.slice(1)}`, "");
    for (const t of types) {
      const fields = TYPE_FIELDS[t]();
      lines.push(`#### ${t}`, "");
      if (!fields.length) {
        lines.push("Nothing beyond the fields every element has.", "");
        continue;
      }
      lines.push("| Field | Level | Asked of | Written as | Question |", "| --- | --- | --- | --- | --- |");
      const seen = new Set<string>();
      for (const f of fields) {
        if (seen.has(f.key)) continue;
        seen.add(f.key);
        row(f, t);
      }
      lines.push("");
    }
  }
  lines.push("### Behaviours", "", "Written in `data-wave-behavior`; each needs its settings in `data-wave-config` (key:value; key:value) and some attributes.", "", "| Behaviour | Settings | Attributes |", "| --- | --- | --- |");
  for (const [b, need] of Object.entries(BEHAVIOUR_NEEDS)) lines.push(`| ${b} | ${need.config.join(", ") || "none"} | ${need.attrs.map((a) => `data-wave-${a}`).join(", ") || "none"} |`);
  return lines.join("\n");
}

const ELEMENT_TYPES_GROUP: Record<ElementType, string> = Object.fromEntries(
  (Object.entries(ELEMENT_TYPES_META) as [ElementType, { group: string }][]).map(([k, v]) => [k, v.group]),
) as Record<ElementType, string>;
