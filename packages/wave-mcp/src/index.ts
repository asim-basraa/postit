import {
  applyAnswersToDraft,
  catalogueOverview,
  contextFor,
  describeFindings,
  dryRunFeature,
  ensureVersion,
  flowHandover,
  parseSheet,
  preflightDraft,
  screenReport,
  type WaveHost,
} from "@wave/server";
import { assignIds, extractComponent, parseMockup, upgradePrefix, type CommentAnchor, type Requirement } from "@wave/spec";

/**
 * Wave's tools for agents: what Claude Design needs to pick up feedback and
 * say it is dealt with, and what Claude Code needs to build an approved flow.
 *
 * Plain definitions (name, description, JSON schema, run), so a host adds them
 * to whatever MCP server it already runs. run takes the WaveHost for the
 * agent's session: the agent acts as the person whose token it holds.
 */

export type WaveToolResult = { text: string } | { error: string };

export type WaveTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(host: WaveHost, args: Record<string, unknown>): Promise<WaveToolResult>;
};

const text = (t: string): WaveToolResult => ({ text: t });

/** Where a comment points, in words an agent can act on in its own source. */
export function describeAnchorForAgent(a: CommentAnchor): string {
  switch (a.kind) {
    case "node":
      return `node data-wave-id="${a.pid}"${a.slug ? ` (slug ${a.slug})` : ""}${a.text ? `, text "${a.text.slice(0, 120)}"` : ""}`;
    case "range":
      return `the words "${a.quote}" (characters ${a.start}-${a.end} of the text) inside data-wave-id="${a.pid}"${a.slug ? ` (slug ${a.slug})` : ""}`;
    case "region":
      return `an area ${Math.round(a.rect.w)}x${Math.round(a.rect.h)}px at x=${Math.round(a.rect.x)}, y=${Math.round(a.rect.y)} of the page at ${a.viewport}px wide${a.covered?.length ? `, covering ${a.covered.join(", ")}` : ""}`;
    case "element":
      return `an element with no data-wave-id: <${a.fingerprint.tag}>${a.fingerprint.text ? ` "${a.fingerprint.text.slice(0, 80)}"` : ""}${a.fingerprint.classes ? ` class="${a.fingerprint.classes}"` : ""}${a.fingerprint.ancestor ? ` inside data-wave-id="${a.fingerprint.ancestor}"` : ""} (selector ${a.selector})`;
  }
}

const markAddressed: WaveTool = {
  name: "mark_addressed",
  description:
    "Mark a comment on your screen as addressed, after publishing the version that fixes it. Give the version number the save returned and one or two sentences on what changed. Only the screen's author can do this; a reviewer then confirms it resolved or reopens it.",
  inputSchema: {
    type: "object",
    properties: {
      comment_id: { type: "string" },
      version: { type: "number", description: "The screen version that addresses it." },
      note: { type: "string", description: "What changed, briefly." },
    },
    required: ["comment_id", "version", "note"],
    additionalProperties: false,
  },
  async run(host, args) {
    const id = String(args.comment_id ?? "");
    const version = Number(args.version);
    const note = String(args.note ?? "").trim();
    if (!id || !Number.isInteger(version) || !note) return { error: "comment_id, version and note are all required." };
    if (!host.comments.setStatus) return { error: "This host does not let agents change a comment's status." };
    const r = await host.comments.setStatus(id, "addressed", note.slice(0, 2000), version);
    return r.ok ? text(`Marked addressed in version ${version}.`) : { error: r.error };
  },
};

const setFlow: WaveTool = {
  name: "set_flow",
  description:
    "Mark an existing folder as a flow (or stop it being one). A flow's HTML screens are one journey, reviewed and approved together and handed over with get_handover.",
  inputSchema: {
    type: "object",
    properties: { id: { type: "string", description: "The folder." }, flow: { type: "boolean" } },
    required: ["id", "flow"],
    additionalProperties: false,
  },
  async run(host, args) {
    const id = String(args.id ?? "");
    const flow = await host.resources.flow(id);
    if (!flow) return { error: "Not found." };
    const r = await host.resources.setFlow(id, args.flow === true);
    return r.ok ? text(`${flow.name} is ${args.flow === true ? "now" : "no longer"} a flow.`) : { error: r.error };
  },
};

