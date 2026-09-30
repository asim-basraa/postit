import { attrOf, findElement, isElement, parseDocument, walk, type Element, type ParsedMockup, type SpecNode } from "./parse";
import { cssRules } from "./styles";
import { escapeAttr } from "./edit";
import { newId, ID_ATTR, LEGACY_ID_ATTR } from "./vocabulary";

/**
 * The project's design system catalogue.
 *
 * Each component is one HTML specimen page in <project>/design-system/components.
 * Its head says what it is (wave:component, a JSON definition), and its body
 * draws every variant and state, each example marked with
 * data-wave-component and data-wave-variant (and data-wave-state for states).
 * Being HTML, a specimen is reviewed, commented on and approved in Wave like
 * any screen.
 *
 * An instance on a screen matches its component when its markup has the same
 * shape (tags and classes, ignoring text and data) and its CSS rules for those
 * classes are the same. Anything else is drift, which the designer either
 * fixes or confirms as a new component or variant.
 */

export type ComponentStatus = "proposed" | "approved" | "deprecated";

export type ComponentDefinition = {
  name: string;
  /** The element type from the rules table, e.g. button, textInput. */
  type: string | null;
  description: string | null;
  variants: string[];
  states: string[];
  anatomy: string[];
  a11y: string | null;
  status: ComponentStatus;
  /** What it does on small screens, inherited by every instance. */
  responsive?: string | null;
  /** What using it means, e.g. {"select": "change"}: the trigger its instances inherit. */
  events?: Record<string, string>;
};

export type ComponentExample = {
  pid: string;
  variant: string;
  state: string | null;
  signature: string;
  styles: string[];
};

export type CatalogueComponent = ComponentDefinition & {
  pageId: string;
  pagePath: string;
  version: number;
  examples: ComponentExample[];
  problems: string[];
};

export type Catalogue = { components: CatalogueComponent[] };

export const DEFINITION_SCRIPT_ID = "wave-component";
export const DEFINITION_SCRIPT_TYPE = "application/wave-component+json";

/** Class names that describe a momentary state, left out of signatures. */
const STATE_CLASS = /^(is-|has-)|^(active|hover|focus|focused|disabled|selected|open|checked|loading|error|invalid|current)$/;

export function elementSignature(el: Element, depth = 0): string {
  const classes = (attrOf(el, "class") ?? "")
    .split(/\s+/)
    .filter((c) => c && !STATE_CLASS.test(c))
    .sort()
    .join(".");
  const head = `${el.tagName}${classes ? `.${classes}` : ""}`;
  if (el.tagName === "svg" || depth > 8) return head;
  const kids = el.childNodes
    .filter(isElement)
    .filter((c) => !["script", "style", "template"].includes(c.tagName))
    .slice(0, 40)
    .map((c) => elementSignature(c, depth + 1));
  return kids.length ? `${head}(${kids.join(",")})` : head;
}

function classesIn(el: Element): Set<string> {
  const out = new Set<string>();
  const add = (e: Element) => (attrOf(e, "class") ?? "").split(/\s+/).filter(Boolean).forEach((c) => out.add(c));
  add(el);
  for (const d of walk(el)) add(d);
  return out;
}

/** The CSS rules that style only these classes, normalised for comparison. */
export function componentStyles(cssBlocks: string[], classes: Set<string>): string[] {
  const out = new Set<string>();
  for (const r of cssBlocks.flatMap(cssRules)) {
    for (const sel of r.selector.split(",").map((s) => s.trim())) {
      const used = [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      if (!used.length || !used.every((c) => classes.has(c))) continue;
      const decls = r.decls
        .filter((d) => !d.property.startsWith("--"))
        .map((d) => `${d.property}:${d.value.replace(/\s+/g, " ").trim()}`)
        .sort()
        .join(";");
      if (decls) out.add(`${sel.replace(/\s+/g, " ")}{${decls}}`);
    }
  }
  return [...out].sort();
}

function parseDefinition(json: string, name: string): { def: Omit<ComponentDefinition, "name">; problems: string[] } {
  const problems: string[] = [];
  let raw: Record<string, unknown> = {};
  try {
    const v = JSON.parse(json || "{}");
    if (v && typeof v === "object" && !Array.isArray(v)) raw = v as Record<string, unknown>;
    else problems.push("The component definition is not a JSON object.");
  } catch {
    problems.push("The component definition is not valid JSON.");
  }
  const list = (k: string) => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).map(String) : typeof raw[k] === "string" ? String(raw[k]).split(/\s+/).filter(Boolean) : []);
  const status = ["proposed", "approved", "deprecated"].includes(String(raw.status)) ? (raw.status as ComponentStatus) : "proposed";
  if (!raw.description) problems.push(`${name} has no description.`);
  return {
    def: {
      type: typeof raw.type === "string" ? raw.type : null,
      description: typeof raw.description === "string" ? raw.description : null,
      variants: list("variants").length ? list("variants") : ["default"],
      states: list("states"),
      anatomy: list("anatomy"),
      a11y: typeof raw.a11y === "string" ? raw.a11y : null,
      status,
      responsive: typeof raw.responsive === "string" ? raw.responsive : null,
      events:
        raw.events && typeof raw.events === "object" && !Array.isArray(raw.events)
          ? Object.fromEntries(Object.entries(raw.events as Record<string, unknown>).map(([k, v]) => [k, String(v)]))
          : {},
    },
    problems,
  };
}

