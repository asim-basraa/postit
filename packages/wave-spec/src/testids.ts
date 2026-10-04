import { attrOf, isElement, parseDocument, walk, type Element } from "./parse";
import { escapeAttr } from "./edit";
import { camelWords } from "./catalogue";
import { slugify } from "./flow";

/**
 * Test ids: one name for an element that the prototype's end-to-end tests and
 * the built app's tests both use.
 *
 *   <screen>.<sections>.<design-system id>.<slug>
 *   budget-timing.form.DS.select.company-size
 *
 * The screen is the screen's slug (from Figma's frame name, or FEATURE.md); the
 * sections are the named landmarks between the screen and the element; the
 * design-system id is the component's (DS.select, never a variant's); the slug
 * is the element's label as drawn. The screen's root carries the screen alone
 * and each section its own path.
 *
 * A test id is given once and kept: an element that has one is never renamed,
 * so tests written against it keep working when its label changes.
 */

export const TESTID_ATTR = "data-testid";

const LANDMARK_TAGS = new Set(["form", "header", "footer", "nav", "main", "aside", "dialog", "section"]);
const LANDMARK_ROLES: Record<string, string> = {
  form: "form",
  dialog: "dialog",
  alertdialog: "dialog",
  navigation: "nav",
  banner: "header",
  contentinfo: "footer",
  main: "main",
  complementary: "aside",
  region: "section",
  search: "search",
};
const SKIP = new Set(["script", "style", "template", "meta", "link", "title", "noscript"]);
/** Figma's names for layers nobody named. */
const DEFAULT_NAME = /^(frame|group|rectangle|ellipse|vector|instance|component|auto layout|section|div|container|wrapper)( \d+)?$/i;

const w = (el: Element, key: string) => attrOf(el, `data-wave-${key}`) ?? attrOf(el, `data-pi-${key}`);

/** A landmark's kind (form, nav...), or null when the element is not one. */
function landmarkKind(el: Element): string | null {
  const role = attrOf(el, "role");
  if (role && LANDMARK_ROLES[role]) return LANDMARK_ROLES[role];
  if (!LANDMARK_TAGS.has(el.tagName)) return null;
  return el.tagName;
}

/** A landmark's name: its slug, its layer's name, its label, else its kind. A plain section needs a name to count. */
function sectionName(el: Element): string | null {
  const kind = landmarkKind(el);
  if (!kind) return null;
  const named = w(el, "slug") ?? (() => {
    const layer = attrOf(el, "data-figma-name");
    return layer && !DEFAULT_NAME.test(layer.trim()) ? layer : null;
  })() ?? attrOf(el, "aria-label");
  if (named && slugify(named)) return slugify(named);
  return kind === "section" ? null : kind;
}

const isHiddenPart = (el: Element) => attrOf(el, "hidden") !== null || !!w(el, "state-of") || attrOf(el, "aria-hidden") === "true";

/** The words an element shows: the first visible run with a letter in it (a step's name, not its number), else the first. */
function firstWords(el: Element): string | null {
  let first: string | null = null;
  for (const d of [el, ...walk(el)]) {
    if (d.tagName === "svg" || SKIP.has(d.tagName)) continue;
    let p: Element | null = d;
    let hidden = false;
    while (p && p !== el) {
      if (isHiddenPart(p)) hidden = true;
      p = p.parentNode && isElement(p.parentNode) ? p.parentNode : null;
    }
    if (hidden) continue;
    const own = d.childNodes
      .filter((c) => c.nodeName === "#text")
      .map((c) => ("value" in c ? String(c.value) : ""))
      .join("")
      .trim();
    if (own && /\p{L}/u.test(own)) return own;
    if (own && !first) first = own;
  }
  return first;
}

/** An element's label, for its slug: what it is called, else what it says, else the field it writes. */
function labelOf(el: Element, inList: boolean): string | null {
  const aria = attrOf(el, "aria-label");
  if (aria) return aria;
  for (const d of walk(el)) {
    const a = attrOf(d, "aria-label");
    if (a && d !== el && ["button", "input", "select", "textarea", "a"].includes(d.tagName)) return a;
  }
  // A list item's words are sample data, not a name.
  if (!inList) {
    const words = firstWords(el);
    if (words) return words;
  }
  const field = w(el, "field") ?? [...walk(el)].map((d) => w(d, "field")).find(Boolean) ?? null;
  if (field) return field.split("/").pop()!;
  return w(el, "slug") ?? w(el, "action")?.split("/").pop() ?? null;
}