const checkScreen: WaveTool = {
  name: "check_screen",
  description:
    "What Wave reads out of one uploaded HTML screen at its current version: its screen meta, every mandatory field still missing (with question ids and proposals), and every validation finding. Use after saving a screen to see what is left to fix.",
  inputSchema: {
    type: "object",
    properties: { screen_id: { type: "string" } },
    required: ["screen_id"],
    additionalProperties: false,
  },
  async run(host, args) {
    const screen = await host.resources.screen(String(args.screen_id ?? ""));
    if (!screen) return { error: "Not found." };
    const v = await ensureVersion(host, screen);
    if (!v) return { error: "Could not read that screen." };
    const report = await screenReport(host, screen);
    const ctx = await contextFor(host, screen.id);
    const meta = Object.entries(v.screen)
      .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
      .map(([k, value]) => `${k}: ${value}`);
    return text(
      [
        `# ${screen.name}, version ${screen.content_version}${ctx ? ` (project ${ctx.project.name})` : ""}`,
        "",
        ...meta,
        `nodes with an id: ${v.nodes.length}`,
        report ? `Requirements: ${report.counts.mandatoryOpen} mandatory open, ${report.counts.recommendedOpen} recommended open, ${report.counts.waived} waived, ${report.counts.answered} answered.` : "",
        ...(report ? listOpen(report.requirements) : []),
        "",
        describeFindings(v.findings),
      ].join("\n"),
    );
  },
};

const getHandover: WaveTool = {
  name: "get_handover",
  description:
    "Everything needed to build an approved flow of mockups: screens with routes, the flow graph (Mermaid), data dictionary, action catalog with side effects and destinations, component states, decisions from review and accepted gaps, as Markdown. Each screen's HTML is the source of truth for its markup and data-wave-* attributes: fetch it with get_handover_screen, or pass include_html to have them all appended. Refuses, listing what is blocking, if the flow is not approved.",
  inputSchema: {
    type: "object",
    properties: {
      flow_id: { type: "string", description: "The flow's id." },
      include_html: { type: "boolean", description: "Append every screen's HTML and the token JSON. Can be long." },
    },
    required: ["flow_id"],
    additionalProperties: false,
  },
  async run(host, args) {
    const result = await flowHandover(host, String(args.flow_id ?? ""));
    if (!result.ok) return { error: [result.error, ...(result.blockers ?? []).map((b) => `- ${b}`)].join("\n") };
    const files = result.handover.files.filter((f) => f.name.startsWith("screens/") || f.name === "tokens.json");
    const parts = [
      result.handover.markdown,
      "",
      "## Files",
      "",
      ...files.map((f) => `- ${f.name}`),
      "",
      `Fetch one with get_handover_screen (flow_id ${result.flow.id}, screen = the file's slug).`,
    ];
    if (args.include_html === true) {
      for (const f of files) {
        parts.push("", `## ${f.name}`, "", "```" + (f.name.endsWith(".json") ? "json" : "html"), String(f.content), "```");
      }
    }
    return text(parts.join("\n"));
  },
};

