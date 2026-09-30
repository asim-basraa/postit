import type { SpecNode } from "./parse";

/**
 * The kinds of element Wave recognises in a mockup, and how it tells them
 * apart. Every rule about what an element must say (requirements.ts) hangs off
 * these types, and the type is the middle part of an element's address:
 * screen.type.slug.
 */

export const ELEMENT_TYPES = {
  // Structure
  section: { label: "Section", group: "structure" },
  container: { label: "Container", group: "structure" },
  card: { label: "Card", group: "structure" },
  list: { label: "List", group: "structure" },
  table: { label: "Table", group: "structure" },
  modal: { label: "Modal / dialog", group: "structure" },
  navigation: { label: "Navigation", group: "structure" },
  menu: { label: "Menu", group: "structure" },
  // Content
  heading: { label: "Heading", group: "content" },
  text: { label: "Text", group: "content" },
  label: { label: "Label", group: "content" },
  inlineValue: { label: "Inline value", group: "content" },
  formattedValue: { label: "Formatted value", group: "content" },
  image: { label: "Image", group: "content" },
  icon: { label: "Icon", group: "content" },
  avatar: { label: "Avatar / logo", group: "content" },
  badge: { label: "Badge / status", group: "content" },
  media: { label: "Media", group: "content" },
  chart: { label: "Chart", group: "content" },
  map: { label: "Map", group: "content" },
  // Actions
  button: { label: "Button", group: "actions" },
  link: { label: "Link", group: "actions" },
  // Inputs
  form: { label: "Form", group: "inputs" },
  textInput: { label: "Text input", group: "inputs" },
  select: { label: "Select", group: "inputs" },
  checkbox: { label: "Checkbox", group: "inputs" },
  radio: { label: "Radio option", group: "inputs" },
  radioGroup: { label: "Radio group", group: "inputs" },
  switch: { label: "Switch", group: "inputs" },
  datePicker: { label: "Date / time picker", group: "inputs" },
  slider: { label: "Slider / stepper", group: "inputs" },
  fileUpload: { label: "File upload", group: "inputs" },
  richTextEditor: { label: "Rich text editor", group: "inputs" },
  // Feedback
  errorMessage: { label: "Error message", group: "feedback" },
  emptyState: { label: "Empty state", group: "feedback" },
  loadingState: { label: "Loading state", group: "feedback" },
  toast: { label: "Toast / banner", group: "feedback" },
  tooltip: { label: "Tooltip / popover", group: "feedback" },
  // A picture of another node in a state (hover, disabled): no questions of its own.
  stateDepiction: { label: "State depiction", group: "feedback" },
} as const;

export type ElementType = keyof typeof ELEMENT_TYPES;

export const BEHAVIOURS = [
  "carousel",
  "reorderable",
  "draggable",
  "drop-target",
  "accordion",
  "collapsible",
  "infinite-scroll",
  "swipe-actions",
  "sticky",
  "pull-to-refresh",
  "copy-to-clipboard",
] as const;
export type Behaviour = (typeof BEHAVIOURS)[number];

export function isElementType(v: string): v is ElementType {
  return Object.prototype.hasOwnProperty.call(ELEMENT_TYPES, v);
}

/** Words a designer might write in data-wave-role, mapped to a type. */
const ROLE_WORDS: Record<string, ElementType> = {
  dialog: "modal",
  alertdialog: "modal",
  drawer: "modal",
  sheet: "modal",
  fullscreen: "modal",
  input: "textInput",
  textbox: "textInput",
  textarea: "textInput",
  nav: "navigation",
  tabs: "navigation",
  tablist: "navigation",
  breadcrumb: "navigation",
  stepper: "navigation",
  pagination: "navigation",
  menubar: "navigation",
  grid: "table",
  banner: "toast",
  alert: "toast",
  snackbar: "toast",
  popover: "tooltip",
  region: "section",
  combobox: "select",
  listbox: "select",
  richtext: "richTextEditor",
  editor: "richTextEditor",
  logo: "avatar",
  video: "media",
  audio: "media",
  embed: "media",
  radiogroup: "radioGroup",
  toggle: "switch",
  range: "slider",
  stepperinput: "slider",
  upload: "fileUpload",
  spinner: "loadingState",
  skeleton: "loadingState",
  empty: "emptyState",
  error: "errorMessage",
};