function slugPart(s: string): string {
  const full = slugify(s.replace(/[\/–—]/g, " ").replace(/&/g, " and "));
  if (full.length <= 40) return full;
  const cut = full.slice(0, 40);
  return cut.slice(0, cut.lastIndexOf("-") > 10 ? cut.lastIndexOf("-") : 40);
}

/** The design-system id of a component, by its name: DS.select, DS.segmentItem. */
export function componentDsId(name: string): string {
  return `DS.${camelWords(name)}`;
}

export type TestIdKind = "screen" | "section" | "component";

export type TestIdNode = {
  testId: string;
  kind: TestIdKind;
  component?: string;
  ds?: string;
  variant?: string;
  state?: string;
  field?: string;
  options?: string[];
  action?: string;
  to?: string;
  /** The component this one is drawn inside (a segment in a segmented control). */
  partOf?: string;
  figma?: string;
  waveId?: string;
  children?: TestIdNode[];
};

const kids = (el: Element) => el.childNodes.filter(isElement);

type Planned = { el: Element; kind: TestIdKind; id: string | null; existing: string | null; problem?: string };

/** Every element that gets a test id, with the id it has or would get. */
function plan(html: string, screen: string): { planned: Planned[]; root: Element | null } {
  const doc = parseDocument(html);
  const body = [...walk(doc)].find((e) => e.tagName === "body") ?? null;
  const root = body ? (body.childNodes.filter(isElement).find((c) => !SKIP.has(c.tagName) && !attrOf(c, "data-wave-proto")) ?? null) : null;
  const planned: Planned[] = [];
  if (!root) return { planned, root };
  planned.push({ el: root, kind: "screen", id: screen, existing: attrOf(root, TESTID_ATTR) });

  const visit = (el: Element, sections: string[], inList: boolean, sample: boolean) => {
    if (el.tagName === "svg" || SKIP.has(el.tagName)) return;
    let path = sections;
    let list = inList;
    if (el !== root && !sample) {
      // A design-system component is that component, even when its tag is a landmark (a Header).
      const section = landmarkKind(el) && !w(el, "component") ? sectionName(el) : null;
      if (section) {
        path = [...sections, section];
        planned.push({ el, kind: "section", id: [screen, ...path].join("."), existing: attrOf(el, TESTID_ATTR) });
      }
      const component = w(el, "component");
      if (component && !w(el, "state-of")) {
        const label = labelOf(el, inList);
        const slug = label ? slugPart(label) : "";
        // Nothing to name it by and nothing it does (a decorative mark): no test id.
        const acts = [el, ...walk(el)].some((d) => w(d, "field") || w(d, "action") || w(d, "to") || ["button", "a", "input", "select", "textarea"].includes(d.tagName));
        if (!slug && !acts) {
          kids(el).forEach((k, i) => visit(k, path, list, sample || (w(el, "repeat") !== null && i > 0)));
          return;
        }
        planned.push({
          el,
          kind: "component",
          id: slug ? [screen, ...path, componentDsId(component), slug].join(".") : null,
          existing: attrOf(el, TESTID_ATTR),
          problem: slug ? undefined : `A ${component} has no label, field or slug to name its test id by.`,
        });
      }
    }
    if (w(el, "repeat") !== null) list = true;
    // Only a list's first item is its template; the rest are samples of it.
    const repeat = w(el, "repeat") !== null;
    kids(el).forEach((k, i) => visit(k, path, list, sample || (repeat && i > 0)));
  };
  visit(root, [], false, false);
  return { planned, root };
}

export type TestIdProblem = { code: "testid-duplicate" | "testid-unnamed" | "testid-prefix"; message: string; waveId: string | null };

/**
 * Gives every screen root, section and design-system component its test id.
 * Existing ids are kept. An id another element already has is not given
 * twice: the second element is reported, for the design to name apart.
 */
