/**
 * Wave's reference pages, generated from the code that does what they describe:
 * the HTML vocabulary and element types from @wave/spec, the brief templates,
 * the entry gate's rules from @wave/figma, the MCP tools from @wave/mcp and the
 * public types from the packages' own declarations. Run it after any change to
 * those and publish the output (Post-it is where Wave's docs live).
 *
 *   npx tsx packages/wave-docs/src/generate.ts [out dir]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  ATTRIBUTES,
  BEHAVIOURS,
  DESIGN_SECTIONS,
  ELEMENT_TYPES,
  ID_PATTERN,
  META,
  META_KEYS,
  SPEC_VERSION,
  TRIGGERS,
  decisionTreeMarkdown,
  designMdTemplate,
  featureMdTemplate,
} from "@wave/spec";
import { GATE_RULES } from "@wave/figma";
import { createWaveTools } from "@wave/mcp";
import { OPENAPI } from "./openapi";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const out = resolve(process.argv[2] ?? join(root, "packages/wave-docs/reference"));
mkdirSync(out, { recursive: true });

const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\n+/g, " ");
const code = (s: string) => (s ? `\`${cell(s)}\`` : "");
const fence = (lang: string, body: string) => "```" + lang + "\n" + body.trimEnd() + "\n```";
const generated = "_Generated from the code by `@wave/docs`. Do not edit by hand: change the code and generate again._";
const pages: { file: string; title: string }[] = [];

function page(file: string, title: string, body: string) {
  writeFileSync(join(out, file), `# ${title}\n\n${generated}\n\n${body.trim()}\n`);
  pages.push({ file, title });
}

// The HTML spec: attributes, meta tags, destinations ------------------------------------------

{
  const groups = [...new Set(ATTRIBUTES.map((a) => a.group))];
  const parts = [
    `Spec version **${SPEC_VERSION}**. Every attribute is \`data-wave-<key>\`; pages written before the rename used \`data-pi-<key>\`, which Wave still reads.`,
    `An id matches \`${ID_PATTERN.source}\` (\`n_\` and at least four lowercase letters or digits). Ids are never changed or reused: comments, answers and usage are anchored to them.`,
    ...groups.map((g) => {
      const rows = ATTRIBUTES.filter((a) => a.group === g).map((a) => `| \`${a.attr}\` | ${cell(a.description)} | ${code(a.example)} |`);
      return `## ${g[0].toUpperCase()}${g.slice(1)}\n\n| Attribute | Meaning | Example |\n| --- | --- | --- |\n${rows.join("\n")}`;
    }),
    `## Screen meta tags\n\nIn the page's \`<head>\`, as \`<meta name="..." content="...">\`.\n\n| Meta | Key |\n| --- | --- |\n${META_KEYS.map((k) => `| \`${META[k]}\` | ${k} |`).join("\n")}`,
    `## Triggers\n\n${TRIGGERS.map((t) => `\`${t}\``).join(", ")}.`,
    `## Behaviours\n\nWritten in \`data-wave-behavior\`, with their settings in \`data-wave-config\` (\`key:value; key:value\`): ${BEHAVIOURS.map((b) => `\`${b}\``).join(", ")}.`,
    `## Destinations\n\nWhere \`data-wave-to\` and \`data-wave-to-failure\` lead:\n\n| Form | Means |\n| --- | --- |\n| \`screen:<slug>\` | Another screen of the project, by its slug |\n| \`node:<screen>/<slug>\` | An element on a screen (an error summary, a section) |\n| \`modal:<screen>/<slug>\` | Opens a dialog drawn on a screen |\n| \`url:<https address or data path>\` | Leaves the product |\n| \`back\` | The previous screen |\n| \`stay\` | Stays where it is |`,
  ];
  page("html-spec.md", "Wave HTML spec", parts.join("\n\n"));
}

// Element types and what is asked of each -----------------------------------------------------

{
  const groups = [...new Set(Object.values(ELEMENT_TYPES).map((t) => t.group))];
  const list = groups
    .map((g) => `- **${g}**: ${Object.entries(ELEMENT_TYPES).filter(([, t]) => t.group === g).map(([k, t]) => `${t.label} (\`${k}\`)`).join(", ")}`)
    .join("\n");
  page(
    "element-types.md",
    "Element types and questions",
    `Wave detects each element's type (\`data-wave-role\` overrides it) and asks, for each type, the questions below. A question answered by the element's HTML, FEATURE.md, its catalogue component, DESIGN.md or what Wave knows for certain is never asked.\n\n## Types\n\n${list}\n\n${decisionTreeMarkdown()}`,
  );
}

// DESIGN.md and FEATURE.md --------------------------------------------------------------------

page(
  "briefs.md",
  "DESIGN.md and FEATURE.md",
  [
    "Two briefs answer most questions once, for every element that inherits them.",
    `## DESIGN.md\n\nAt the project root (page \`design-md\`). Its sections: ${DESIGN_SECTIONS.map((s) => `**${s}**`).join(", ")}. The template Wave gives a new project:`,
    fence("markdown", designMdTemplate("Example")),
    "## FEATURE.md\n\nIn each feature folder (page `feature-md`): the screens, the fields they write, the data they show and the actions they take. The template:",
    fence("markdown", featureMdTemplate("example-feature", "Example feature")),
  ].join("\n\n"),
);

// The Figma entry gate ------------------------------------------------------------------------

{
  const rows = (sev: string) =>
    Object.entries(GATE_RULES)
      .filter(([, r]) => r.severity === sev)
      .map(([k, r]) => `| \`${k}\` | ${cell(r.title)} | ${cell(r.fix)} |`)
      .join("\n");
  page(
    "figma-entry-gate.md",
    "Figma entry gate rules",
    `What in a Figma file Wave does not take as it is. Blocking items are fixed in Figma and the gate runs again; \`wave-figma convert\` refuses a file that has not passed.\n\n## Blocking\n\n| Rule | What | Fix in Figma |\n| --- | --- | --- |\n${rows("blocking")}\n\n## Advice\n\n| Rule | What | Fix in Figma |\n| --- | --- | --- |\n${rows("advice")}`,
  );
}

// MCP tools -----------------------------------------------------------------------------------

{
  type Prop = { type?: string | string[]; description?: string; enum?: string[]; items?: { type?: string } };
  const typeOf = (p: Prop) => (p.enum ? p.enum.map((e) => `"${e}"`).join(" \\| ") : Array.isArray(p.type) ? p.type.join(" \\| ") : p.type === "array" ? `${p.items?.type ?? "any"}[]` : (p.type ?? "any"));
  const tools = createWaveTools().sort((a, b) => a.name.localeCompare(b.name));
  const body = tools
    .map((t) => {
      const schema = t.inputSchema as { properties?: Record<string, Prop>; required?: string[] };
      const props = Object.entries(schema.properties ?? {});
      const table = props.length
        ? `| Input | Type | Required | Meaning |\n| --- | --- | --- | --- |\n${props.map(([k, p]) => `| \`${k}\` | ${typeOf(p)} | ${(schema.required ?? []).includes(k) ? "yes" : ""} | ${cell(p.description ?? "")} |`).join("\n")}`
        : "No inputs.";
      return `## \`${t.name}\`\n\n${t.description}\n\n${table}`;
    })
    .join("\n\n");
  page(
    "mcp-tools.md",
    "MCP tools",
    `Wave's tools, served by the host's MCP server (in Post-it, \`/api/mcp\` with an MCP token from Settings). An agent acts as the person whose token it holds. ${tools.length} tools:\n\n${tools.map((t) => `\`${t.name}\``).join(", ")}.\n\n${body}`,
  );
}

// Types ---------------------------------------------------------------------------------------

{
  const sources: { title: string; file: string; intro: string }[] = [
    { title: "Parsed mockup", file: "packages/wave-spec/src/parse.ts", intro: "What Wave reads out of a page." },
    { title: "Preflight", file: "packages/wave-spec/src/preflight.ts", intro: "The last check before a screen is saved." },
    { title: "Requirements", file: "packages/wave-spec/src/requirements.ts", intro: "The questions engine: each field, its status and where its answer came from." },
    { title: "Question sheet", file: "packages/wave-spec/src/sheet.ts", intro: "The dry run and the answer sheet." },
    { title: "Briefs", file: "packages/wave-spec/src/briefs.ts", intro: "DESIGN.md and FEATURE.md, parsed." },
    { title: "Catalogue", file: "packages/wave-spec/src/catalogue.ts", intro: "Components, specimens and how an instance matches its component." },
    { title: "Tokens", file: "packages/wave-spec/src/tokens.ts", intro: "A project's DTCG tokens." },
    { title: "Flow", file: "packages/wave-spec/src/flow.ts", intro: "A feature's screens as one graph: destinations, data dictionary, actions, checks." },
    { title: "Destinations", file: "packages/wave-spec/src/destination.ts", intro: "Where an action leads." },
    { title: "Comment anchors", file: "packages/wave-spec/src/anchor.ts", intro: "Where a review comment points." },
    { title: "Assets", file: "packages/wave-spec/src/assets.ts", intro: "Images, fonts and files a page uses." },
    { title: "Handover", file: "packages/wave-spec/src/handover.ts", intro: "What Claude Code builds from once a feature is approved." },
    { title: "Host contract", file: "packages/wave-server/src/host.ts", intro: "What a product implements to host Wave." },
    { title: "Inspector protocol", file: "packages/wave-inspector/src/protocol.ts", intro: "Messages between a mockup frame and the review panel." },
    { title: "Prototype protocol", file: "packages/wave-prototype/src/protocol.ts", intro: "Messages between a prototype frame and its viewer." },
    { title: "Figma conversion", file: "packages/wave-figma/src/gate.ts", intro: "The entry gate's report." },
  ];
  const sections = sources.map(({ title, file, intro }) => {
    const path = join(root, file);
    const src = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
    const decls: string[] = [];
    src.forEachChild((n) => {
      const exported = (ts.canHaveModifiers(n) ? ts.getModifiers(n) : undefined)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
      if (exported && (ts.isTypeAliasDeclaration(n) || ts.isInterfaceDeclaration(n))) decls.push(n.getFullText(src).trim());
    });
    if (!decls.length) return "";
    return `## ${title}\n\n${intro} From \`${relative(root, path)}\`.\n\n${fence("ts", decls.join("\n\n"))}`;
  });
  page("types.md", "Types", `The public types of Wave's packages, as declared.\n\n${sections.filter(Boolean).join("\n\n")}`);
}

// HTTP API: the OpenAPI document, and a page to read it --------------------------------------

{
  writeFileSync(join(out, "openapi.json"), JSON.stringify(OPENAPI, null, 2) + "\n");
  type Op = { summary: string; description?: string; tags?: string[]; security?: unknown[]; parameters?: { name: string; in: string; required?: boolean; description?: string }[]; requestBody?: { content: Record<string, { schema: unknown }> }; responses: Record<string, { description: string }> };
  const schemaName = (s: unknown): string => {
    const o = s as Record<string, unknown>;
    if (!o) return "";
    if (typeof o.$ref === "string") return o.$ref.split("/").pop()!;
    if (o.type === "array") return `${schemaName(o.items)}[]`;
    if (o.type === "object" && o.properties) return `{ ${Object.keys(o.properties as object).join(", ")} }`;
    if (o.oneOf) return (o.oneOf as unknown[]).map(schemaName).join(" or ");
    if (o.allOf) return (o.allOf as unknown[]).map(schemaName).join(" + ");
    return String(o.type ?? "");
  };
  const byTag = new Map<string, string[]>();
  for (const [path, item] of Object.entries(OPENAPI.paths as unknown as Record<string, Record<string, Op>>)) {
    for (const [method, op] of Object.entries(item)) {
      const tag = op.tags?.[0] ?? "Other";
      const params = (op.parameters ?? []).map((p) => `\`${p.name}\` (${p.in}${p.required ? ", required" : ""})${p.description ? `: ${p.description}` : ""}`);
      const req = op.requestBody ? Object.values(op.requestBody.content)[0]?.schema : null;
      const lines = [
        `### \`${method.toUpperCase()} ${path}\``,
        "",
        `${op.summary}.${op.description ? ` ${op.description}` : ""}${op.security && !op.security.length ? " **Public.**" : ""}`,
        ...(params.length ? ["", `Parameters: ${params.join("; ")}.`] : []),
        ...(req ? ["", `Body: \`${schemaName(req)}\`.`] : []),
        "",
        `Responses: ${Object.entries(op.responses).map(([code, r]) => `**${code}** ${r.description}`).join("; ")}.`,
      ];
      byTag.set(tag, [...(byTag.get(tag) ?? []), lines.join("\n")]);
    }
  }
  const tags = (OPENAPI.tags as { name: string; description: string }[]).map((t) => `## ${t.name}\n\n${t.description}\n\n${(byTag.get(t.name) ?? []).join("\n\n")}`);
  const schemas = Object.keys((OPENAPI.components as { schemas: object }).schemas).map((n) => `\`${n}\``).join(", ");
  page(
    "http-api.md",
    "HTTP API",
    `${OPENAPI.info.description}\n\nThe full OpenAPI 3.1 document is the [[reference/openapi|openapi]] page (JSON); import it into any OpenAPI tool. Base URL: \`${OPENAPI.servers[0].url}\`.\n\n${tags.join("\n\n")}\n\n## Schemas\n\n${schemas}. Their fields are in the OpenAPI document; the TypeScript they come from is in [[reference/types|Types]].`,
  );
}

writeFileSync(join(out, "index.json"), JSON.stringify(pages, null, 2) + "\n");
process.stdout.write(pages.map((p) => `${p.file}: ${p.title}`).join("\n") + "\n");