const ARIA_ROLES: Record<string, ElementType> = {
  button: "button",
  link: "link",
  dialog: "modal",
  alertdialog: "modal",
  navigation: "navigation",
  tablist: "navigation",
  menubar: "navigation",
  menu: "menu",
  switch: "switch",
  checkbox: "checkbox",
  radiogroup: "radioGroup",
  radio: "radio",
  combobox: "select",
  listbox: "select",
  slider: "slider",
  spinbutton: "slider",
  textbox: "textInput",
  searchbox: "textInput",
  heading: "heading",
  table: "table",
  grid: "table",
  list: "list",
  progressbar: "loadingState",
  status: "toast",
  alert: "toast",
  tooltip: "tooltip",
  form: "form",
  region: "section",
  tabpanel: "section",
  banner: "section",
  contentinfo: "section",
  main: "section",
  complementary: "section",
};

const MONEY = /^[£$€¥₹]\s?\d[\d,]*(\.\d+)?$|^\d[\d,]*(\.\d+)?\s?(GBP|USD|EUR|PKR|AED)$/i;
const PERCENT = /^-?\d+(\.\d+)?\s?%$/;
const DATEISH =
  /\b(mon|tue|wed|thu|fri|sat|sun)(day|sday|nesday|rsday|urday)?\b|\b\d{1,2}\s(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s\d{1,2}\b|\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b\d{1,2}:\d{2}\b|\b(today|yesterday|tomorrow|\d+\s(minutes?|hours?|days?|weeks?)\sago)\b/i;
const COUNT = /^\d[\d,]*\s+[a-z]+s?$/i;
const PLAIN_NUMBER = /^-?\d[\d,]*(\.\d+)?$/;
const REFERENCE = /^[A-Z]{2,5}-?\d{3,}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s()-]{7,}$/;

/** What a piece of text looks like, if it looks like data rather than copy. */
export function valueShape(text: string): { kind: "money" | "percent" | "date" | "count" | "number" | "reference" | "email" | "phone"; format: string } | null {
  const t = text.trim();
  if (!t || t.length > 60) return null;
  if (MONEY.test(t)) {
    const cur = t.startsWith("£") ? "GBP" : t.startsWith("$") ? "USD" : t.startsWith("€") ? "EUR" : t.startsWith("¥") ? "JPY" : t.startsWith("₹") ? "INR" : (/[A-Z]{3}$/.exec(t)?.[0] ?? "GBP");
    return { kind: "money", format: `currency:${cur}` };
  }
  if (PERCENT.test(t)) return { kind: "percent", format: `percent:${(t.split(".")[1]?.replace(/\D/g, "").length ?? 0)}dp` };
  if (EMAIL.test(t)) return { kind: "email", format: "email" };
  if (REFERENCE.test(t)) return { kind: "reference", format: "text" };
  if (DATEISH.test(t) && t.length <= 40) {
    const format = /ago|today|yesterday|tomorrow/i.test(t)
      ? "date:relative"
      : /^\d{1,2}:\d{2}/.test(t)
        ? "time:short"
        : /\b(mon|tue|wed|thu|fri|sat|sun)/i.test(t)
          ? "date:weekday"
          : "date:medium";
    return { kind: "date", format };
  }
  if (COUNT.test(t)) return { kind: "count", format: "count" };
  if (/^0\d$/.test(t)) return null; // 01, 02: a step's number, not data
  if (PLAIN_NUMBER.test(t)) return { kind: "number", format: "number" };
  if (PHONE.test(t) && /\d{3}/.test(t)) return { kind: "phone", format: "phone" };
  return null;
}

/** Placeholder copy that is plainly not final. */
export function looksLikePlaceholderCopy(text: string): boolean {
  return /\blorem ipsum\b|\bdolor sit amet\b|^text here$|^(title|heading|subtitle|label|description|placeholder|button|link)( text)?$|^xxx+$|^\[.*\]$|^todo\b/i.test(
    text.trim(),
  );
}

export type Detected = { type: ElementType; certain: boolean; reason: string };

const has = (classes: string[], re: RegExp) => classes.some((c) => re.test(c));

/**
 * The type of one identified element.
 *
 * Certain when an explicit data-wave-role, an ARIA role or the tag says it;
 * otherwise a guess from classes and structure, which the designer confirms.
 */