/** Reads a specimen page. Null when the page is not one. */
export function parseSpecimen(
  html: string,
  parsed: ParsedMockup,
): (ComponentDefinition & { examples: ComponentExample[]; problems: string[] }) | null {
  const name = parsed.screen.component?.trim();
  if (!name) return null;
  const doc = parseDocument(html);
  let json = "";
  for (const el of walk(doc)) {
    if (el.tagName === "script" && (attrOf(el, "id") === DEFINITION_SCRIPT_ID || attrOf(el, "type") === DEFINITION_SCRIPT_TYPE)) {
      for (const c of el.childNodes) if (c.nodeName === "#text" && "value" in c) json += c.value;
    }
  }
  const { def, problems } = parseDefinition(json, name);
  const examples: ComponentExample[] = [];
  for (const n of parsed.nodes) {
    if ((n.attrs.component ?? "") !== name) continue;
    const el = findElement(html, n.id);
    if (!el) continue;
    examples.push({
      pid: n.id,
      variant: n.attrs.variant || "default",
      state: n.attrs.state || null,
      signature: elementSignature(el),
      styles: componentStyles(parsed.css, classesIn(el)),
    });
  }
  for (const v of def.variants) {
    if (!examples.some((e) => e.variant === v && !e.state)) problems.push(`The ${v} variant is not drawn.`);
  }
  for (const st of def.states) {
    if (st === "default") continue;
    if (!examples.some((e) => e.state === st)) problems.push(`The ${st} state is not drawn.`);
  }
  if (!examples.length) problems.push(`Nothing on the page is marked data-wave-component="${name}".`);
  return { name, ...def, examples, problems };
}

export type InstanceMatch = {
  status: "match" | "new-component" | "new-variant" | "drift" | "unapproved";
  component: string;
  variant: string;
  details: string[];
};

/** How each component instance on a screen compares with the catalogue. */
export function matchInstances(html: string, parsed: ParsedMockup, catalogue: Catalogue): Map<string, InstanceMatch> {
  const out = new Map<string, InstanceMatch>();
  const byName = new Map(catalogue.components.map((c) => [c.name.toLowerCase(), c]));
  for (const n of parsed.nodes) {
    const name = n.attrs.component?.trim();
    if (!name || n.attrs["state-of"]) continue;
    const variant = n.attrs.variant?.trim() || "default";
    const comp = byName.get(name.toLowerCase());
    if (!comp) {
      out.set(n.id, { status: "new-component", component: name, variant, details: [`${name} is not in the project's catalogue.`] });
      continue;
    }
    if (!comp.variants.includes(variant) && !comp.examples.some((e) => e.variant === variant)) {
      out.set(n.id, { status: "new-variant", component: comp.name, variant, details: [`${comp.name} has no ${variant} variant (it has ${comp.variants.join(", ")}).`] });
      continue;
    }
    const example = comp.examples.find((e) => e.variant === variant && !e.state) ?? comp.examples.find((e) => e.variant === variant);
    const el = findElement(html, n.id);
    const details: string[] = [];
    if (example && el) {
      const sig = elementSignature(el);
      if (sig !== example.signature) details.push(`Its markup differs from the catalogue's ${comp.name} ${variant} (${describeDiff(sig, example.signature)}).`);
      const styles = componentStyles(parsed.css, classesIn(el));
      const missing = example.styles.filter((s) => !styles.includes(s));
      const extra = styles.filter((s) => !example.styles.includes(s));
      if (missing.length || extra.length) {
        details.push(
          `Its CSS differs from the catalogue's${extra.length ? `; here only: ${extra.slice(0, 2).join(" ")}` : ""}${missing.length ? `; catalogue only: ${missing.slice(0, 2).join(" ")}` : ""}.`,
        );
      }
    }
    if (details.length) out.set(n.id, { status: "drift", component: comp.name, variant, details });
    else if (comp.status !== "approved") out.set(n.id, { status: "unapproved", component: comp.name, variant, details: [`${comp.name} is in the catalogue but not approved yet.`] });
    else out.set(n.id, { status: "match", component: comp.name, variant, details: [] });
  }
  return out;
}

