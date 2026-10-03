import { designSystemIds, type ComponentDefinition } from "./catalogue";

/**
 * The design-system page: one table of every component in the catalogue with
 * its design-system id and its variants' ids, and the same table as JSON for
 * code. Both are made from the specimens, so they cannot disagree with each
 * other or fall behind the catalogue.
 */

/** The page's name (slug) in the project's design-system folder. */
export const DESIGN_SYSTEM_PAGE = "design-system";
/** The JSON's name, next to the page. */
export const DESIGN_SYSTEM_IDS = "design-system-ids";

export type IndexComponent = Pick<ComponentDefinition, "name" | "type" | "variants" | "status" | "id" | "variantIds" | "source"> & {
  /** Where the specimen page opens, if the host can say. */
  page?: string | null;
  /** Where it is reviewed, if the host can say. */
  review?: string | null;
};

export type DesignSystemIdsDoc = {
  project: string;
  note: string;
  components: { component: string; id: string; type: string | null; variants: { variant: string; id: string }[] }[];
};

/** A component's own id and its variants' ids, from the specimen, or made the way Wave makes them. */
function idsOf(c: IndexComponent): { id: string; variants: { variant: string; id: string }[] } {
  const made = designSystemIds(c.name, c.variants);
  const id = c.id || made.id;
  const given = c.variantIds && Object.keys(c.variantIds).length ? c.variantIds : made.variantIds;
  const variants = Object.entries(given)
    .filter(([, vid]) => vid !== id)
    .map(([variant, vid]) => ({ variant, id: vid }));
  return { id, variants };
}

const byName = (a: IndexComponent, b: IndexComponent) => a.name.localeCompare(b.name, "en", { sensitivity: "base" });

/** The JSON: every component's id, type and variant ids. A component with one variant has an empty list. */
export function designSystemIdsJson(project: string, components: IndexComponent[]): DesignSystemIdsDoc {
  return {
    project,
    note: "Design-system ids. A component with one variant has only its component id (variants is empty). States share their variant's id.",
    components: [...components].sort(byName).map((c) => {
      const { id, variants } = idsOf(c);
      return { component: c.name, id, type: c.type, variants };
    }),
  };
}

/** figma:<file key>/<node id> as a link to that node. */
function figmaLink(source: string | null | undefined): string | null {
  const m = /^figma:([^/]+)\/(.+)$/.exec(source ?? "");
  if (!m) return null;
  return `[${m[2]}](https://www.figma.com/design/${m[1]}?node-id=${m[2].replace(/:/g, "-")})`;
}

function statusLine(components: IndexComponent[]): string {
  const proposed = components.filter((c) => c.status !== "approved");
  if (!proposed.length) return "Status: all approved by the designer.";
  if (proposed.length === components.length) return "Status: all proposed, waiting for approval.";
  return `Status: ${components.length - proposed.length} approved; waiting for approval: ${proposed.map((c) => c.name).join(", ")}.`;
}

const INTRO = (project: string) =>
  `${project}'s components, from the catalogue's specimens. Every component has a design-system id, and so does each of its variants; screens and code name a component by these ids. States (hover, disabled, selected) share their variant's id.`;

const HOW = (figma: boolean) =>
  [
    "## How the ids are made",
    "",
    "- A component's id is `DS.` and its name in camelCase: Text field is `DS.textField`.",
    "- A variant's id puts the variant first: the Primary Button is `DS.primaryButton`, the Arrow right Icon is `DS.arrowRightIcon`.",
    "- A component with one variant has only its component id.",
    ...(figma ? ["- Figma has no ids of its own for these components, so these were set here; if Figma gains them (in a component's description or documentation link), they take over."] : []),
  ].join("\n");

/**
 * The page's Markdown. When the page already exists, its title and opening
 * paragraphs (everything before the status line) and its Notes section are
 * kept: those are written by people. The status, the table, the link to the
 * JSON and how the ids are made are always regenerated.
 */
export function designSystemPage(project: string, components: IndexComponent[], opts: { idsLink: string; previous?: string | null }): string {
  const sorted = [...components].sort(byName);
  const figma = sorted.some((c) => figmaLink(c.source));
  const view = sorted.some((c) => c.page || c.review);
  const head = ["Component", "ID", "Variant IDs", "Type", ...(figma ? ["Figma"] : []), ...(view ? ["View"] : [])];
  const rows = sorted.map((c) => {
    const { id, variants } = idsOf(c);
    const cells = [
      c.name,
      `\`${id}\``,
      variants.length ? variants.map((v) => `\`${v.id}\` (${v.variant})`).join("<br>") : "none (one variant)",
      c.type ?? "",
      ...(figma ? [figmaLink(c.source) ?? ""] : []),
      ...(view ? [[c.page ? `[Page](${c.page})` : "", c.review ? `[Review](${c.review})` : ""].filter(Boolean).join(" · ")] : []),
    ];
    return `| ${cells.map((x) => x.replace(/\|/g, "\\|")).join(" | ")} |`;
  });

  const previous = opts.previous ?? "";
  const statusAt = previous.search(/^Status:/m);
  const intro = statusAt > 0 ? previous.slice(0, statusAt).trimEnd() : `# Design system\n\n${INTRO(project)}`;
  const notes = /^## Notes\b[\s\S]*$/m.exec(previous)?.[0].trimEnd();

  return [
    intro,
    "",
    statusLine(sorted),
    "",
    `| ${head.join(" | ")} |`,
    `|${head.map(() => "---").join("|")}|`,
    ...rows,
    "",
    `The same table as JSON, without the Figma and View columns: ${opts.idsLink}.`,
    "",
    HOW(figma),
    ...(notes ? ["", notes] : []),
    "",
  ].join("\n");
}