const getHandoverScreen: WaveTool = {
  name: "get_handover_screen",
  description:
    "One screen's HTML exactly as approved (or tokens.json), from an approved flow's handover. The data-wave-* attributes on its elements are the spec (older files may use data-pi-*, which mean the same).",
  inputSchema: {
    type: "object",
    properties: {
      flow_id: { type: "string" },
      screen: { type: "string", description: "The screen slug, as listed by get_handover, or 'tokens'." },
    },
    required: ["flow_id", "screen"],
    additionalProperties: false,
  },
  async run(host, args) {
    const result = await flowHandover(host, String(args.flow_id ?? ""));
    if (!result.ok) return { error: result.error };
    const want = String(args.screen ?? "").replace(/^screens\//, "").replace(/\.html$/, "");
    const file = result.handover.files.find((f) => (want === "tokens" ? f.name === "tokens.json" : f.name === `screens/${want}.html`));
    return file ? text(String(file.content)) : { error: `No ${want} in this handover.` };
  },
};

function listOpen(reqs: Requirement[], limit = 60): string[] {
  const open = reqs.filter((r) => r.level === "mandatory" && (r.status === "missing" || r.status === "proposed"));
  return [
    ...open.slice(0, limit).map((r) => `- \`${r.qid}\` ${r.label}: ${r.question}${r.proposal ? ` Proposed: ${r.proposal.value} (${r.proposal.reason}).` : ""}`),
    ...(open.length > limit ? [`- …and ${open.length - limit} more.`] : []),
  ];
}

const htmlArg = { type: "string", description: "The screen's complete HTML." };
const nameArg = { type: "string", description: "The screen's name, e.g. 'Delivery address'." };
const targetArg = { type: "string", description: "The feature (flow) or project id the screen belongs to, so it is checked against the project's tokens, catalogue and assets." };

const assignIdsTool: WaveTool = {
  name: "wave_assign_ids",
  description:
    "Gives every element of a draft screen that needs an identity a data-wave-id (headings, text, controls, images, sections, lists, and the first item of each list). Existing ids are kept. Run it before the first dry run so every question and answer stays attached to the same element. Returns the new HTML.",
  inputSchema: { type: "object", properties: { html: htmlArg }, required: ["html"], additionalProperties: false },
  async run(_host, args) {
    const r = assignIds(String(args.html ?? ""));
    return text(`Added ${r.added} id${r.added === 1 ? "" : "s"}.\n\n${r.html}`);
  },
};

const upgradeTool: WaveTool = {
  name: "wave_upgrade_prefix",
  description: "Rewrites a file's older data-pi-* / pi: names to data-wave-* / wave:, changing nothing else. Returns the new HTML.",
  inputSchema: { type: "object", properties: { html: htmlArg }, required: ["html"], additionalProperties: false },
  async run(_host, args) {
    const r = upgradePrefix(String(args.html ?? ""));
    return text(`Renamed ${r.changed} name${r.changed === 1 ? "" : "s"}.\n\n${r.html}`);
  },
};

const dryRunTool: WaveTool = {
  name: "wave_dry_run",
  description:
    "Runs Wave over draft screens for a feature without uploading anything, and returns the question sheet: every mandatory and recommended question per element, what Wave already worked out (to confirm), and which answers are missing or invalid. The sheet is saved in the feature folder as 'Wave questions' so product can fill it in; pass it back (or leave sheet empty to use the saved one) to run again. When everything mandatory is answered or waived, it also saves 'Wave answers', which wave_apply_answers applies.",
  inputSchema: {
    type: "object",
    properties: {
      feature_id: { type: "string", description: "The feature (flow) folder the screens are for." },
      screens: { type: "array", items: { type: "object", properties: { name: nameArg, html: htmlArg }, required: ["name", "html"] } },
      sheet: { type: "string", description: "Optional: the question sheet with answers filled in. Defaults to the one saved in the feature." },
    },
    required: ["feature_id", "screens"],
    additionalProperties: false,
  },
  async run(host, args) {
    const screens = Array.isArray(args.screens) ? (args.screens as { name?: unknown; html?: unknown }[]) : [];
    if (!screens.length || screens.some((s) => typeof s.html !== "string")) return { error: "screens: [{name, html}] is required." };
    const r = await dryRunFeature(
      host,
      String(args.feature_id ?? ""),
      screens.map((s) => ({ name: String(s.name ?? "screen"), html: String(s.html) })),
      typeof args.sheet === "string" && args.sheet.trim() ? args.sheet : null,
    );
    if ("error" in r) return { error: r.error };
    const c = r.counts;
    return text(
      [
        `Dry run ${r.run}: ${r.pass ? "PASSES" : "not yet"}. ${c.mandatoryOpen} mandatory open, ${c.recommendedOpen} recommended open, ${c.invalid} answers to fix, ${c.waived} waived.`,
        r.written.questions ? `Saved the question sheet in the feature folder ("Wave questions", id ${r.written.questions}).` : "",
        r.written.answers ? `Saved the answer sheet ("Wave answers", id ${r.written.answers}).` : "",
        "",
        r.sheet,
      ].filter(Boolean).join("\n"),
    );
  },
};

const applyAnswersTool: WaveTool = {
  name: "wave_apply_answers",
  description:
    "Writes answers into a draft screen's HTML as data-wave-* attributes, meta tags, native attributes (alt, type, aria-label) and the resources block, byte-exact. Answers come from an answer or question sheet (sheet) or a map of question id to answer (answers); 'waive: <reason>' records a waiver. Returns the new HTML, what was applied and skipped, and what is still open.",
  inputSchema: {
    type: "object",
    properties: {
      target: targetArg,
      name: nameArg,
      html: htmlArg,
      sheet: { type: "string", description: "An answer or question sheet." },
      answers: { type: "object", additionalProperties: { type: "string" }, description: "Question id to answer." },
    },
    required: ["name", "html"],
    additionalProperties: false,
  },
  async run(host, args) {
    const answers =
      typeof args.sheet === "string"
        ? parseSheet(args.sheet)
        : new Map(Object.entries((args.answers ?? {}) as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [string, string][]);
    const r = await applyAnswersToDraft(host, typeof args.target === "string" ? args.target : null, { name: String(args.name ?? "screen"), html: String(args.html ?? "") }, answers);
    return text(
      [
        `Applied ${r.applied.length}; skipped ${r.skipped.length}. Still open: ${r.report.counts.mandatoryOpen} mandatory, ${r.report.counts.recommendedOpen} recommended.`,
        ...r.skipped.map((x) => `- skipped \`${x.qid}\`: ${x.reason}`),
        ...listOpen(r.report.requirements, 30),
        "",
        r.html,
      ].join("\n"),
    );
  },
};

const preflightTool: WaveTool = {
  name: "preflight_html",
  description:
    "The last check before uploading a screen: things that make it look or behave differently in Wave (scripts using storage, pages built by scripts, local files), assets not hosted in the project, style values that are not tokens, components that differ from the catalogue, and every mandatory field still open. Upload only when it passes, and show the designer the result.",
  inputSchema: { type: "object", properties: { target: targetArg, name: nameArg, html: htmlArg }, required: ["name", "html"], additionalProperties: false },
  async run(host, args) {
    const r = await preflightDraft(host, typeof args.target === "string" ? args.target : null, { name: String(args.name ?? "screen"), html: String(args.html ?? "") });
    return text(
      [
        `Preflight for ${r.screen}: ${r.pass ? "PASSES" : "does not pass"}. ${r.counts.mandatoryOpen} mandatory open, ${r.counts.recommendedOpen} recommended open, ${r.counts.waived} waived.`,
        ...r.issues.map((i) => `- [${i.level}] ${i.code}: ${i.message}`),
        ...listOpen(r.open),
      ].join("\n"),
    );
  },
};

const uploadAssetTool: WaveTool = {
  name: "upload_asset",
  description:
    "Uploads an image (PNG, JPEG, GIF, WebP, AVIF, SVG, ICO) or font (WOFF2, WOFF, TTF, OTF) to the project's public asset store, up to 10 MB. Identical files are stored once. Returns the public address to use in the HTML. No video. Links to other websites can stay as they are.",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "The project, or any feature or screen in it." },
      name: { type: "string", description: "The file's name, e.g. logo.svg." },
      data_base64: { type: "string", description: "The file's bytes, base64 (a data: URL works too)." },
    },
    required: ["project_id", "name", "data_base64"],
    additionalProperties: false,
  },
  async run(host, args) {
    if (!host.assets || !host.projects) return { error: "This host has no asset store." };
    const project = await host.projects.projectOf(String(args.project_id ?? ""));
    if (!project) return { error: "Not found, or not inside a project." };
    let bytes: Uint8Array;
    try {
      bytes = Uint8Array.from(atob(String(args.data_base64 ?? "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
    } catch {
      return { error: "data_base64 is not valid base64." };
    }
    const r = await host.assets.put(project.id, String(args.name ?? "asset"), bytes);
    if (!r.ok) return { error: r.error };
    return text(`${r.existing ? "Already uploaded" : "Uploaded"}: ${r.asset.url} (${r.asset.mime}, ${Math.round(r.asset.bytes / 1024)} KB)`);
  },
};

const catalogueTool: WaveTool = {
  name: "get_catalogue",
  description:
    "The project's design system: every component with its variants, states, status and specimen page (read it with read_page to copy its markup exactly), the token file's summary and problems, uploaded assets, and which screens use what. Use it before designing, so screens reuse catalogue components exactly.",
  inputSchema: { type: "object", properties: { project_id: { type: "string", description: "The project, or any feature or screen in it." } }, required: ["project_id"], additionalProperties: false },
  async run(host, args) {
    if (!host.projects) return { error: "This host has no projects." };
    const project = await host.projects.projectOf(String(args.project_id ?? ""));
    if (!project) return { error: "Not found, or not inside a project." };
    const o = await catalogueOverview(host, project.id);
    if (!o) return { error: "Not found." };
    const lines = [
      `# ${o.project.name} (project ${o.project.id})`,
      "",
      `## Tokens: ${o.tokens.count}${o.tokens.pageId ? ` (page ${o.tokens.pageId})` : " (no token file yet: create design-system/tokens as a DTCG JSON page, dimensions in rem)"}`,
      Object.entries(o.tokens.typeCounts).map(([k, v]) => `${k}: ${v}`).join(", "),
      ...o.tokens.problems.slice(0, 30).map((p) => `- problem${p.path ? ` at ${p.path}` : ""}: ${p.message}`),
      "",
      `## Components (${o.components.length})`,
      ...o.components.map(
        (c) =>
          `- **${c.name}** (${c.type ?? "?"}, ${c.status}) variants: ${c.variants.join(", ")}; states: ${c.states.join(", ") || "none"}; specimen: ${c.pagePath} (id ${c.pageId}); used ${c.usage.length}×${c.usage.some((u) => u.status === "drift") ? `, ${c.usage.filter((u) => u.status === "drift").length} drifted` : ""}${c.problems.length ? `; problems: ${c.problems.join(" ")}` : ""}`,
      ),
      ...(o.unknown.length ? ["", "## Used on screens but not in the catalogue", ...o.unknown.map((u) => `- ${u.component}: ${u.usage.map((x) => x.address).join(", ")}`)] : []),
      "",
      `## Assets (${o.assets.length})`,
      ...o.assets.slice(0, 80).map((a) => `- ${a.name || a.hash.slice(0, 8)}: ${a.url} (${a.mime}) used on ${a.usedBy.map((u) => u.screen).join(", ") || "nothing yet"}`),
      "",
      `## Screens (${o.screens.length})`,
      ...o.screens.map((s) => `- ${s.slug} (${s.name}, id ${s.id}): ${s.mandatoryOpen} mandatory open`),
    ];
    return text(lines.join("\n"));
  },
};

const extractTool: WaveTool = {
  name: "wave_extract_component",
  description:
    "Makes a catalogue specimen page for a new component from an element on a screen (its markup, its CSS rules and the token variables they use), after the designer has confirmed it is new. Upload the returned HTML into the project's design-system/components folder (the folder id is given). Then draw its other variants and states on the specimen.",
  inputSchema: {
    type: "object",
    properties: {
      target: targetArg,
      html: htmlArg,
      pid: { type: "string", description: "The data-wave-id of the element." },
      name: { type: "string", description: "The component's name, e.g. Button." },
      type: { type: "string", description: "The element type, e.g. button, textInput, card." },
      variant: { type: "string" },
      description: { type: "string" },
      states: { type: "array", items: { type: "string" } },
    },
    required: ["html", "pid", "name", "type", "description"],
    additionalProperties: false,
  },
  async run(host, args) {
    const html = String(args.html ?? "");
    const r = extractComponent(html, parseMockup(html), String(args.pid ?? ""), {
      name: String(args.name ?? ""),
      type: String(args.type ?? ""),
      variant: typeof args.variant === "string" ? args.variant : undefined,
      description: String(args.description ?? ""),
      states: Array.isArray(args.states) ? args.states.map(String) : undefined,
    });
    if (!r.ok) return { error: r.error };
    let folder = "";
    if (typeof args.target === "string" && host.projects) {
      const project = await host.projects.projectOf(args.target);
      const f = project ? await host.projects.componentsFolder(project.id) : null;
      if (f) folder = `Upload it into ${f.path} (parent_id ${f.id}) as "${String(args.name)}".\n\n`;
    }
    return text(`${folder}${r.html}`);
  },
};

const setProjectTool: WaveTool = {
  name: "set_project",
  description:
    "Marks a folder as a project (or stops it being one). A project holds its design system (design-system/tokens and design-system/components, created for you) and its features, which are flows inside it. Screen slugs must be unique within a project.",
  inputSchema: { type: "object", properties: { id: { type: "string" }, project: { type: "boolean" } }, required: ["id", "project"], additionalProperties: false },
  async run(host, args) {
    if (!host.projects) return { error: "This host has no projects." };
    const r = await host.projects.setProject(String(args.id ?? ""), args.project === true);
    if (!r.ok) return { error: r.error };
    const f = args.project === true ? await host.projects.componentsFolder(String(args.id)) : null;
    return text(args.project === true ? `It is now a project. Components go in ${f?.path ?? "design-system/components"}; the DTCG token file is design-system/tokens.` : "It is no longer a project.");
  },
};

/** Every Wave tool. A host may leave some out, or wrap them with its own lookups. */
export function createWaveTools(): WaveTool[] {
  return [
    markAddressed,
    setFlow,
    setProjectTool,
    checkScreen,
    getHandover,
    getHandoverScreen,
    assignIdsTool,
    upgradeTool,
    dryRunTool,
    applyAnswersTool,
    preflightTool,
    uploadAssetTool,
    catalogueTool,
    extractTool,
  ];
}
