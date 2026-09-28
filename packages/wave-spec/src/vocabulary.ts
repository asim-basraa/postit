/**
 * The Wave spec vocabulary, version 1.
 *
 * Everything a mockup says about itself beyond how it looks: which element is
 * which, what its words are bound to, what it does when pressed and where that
 * leads, which states it has. It lives in the HTML as `data-wave-*` attributes
 * and `wave:` meta tags, so an exported mockup still carries all of it. A host
 * (Post-it today) indexes these; nothing keeps a second copy that could disagree.
 *
 * `data-pi-*` and `pi:` are the names this vocabulary shipped with first. They
 * are still read, as a legacy alias, so mockups written with them keep working;
 * the parser reports them, edits keep a file's own prefix, and upgradePrefix
 * rewrites a file to the current names.
 *
 * Kept free of any parser or DOM so the browser, the server and the docs can
 * all import the same list.
 */

export const SPEC_VERSION = "1";

export type PrefixName = "wave" | "pi";

export type PrefixSet = {
  name: PrefixName;
  /** Attribute prefix, e.g. data-wave- */
  attr: string;
  /** Meta name prefix, e.g. wave: */
  meta: string;
  resourcesId: string;
  resourcesType: string;
};

export const PREFIXES: Record<PrefixName, PrefixSet> = {
  wave: {
    name: "wave",
    attr: "data-wave-",
    meta: "wave:",
    resourcesId: "wave-resources",
    resourcesType: "application/wave+json",
  },
  pi: {
    name: "pi",
    attr: "data-pi-",
    meta: "pi:",
    resourcesId: "pi-resources",
    resourcesType: "application/pi+json",
  },
};

/** The current prefix. New files, and new attributes in files that use it, get this. */
export const CURRENT: PrefixSet = PREFIXES.wave;
export const LEGACY: PrefixSet = PREFIXES.pi;

/** Prefix every spec attribute shares. */
export const ATTR_PREFIX = CURRENT.attr;
export const LEGACY_ATTR_PREFIX = LEGACY.attr;

/** The attribute that makes an element a node. Designer-owned: never rewritten. */
export const ID_ATTR = `${CURRENT.attr}id`;
export const LEGACY_ID_ATTR = `${LEGACY.attr}id`;
/** Both, for querySelector. */
export const ID_SELECTOR = `[${ID_ATTR}],[${LEGACY_ID_ATTR}]`;

/** Marks an id the host created, for a word-level binding, until the designer adopts it. */
export const ORIGIN_ATTR = `${CURRENT.attr}origin`;
/** Values of the origin attribute that mean "created by the review tool". */
export const TOOL_ORIGINS = new Set(["wave", "postit"]);

/** The attribute name for a key under a prefix. */
export function attrName(key: string, prefix: PrefixSet = CURRENT): string {
  return `${prefix.attr}${key}`;
}

/** Splits a data-wave-* or data-pi-* attribute into its key and prefix, or null. */
export function splitAttr(name: string): { key: string; prefix: PrefixSet } | null {
  for (const prefix of [CURRENT, LEGACY]) {
    if (name.startsWith(prefix.attr) && name.length > prefix.attr.length) {
      return { key: name.slice(prefix.attr.length), prefix };
    }
  }
  return null;
}

/**
 * The shape of an id. Opaque, stable and never reused. The skill tells Claude
 * Design to use this form, and Wave uses it for the ids it has to create.
 */
export const ID_PATTERN = /^n_[a-z0-9]{4,}$/;

export type AttributeGroup =
  | "identity"
  | "content"
  | "behavior"
  | "inputs"
  | "states";

export type AttributeSpec = {
  /** Short name used in code and in the panel, without the prefix. */
  key: string;
  /** The full attribute, with the current prefix. */
  attr: string;
  group: AttributeGroup;
  /** What it means, for the reference and for tooltips. */
  description: string;
  example: string;
};

function spec(
  key: string,
  group: AttributeGroup,
  description: string,
  example: string,
): AttributeSpec {
  return { key, attr: `${ATTR_PREFIX}${key}`, group, description, example };
}