function describeDiff(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const around = (s: string) => s.slice(Math.max(0, i - 20), i + 30);
  return `here "${around(a)}", catalogue "${around(b)}"`;
}

/** Instance-only spec attributes, dropped when markup becomes a catalogue example. */
const INSTANCE_ATTRS = /\s+data-(wave|pi)-(slug|content|bind|sample|empty|format|max|repeat|item|action|trigger|effect|to|to-failure|field|validate|visible-if|access|flag|track|copy|copy-source|options|default|disabled-if|confirm|feedback|waived|origin)(?=[\s=>/])(="[^"]*")?/g;

/** A specimen page for a new component, made from an instance on a screen. */
export function extractComponent(
  html: string,
  parsed: ParsedMockup,
  pid: string,
  opts: { name: string; type: string; variant?: string; description: string; states?: string[] },
): { ok: true; html: string } | { ok: false; error: string } {
  const el = findElement(html, pid);
  const loc = el?.sourceCodeLocation;
  if (!el || !loc) return { ok: false, error: `No element carries ${ID_ATTR}="${pid}".` };
  let outer = html.slice(loc.startOffset, loc.endOffset);
  outer = outer.replace(INSTANCE_ATTRS, "");
  outer = outer.replace(/data-(wave|pi)-id="[^"]*"/g, () => `${ID_ATTR}="${newId()}"`);
  const variant = opts.variant || "default";
  const component = /data-(wave|pi)-component="/.test(outer.slice(0, outer.indexOf(">")))
    ? outer
    : outer.replace(/^<([a-zA-Z0-9-]+)/, `<$1 data-wave-component="${escapeAttr(opts.name)}" data-wave-variant="${escapeAttr(variant)}"`);
  const example = component.replace(/data-(wave|pi)-variant="[^"]*"/, `data-wave-variant="${escapeAttr(variant)}"`);
  const styles = componentStyles(parsed.css, classesIn(el)).map((r) => r.replace(/\{/, " { ").replace(/;/g, "; ").replace(/\}$/, " }"));
  const rootVars = parsed.css
    .flatMap(cssRules)
    .filter((r) => /^:root$/.test(r.selector.trim()))
    .flatMap((r) => r.decls.filter((d) => d.property.startsWith("--")).map((d) => `    ${d.property}: ${d.value};`));
  const definition = {
    type: opts.type,
    description: opts.description,
    variants: [variant],
    states: opts.states ?? [],
    anatomy: [],
    a11y: null,
    status: "proposed",
  };
  const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeAttr(opts.name)}</title>
<meta name="wave:spec" content="1">
<meta name="wave:component" content="${escapeAttr(opts.name)}">
<script type="${DEFINITION_SCRIPT_TYPE}" id="${DEFINITION_SCRIPT_ID}">
${JSON.stringify(definition, null, 2)}
</script>
<style>
  :root {
${rootVars.join("\n")}
  }
  ${styles.join("\n  ")}
</style>
<style data-wave-scaffold>
  body { font-family: system-ui, sans-serif; padding: 2rem; }
  .wave-specimen-row { display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: flex-start; margin: 1rem 0 2rem; }
</style>
</head>
<body>
<h1>${escapeAttr(opts.name)}</h1>
<p>${escapeAttr(opts.description)}</p>
<h2>${escapeAttr(variant)}</h2>
<div class="wave-specimen-row">
${example}
</div>
</body>
</html>
`;
  return { ok: true, html: page };
}

/** Adds an example (a new variant or state) to a specimen page, before </body>. */
export function addSpecimenExample(specimen: string, title: string, exampleHtml: string): string {
  const block = `<h2>${escapeAttr(title)}</h2>\n<div class="wave-specimen-row">\n${exampleHtml.replace(/data-(wave|pi)-id="[^"]*"/g, () => `${ID_ATTR}="${newId()}"`)}\n</div>\n`;
  const at = specimen.search(/<\/body\s*>/i);
  return at >= 0 ? specimen.slice(0, at) + block + specimen.slice(at) : specimen + block;
}

/** Whether a node is itself on a specimen page (and so not a product screen). */
export function isSpecimen(parsed: ParsedMockup): boolean {
  return !!parsed.screen.component;
}

export type { SpecNode };
export { LEGACY_ID_ATTR };

/** Every component instance on a screen, with how it compares to the catalogue. */
export function catalogueUsage(
  html: string,
  parsed: ParsedMockup,
  catalogue: Catalogue,
  _screen: string,
): { pid: string; component: string; variant: string; status: InstanceMatch["status"] }[] {
  return [...matchInstances(html, parsed, catalogue)].map(([pid, m]) => ({ pid, component: m.component, variant: m.variant, status: m.status }));
}