export function assignTestIds(html: string, screen: string): { html: string; added: number; problems: TestIdProblem[] } {
  const { planned } = plan(html, screen);
  const taken = new Set(planned.map((p) => p.existing).filter((x): x is string => !!x));
  const problems: TestIdProblem[] = [];
  const inserts: { at: number; text: string }[] = [];
  for (const p of planned) {
    if (p.existing) continue;
    const wid = w(p.el, "id");
    if (!p.id) {
      problems.push({ code: "testid-unnamed", message: p.problem ?? "An element has nothing to name its test id by.", waveId: wid });
      continue;
    }
    if (taken.has(p.id)) {
      problems.push({ code: "testid-duplicate", message: `Two elements would both be ${p.id}. Name them apart in the design (a different label, or a data-wave-slug).`, waveId: wid });
      continue;
    }
    const loc = p.el.sourceCodeLocation?.startTag;
    if (!loc) continue;
    taken.add(p.id);
    inserts.push({ at: loc.startOffset + 1 + p.el.tagName.length, text: ` ${TESTID_ATTR}="${escapeAttr(p.id)}"` });
  }
  let out = html;
  for (const ins of inserts.sort((a, b) => b.at - a.at)) out = out.slice(0, ins.at) + ins.text + out.slice(ins.at);
  return { html: out, added: inserts.length, problems };
}

/** What is wrong with a screen's test ids as they stand: missing, duplicated, or not this screen's. */
export function checkTestIds(html: string, screen: string): TestIdProblem[] {
  const { planned } = plan(html, screen);
  const problems: TestIdProblem[] = [];
  const seen = new Map<string, number>();
  for (const p of planned) {
    const id = p.existing;
    if (!id) continue;
    seen.set(id, (seen.get(id) ?? 0) + 1);
    if (id !== screen && !id.startsWith(`${screen}.`)) problems.push({ code: "testid-prefix", message: `${id} does not start with this screen (${screen}).`, waveId: w(p.el, "id") });
  }
  for (const [id, n] of seen) if (n > 1) problems.push({ code: "testid-duplicate", message: `${n} elements are ${id}. Name them apart in the design.`, waveId: null });
  // What assigning would not be able to do on its own.
  problems.push(...assignTestIds(html, screen).problems);
  return problems;
}

/** A screen's test ids as a tree: screen, sections, components. Nested components sit in their section, with partOf. */
export function testIdTree(html: string, screen: string): TestIdNode | null {
  const { planned, root } = plan(html, screen);
  if (!root) return null;
  const nodeOf = new Map<Element, TestIdNode>();
  let top: TestIdNode | null = null;
  for (const p of planned) {
    const testId = p.existing ?? p.id;
    if (!testId) continue;
    const n: TestIdNode = { testId, kind: p.kind };
    if (p.kind === "component") {
      const name = w(p.el, "component")!;
      n.component = name;
      n.ds = componentDsId(name);
      n.variant = w(p.el, "variant") ?? "default";
      const state = w(p.el, "state");
      if (state) n.state = state;
      const fieldEl = w(p.el, "field") ? p.el : [...walk(p.el)].find((d) => w(d, "field"));
      if (fieldEl) {
        n.field = w(fieldEl, "field")!;
        const opts = w(fieldEl, "options");
        if (opts) n.options = opts.split("|").map((s) => s.trim()).filter(Boolean);
      }
      const act = w(p.el, "action") ?? [...walk(p.el)].map((d) => w(d, "action")).find(Boolean);
      if (act) n.action = act;
      const to = w(p.el, "to") ?? [...walk(p.el)].map((d) => w(d, "to")).find(Boolean);
      if (to) n.to = to;
    }
    const figma = attrOf(p.el, "data-figma-instance") ?? attrOf(p.el, "data-figma-id");
    if (figma) n.figma = figma;
    const wid = w(p.el, "id");
    if (wid) n.waveId = wid;
    nodeOf.set(p.el, n);
    if (p.kind === "screen") {
      top = n;
      continue;
    }
    // Its parent in the tree: the nearest ancestor that is the screen or a section.
    let parent: TestIdNode | null = null;
    let owner: TestIdNode | null = null;
    for (let a = p.el.parentNode && isElement(p.el.parentNode) ? p.el.parentNode : null; a; a = a.parentNode && isElement(a.parentNode) ? a.parentNode : null) {
      const t = nodeOf.get(a);
      if (!t) continue;
      if (t.kind === "component" && !owner) owner = t;
      if (t.kind !== "component") {
        parent = t;
        break;
      }
    }
    if (owner && p.kind === "component") n.partOf = owner.testId;
    const into = parent ?? top;
    if (into) (into.children ??= []).push(n);
  }
  return top;
}
