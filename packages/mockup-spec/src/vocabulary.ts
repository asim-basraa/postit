/**
 * The mockup spec vocabulary, version 1.
 *
 * Everything a mockup says about itself beyond how it looks: which element is
 * which, what its words are bound to, what it does when pressed and where that
 * leads, which states it has. It lives in the HTML as `data-pi-*` attributes and
 * `pi:` meta tags, so a mockup exported from Post-it still carries all of it.
 * Post-it indexes these; it never keeps a second copy that could disagree.
 *
 * Kept free of any parser or DOM so the browser, the server and the docs page
 * can all import the same list.
 */

export const SPEC_VERSION = "1";

/** The attribute that makes an element a node. Designer-owned: never rewritten. */
export const ID_ATTR = "data-pi-id";

/** Marks an id Post-it created, for a word-level binding, until the designer adopts it. */
export const ORIGIN_ATTR = "data-pi-origin";

/** Prefix every spec attribute shares. */
export const ATTR_PREFIX = "data-pi-";

/**
 * The shape of an id. Opaque, stable and never reused. The skill tells Claude
 * Design to use this form, and Post-it uses it for the ids it has to create.
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
  /** The full attribute. */
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
  spec("origin", "identity", "Set to postit on ids Post-it created. Remove it once adopted.", "postit"),

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
  spec("state-of", "states", "This element depicts another node (by id) in the state named by data-pi-state.", "n_7f3a2c"),
  spec("visible-if", "states", "Visibility condition over resource paths. Free text.", "user/isLoggedIn"),
];

export const KNOWN_ATTRS = new Set(ATTRIBUTES.map((a) => a.attr));

/** Screen-level meta tags, read from `<meta name="pi:...">`. */
export const META = {
  spec: "pi:spec",
  screen: "pi:screen",
  flow: "pi:flow",
  route: "pi:route",
  title: "pi:title",
  tokens: "pi:tokens",
} as const;

/** The optional resource descriptions block. */
export const RESOURCES_SCRIPT_ID = "pi-resources";
export const RESOURCES_SCRIPT_TYPE = "application/pi+json";

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