export const ATTRIBUTES: AttributeSpec[] = [
  spec("id", "identity", "Stable, opaque, designer-owned id. Never changed or reused.", "n_7f3a2c"),
  spec("slug", "identity", "Human name, unique within the screen. Renaming it breaks nothing.", "add-address-button"),
  spec("component", "identity", "The design-system component this should become.", "Button"),
  spec("variant", "identity", "The component variant.", "primary"),
  spec("role", "identity", "Semantic role where the tag does not say it (for example input).", "form"),
  spec("origin", "identity", "Set to wave on ids the review tool created. Remove it once adopted.", "wave"),

  spec("content", "content", "static or dynamic.", "dynamic"),
  spec("bind", "content", "Resource path the content comes from. Free text, path grammar.", "user/firstName"),
  spec("sample", "content", "Example value. Defaults to the rendered text.", "Asim"),
  spec("empty", "content", "What to show when the value is missing.", "there"),
  spec("format", "content", "How the value is formatted. Free text.", "currency:GBP"),
  spec("max", "content", "Maximum length before truncation.", "40"),
  spec("repeat", "content", "This element repeats over a list resource.", "orders[]"),
  spec("item", "content", "Marks the child that is the repeated item template (no value).", ""),

  spec("action", "behavior", "Action name. Free text, path grammar.", "action/signup/add-address"),
  spec("trigger", "behavior", "click, submit, change or load. Defaults to click.", "click"),
  spec("effect", "behavior", "Named side effects, space separated. Free text.", "api/address/create"),
  spec("to", "behavior", "Destination on success: screen:, node:, modal:, back, url:.", "screen:checkout-review"),
  spec("to-failure", "behavior", "Destination or node revealed on failure.", "node:checkout-address/form-error"),

  spec("field", "inputs", "The field this control writes. Free text, path grammar.", "address/postcode"),
  spec("validate", "inputs", "Validation rules, separated by semicolons.", "required; pattern:uk-postcode; max:8"),

  spec("states", "states", "States this node supports, space separated.", "default hover disabled loading error"),
  spec("state", "states", "Which state this element depicts.", "error"),
  spec("state-of", "states", "This element depicts another node (by id) in the state named by data-wave-state.", "n_7f3a2c"),
  spec("visible-if", "states", "Visibility condition over resource paths. Free text.", "user/isLoggedIn"),
];

/** Known keys, without a prefix. */
export const KNOWN_KEYS = new Set(ATTRIBUTES.map((a) => a.key));
export const KNOWN_ATTRS = new Set(ATTRIBUTES.map((a) => a.attr));

/** Screen-level meta keys, read from `<meta name="wave:...">` (or legacy `pi:`). */
export const META_KEYS = ["spec", "screen", "flow", "route", "title", "tokens"] as const;
export type MetaKey = (typeof META_KEYS)[number];

/** Current meta names, e.g. META.screen is "wave:screen". */
export const META = Object.fromEntries(META_KEYS.map((k) => [k, `${CURRENT.meta}${k}`])) as Record<MetaKey, string>;

/** The optional resource descriptions block. */
export const RESOURCES_SCRIPT_ID = CURRENT.resourcesId;
export const RESOURCES_SCRIPT_TYPE = CURRENT.resourcesType;

export const TRIGGERS = ["click", "submit", "change", "load"] as const;

/** Form controls: the elements the Inputs tab applies to. */
export const FORM_TAGS = new Set(["input", "select", "textarea"]);

/** Elements somebody presses, which ought to do something. */
export const INTERACTIVE_TAGS = new Set(["a", "button"]);

/** Makes a fresh id in the documented form. */
export function newId(random: () => number = Math.random): string {
  let out = "n_";
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(random() * alphabet.length)];
  return out;
}

/**
 * Whether a free-text name follows the path grammar: segments of letters,
 * digits, dashes, underscores and dots separated by slashes, optionally ending
 * in [] for a list. Advice only; nothing is refused for failing it.
 */
export function followsPathGrammar(name: string): boolean {
  return /^[A-Za-z0-9_.\-]+(\[\])?(\/[A-Za-z0-9_.\-]+(\[\])?)*$/.test(name.trim());
}
