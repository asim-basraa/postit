import { parseMockup } from "./parse";
import { findOffToken } from "./css";
import { parseTokens } from "./tokens";
import {
  actionCatalog,
  completenessChecks,
  dataDictionary,
  flowGraph,
  screenSlug,
  statesByComponent,
  type FlowScreen,
} from "./flow";
import { SPEC_VERSION } from "./vocabulary";
import type { ZipEntry } from "./zip";

/**
 * The package Claude Code receives for an approved flow.
 *
 * Built only from the frozen revisions an approval recorded, so asking for it
 * again tomorrow gives the same answer even if somebody has edited a screen
 * since. The HTML files are the spec; the Markdown is a reading guide to them.
 */

export type HandoverScreen = {
  pageId: string;
  name: string;
  version: number;
  html: string;
};

export type HandoverDecision = {
  status: "resolved" | "wont_fix";
  screen: string;
  anchor: string;
  body: string;
  note: string | null;
  author: string | null;
};

export type HandoverWaiver = { key: string; message: string; note: string; by: string | null };

export type HandoverInput = {
  flowName: string;
  flowPath: string;
  approvedBy: string | null;
  approvedAt: string;
  screens: HandoverScreen[];
  tokens: { name: string; version: number; json: string } | null;
  decisions: HandoverDecision[];
  waivers: HandoverWaiver[];
};

export type Handover = {
  markdown: string;
  json: Record<string, unknown>;
  files: ZipEntry[];
};