export function detectType(node: SpecNode, byId: Map<string, SpecNode>): Detected {
  const a = node.attrs;
  const tag = node.tag;
  const cls = node.classes.map((c) => c.toLowerCase());
  const parent = node.parent ? byId.get(node.parent) : undefined;

  if (a["state-of"]) {
    const st = (a.state ?? "").toLowerCase();
    if (st === "error") return { type: "errorMessage", certain: true, reason: "depicts an error state" };
    if (st === "loading") return { type: "loadingState", certain: true, reason: "depicts a loading state" };
    if (st === "empty") return { type: "emptyState", certain: true, reason: "depicts an empty state" };
    return { type: "stateDepiction", certain: true, reason: `depicts another node in its ${st || "other"} state` };
  }

  const role = (a.role ?? "").trim();
  if (role) {
    const word = role.toLowerCase();
    const direct = (Object.keys(ELEMENT_TYPES) as ElementType[]).find((t) => t.toLowerCase() === word);
    if (direct) return { type: direct, certain: true, reason: "data-wave-role" };
    if (ROLE_WORDS[word]) return { type: ROLE_WORDS[word], certain: true, reason: "data-wave-role" };
  }

  const aria = (node.html.role ?? "").toLowerCase();
  if (aria && ARIA_ROLES[aria]) {
    let t = ARIA_ROLES[aria];
    if (t === "toast" && parent && ["textInput", "select", "checkbox"].includes(detectType(parent, byId).type)) t = "errorMessage";
    if (aria === "img") t = tag === "svg" ? "icon" : "image";
    return { type: t, certain: true, reason: `role="${aria}"` };
  }
  if (aria === "img") return { type: tag === "svg" ? "icon" : "image", certain: true, reason: 'role="img"' };

  if (a.item !== undefined && !["a", "button"].includes(tag)) return { type: "container", certain: true, reason: "a list item template" };
  if (tag === "li" && !node.interactive) return { type: "container", certain: true, reason: "a list item" };

  const component = (a.component ?? "").toLowerCase();
  const typeAttr = (node.html.type ?? "").toLowerCase();
  const buttonish = /button|btn|cta/.test(component) || has(cls, /^(btn|button|cta)([-_].*)?$/);

  switch (tag) {
    case "form":
      return { type: "form", certain: true, reason: "<form>" };
    case "button":
      return { type: "button", certain: true, reason: "<button>" };
    case "a":
      if (buttonish) return { type: "button", certain: false, reason: "a link styled and named as a button" };
      return { type: "link", certain: true, reason: "<a>" };
    case "input":
      if (typeAttr === "checkbox") return { type: node.html.role === "switch" || has(cls, /switch|toggle/) ? "switch" : "checkbox", certain: true, reason: 'type="checkbox"' };
      if (typeAttr === "radio") return { type: "radio", certain: true, reason: 'type="radio"' };
      if (typeAttr === "range") return { type: "slider", certain: true, reason: 'type="range"' };
      if (typeAttr === "file") return { type: "fileUpload", certain: true, reason: 'type="file"' };
      if (["date", "time", "datetime-local", "month", "week"].includes(typeAttr)) return { type: "datePicker", certain: true, reason: `type="${typeAttr}"` };
      if (["submit", "button", "reset", "image"].includes(typeAttr)) return { type: "button", certain: true, reason: `type="${typeAttr}"` };
      return { type: "textInput", certain: true, reason: "<input>" };
    case "textarea":
      return { type: "textInput", certain: true, reason: "<textarea>" };
    case "select":
      return { type: "select", certain: true, reason: "<select>" };
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6":
      return { type: "heading", certain: true, reason: `<${tag}>` };
    case "label":
    case "legend":
    case "figcaption":
      return { type: "label", certain: true, reason: `<${tag}>` };
    case "img":
    case "picture":
      if (has(cls, /avatar|logo|profile-pic/) || /logo|avatar/i.test(node.html.alt ?? "")) return { type: "avatar", certain: false, reason: "an image named avatar or logo" };
      return { type: "image", certain: true, reason: `<${tag}>` };
    case "svg":
      if (has(cls, /chart|graph|plot/)) return { type: "chart", certain: false, reason: "an SVG named chart" };
      return { type: "icon", certain: false, reason: "an inline SVG" };
    case "canvas":
      return { type: "chart", certain: false, reason: "<canvas>" };
    case "video":
    case "audio":
    case "iframe":
      return { type: has(cls, /map/) ? "map" : "media", certain: tag !== "iframe", reason: `<${tag}>` };
    case "ul":
    case "ol":
    case "dl":
      return { type: "list", certain: true, reason: `<${tag}>` };
    case "table":
      return { type: "table", certain: true, reason: "<table>" };
    case "dialog":
      return { type: "modal", certain: true, reason: "<dialog>" };
    case "nav":
      return { type: "navigation", certain: true, reason: "<nav>" };
    case "menu":
      return { type: "menu", certain: true, reason: "<menu>" };
    case "progress":
      return { type: "loadingState", certain: true, reason: "<progress>" };
    case "time":
      return { type: "formattedValue", certain: true, reason: "<time>" };
    case "fieldset":
      return { type: "radioGroup", certain: false, reason: "<fieldset>" };
  }

  if (node.html.contenteditable !== undefined && node.html.contenteditable !== "false") {
    return { type: "richTextEditor", certain: true, reason: "contenteditable" };
  }

  if (node.repeatedChildren >= 2) {
    // Chips or cards to choose from are one control's options, not a list of data.
    const kids = [...byId.values()].filter((n) => n.parent === node.id);
    const choice = (n: SpecNode) => ["radio", "checkbox", "option", "switch", "menuitemradio", "menuitemcheckbox"].includes((n.html.role ?? "").toLowerCase()) || n.html["aria-checked"] !== undefined || n.html["aria-pressed"] !== undefined || n.html["aria-selected"] !== undefined || ["radio", "checkbox"].includes((n.html.type ?? "").toLowerCase());
    if (kids.length >= 2 && kids.every(choice)) return { type: "container", certain: true, reason: "a group of choices" };
  }
  // Class and component-name heuristics.
  const hint = `${component} ${cls.join(" ")}`;
  const guesses: [RegExp, ElementType, string][] = [
    [/\b(modal|dialog|drawer|sheet|lightbox)\b/, "modal", "named modal or dialog"],
    [/\b(toast|snackbar|banner|alert|notice|flash)\b/, "toast", "named toast or banner"],
    [/\b(tooltip|popover|hovercard)\b/, "tooltip", "named tooltip"],
    [/\b(skeleton|spinner|loader|loading|shimmer)\b/, "loadingState", "named loading"],
    [/\b(empty|empty-state|no-results|zero-state)\b/, "emptyState", "named empty state"],
    [/\b(error|field-error|invalid-feedback|help-error)\b/, "errorMessage", "named error"],
    [/\b(badge|pill|chip|tag|status|label-status|lozenge)\b/, "badge", "named badge"],
    [/\b(avatar|logo)\b/, "avatar", "named avatar or logo"],
    [/\b(map)\b/, "map", "named map"],
    [/\b(chart|graph|sparkline)\b/, "chart", "named chart"],
    [/\b(carousel|slider-track|swiper)\b/, "list", "named carousel"],
    [/\b(tabs|tab-list|breadcrumbs?|stepper|steps|pagination|pager|navbar|sidebar-nav|menu-bar)\b/, "navigation", "named navigation"],
    [/\b(dropdown|menu|context-menu)\b/, "menu", "named menu"],
    [/\b(switch|toggle)\b/, "switch", "named switch"],
    [/\b(card|tile|panel)\b/, "card", "named card"],
    [/\b(btn|button|cta)\b/, "button", "named button"],
    [/\b(icon|ico|lucide|material-icons|material-symbols)\b/, "icon", "named icon"],
  ];
  for (const [re, t, why] of guesses) if (re.test(hint)) return { type: t, certain: false, reason: why };
  if (node.iconHints.length && !node.text) return { type: "icon", certain: false, reason: "icon class" };

  const kidsNotStates = [...byId.values()].filter((n) => n.parent === node.id && !n.attrs["state-of"]).length;
  const onlyStates = [...byId.values()].some((n) => n.parent === node.id && n.attrs["state-of"]) && kidsNotStates < 3;
  if (node.repeatedChildren >= 3 && !onlyStates) return { type: "list", certain: false, reason: `${node.repeatedChildren} children with the same shape` };
  if (["section", "header", "footer", "main", "aside"].includes(tag)) return { type: "section", certain: true, reason: `<${tag}>` };
  if (tag === "article") return { type: "card", certain: false, reason: "<article>" };
  if (node.interactive) return { type: "button", certain: false, reason: "clickable" };

  const leafText = node.childCount === 0 || ["span", "strong", "em", "b", "i", "small", "p", "blockquote", "time", "div"].includes(tag);
  if (node.text && leafText) {
    const parentType = parent ? detectType(parent, byId).type : null;
    const inline = ["span", "strong", "em", "b", "i", "small"].includes(tag) && parentType !== null && ["heading", "text", "label", "button", "link"].includes(parentType);
    const control = node.ancestors.map((id) => byId.get(id)).find((n) => n && ["button", "a"].includes(n.tag));
    if (valueShape(node.text)) return { type: "formattedValue", certain: false, reason: "text shaped like a value" };
    if (control) return { type: "label", certain: true, reason: `the text of a ${control.tag === "a" ? "link" : "button"}` };
    if (inline) return { type: "inlineValue", certain: true, reason: "words inside a sentence" };
    if (tag === "small") return { type: "label", certain: false, reason: "<small> text" };
    if (tag === "p" || tag === "blockquote") return { type: "text", certain: true, reason: `<${tag}>` };
    if (node.childCount === 0) return { type: "text", certain: true, reason: "plain text" };
  }
  if (!parent) return { type: "section", certain: false, reason: "a top-level block" };
  return { type: "container", certain: false, reason: "a block with no other role" };
}