function table(head: string[], rows: string[][]): string {
  if (rows.length === 0) return "_None._";
  const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${head.join(" | ")} |`,
    `| ${head.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}

export function buildHandover(input: HandoverInput): Handover {
  const tokenSet = input.tokens ? parseTokens(input.tokens.json) : null;

  const flow: FlowScreen[] = input.screens.map((s) => {
    const parsed = parseMockup(s.html);
    return {
      pageId: s.pageId,
      name: s.name,
      path: s.name,
      meta: parsed.screen,
      nodes: parsed.nodes,
      offToken: tokenSet ? findOffToken(parsed.css, tokenSet) : null,
      unidentifiedInteractive: parsed.unidentifiedInteractive,
    };
  });

  const dictionary = dataDictionary(flow);
  const actions = actionCatalog(flow);
  const graph = flowGraph(flow);
  const states = statesByComponent(flow);
  const waivedKeys = new Set(input.waivers.map((w) => w.key));
  const outstanding = completenessChecks(flow).filter((c) => !waivedKeys.has(c.key));

  const fileFor = (s: FlowScreen) => `screens/${screenSlug(s)}.html`;

  const md: string[] = [];
  md.push(`# Handover: ${input.flowName}`);
  md.push("");
  md.push(
    `Approved${input.approvedBy ? ` by ${input.approvedBy}` : ""} on ${input.approvedAt}. Mockup spec vocabulary v${SPEC_VERSION}.`,
  );
  md.push("");
  md.push("## How to read this");
  md.push("");
  md.push(
    [
      "Each screen is a self-contained HTML file and is the source of truth. Everything below is derived from its `data-pi-*` attributes and `pi:` meta tags:",
      "",
      "- `data-pi-id` / `data-pi-slug`: stable identity; address nodes as `screen-slug/node-slug`.",
      "- `data-pi-component` / `data-pi-variant`: the design-system component to build it with.",
      "- `data-pi-content=\"dynamic\"` + `data-pi-bind`: the text comes from that resource path (`data-pi-sample` is the example shown, `data-pi-empty` the fallback, `data-pi-format` the formatting). A `<span>` with a binding marks a dynamic word inside static copy.",
      "- `data-pi-repeat` + `data-pi-item`: a list rendered from a resource, with the item template.",
      "- `data-pi-action`, `data-pi-trigger`, `data-pi-effect`, `data-pi-to`, `data-pi-to-failure`: what a control does, the side effects it causes, and where it leads on success and failure.",
      "- `data-pi-field` + `data-pi-validate`: what an input writes and its validation.",
      "- `data-pi-states`, `data-pi-state-of` + `data-pi-state`: the states a component has, and elements depicting a node in a state (hidden by default).",
      "- `data-pi-visible-if`: when a node is shown.",
      "",
      "Animations are out of scope. Build with the tokens in `tokens.json`; values flagged off-token below were accepted as literals.",
    ].join("\n"),
  );
  md.push("");

  md.push("## Screens");
  md.push("");
  md.push(
    table(
      ["Screen", "Title", "Route", "File", "Version"],
      flow.map((s, i) => [
        screenSlug(s),
        s.meta.title || s.meta.documentTitle || s.name,
        s.meta.route ?? "",
        fileFor(s),
        String(input.screens[i].version),
      ]),
    ),
  );
  md.push("");

  md.push("## Flow");
  md.push("");
  md.push("```mermaid");
  md.push(graph.mermaid);
  md.push("```");
  md.push("");

  md.push("## Data dictionary");
  md.push("");
  md.push(
    table(
      ["Resource", "Type", "Source", "Description", "Used on"],
      dictionary.map((d) => [
        `\`${d.path}\``,
        d.type ?? "",
        d.source ?? "",
        d.description ?? "",
        d.usages.map((u) => `${u.screen}/${u.slug ?? u.pid} (${u.kind})`).join(", "),
      ]),
    ),
  );
  md.push("");

  md.push("## Actions");
  md.push("");
  md.push(
    table(
      ["Action", "Trigger", "Fired from", "Side effects", "On success", "On failure"],
      actions.map((a) => [
        `\`${a.name}\``,
        a.triggers.join(", "),
        a.sources.map((s) => `${s.screen}/${s.slug ?? s.pid}`).join(", "),
        a.effects.map((e) => `\`${e}\``).join(", "),
        a.to.join(", "),
        a.toFailure.join(", "),
      ]),
    ),
  );
  md.push("");

  md.push("## Component states");
  md.push("");
  md.push(
    table(
      ["Component", "States", "Nodes"],
      states.map((c) => [
        c.component,
        c.states.join(", "),
        c.nodes.map((n) => `${n.screen}/${n.slug ?? n.pid}${n.depicted.length ? ` (shows ${n.depicted.join(", ")})` : ""}`).join("; "),
      ]),
    ),
  );
  md.push("");

  md.push("## Decisions from review");
  md.push("");
  md.push(
    table(
      ["Outcome", "Where", "Comment", "Resolution"],
      input.decisions.map((d) => [
        d.status === "wont_fix" ? "Won't fix" : "Resolved",
        `${d.screen} ${d.anchor}`.trim(),
        d.body,
        d.note ?? "",
      ]),
    ),
  );
  md.push("");

  md.push("## Accepted gaps");
  md.push("");
  md.push(
    table(
      ["Check", "Waiver note"],
      input.waivers.map((w) => [w.message, w.note]),
    ),
  );
  if (outstanding.length > 0) {
    md.push("");
    md.push("Not waived, and still true of the approved mockups (ask before assuming):");
    md.push("");
    for (const c of outstanding) md.push(`- ${c.screen}: ${c.message}`);
  }
  md.push("");

  const markdown = md.join("\n");

  const json = {
    flow: { name: input.flowName, path: input.flowPath, approvedBy: input.approvedBy, approvedAt: input.approvedAt },
    specVersion: SPEC_VERSION,
    screens: flow.map((s, i) => ({
      slug: screenSlug(s),
      name: s.name,
      title: s.meta.title,
      route: s.meta.route,
      version: input.screens[i].version,
      file: fileFor(s),
      nodes: s.nodes,
    })),
    tokens: input.tokens ? { name: input.tokens.name, version: input.tokens.version, file: "tokens.json" } : null,
    dataDictionary: dictionary,
    actions,
    flowGraph: { mermaid: graph.mermaid, edges: graph.edges },
    states,
    decisions: input.decisions,
    waivers: input.waivers,
    outstandingChecks: outstanding,
  };

  const files: ZipEntry[] = [
    { name: "HANDOVER.md", content: markdown },
    { name: "handover.json", content: JSON.stringify(json, null, 2) },
    ...flow.map((s, i) => ({ name: fileFor(s), content: input.screens[i].html })),
  ];
  if (input.tokens) files.push({ name: "tokens.json", content: input.tokens.json });

  return { markdown, json, files };
}
