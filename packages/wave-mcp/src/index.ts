import { describeFindings, ensureVersion, flowHandover, type WaveHost } from "@wave/server";
import type { CommentAnchor } from "@wave/spec";

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
    "What Wave reads out of one HTML screen at its current version: its screen meta, how many nodes carry a data-wave-id, and every validation finding (missing ids, duplicate slugs, unknown attributes, bad destinations, legacy data-pi-* names). Use after saving a screen to see what is left to fix.",
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
    const meta = Object.entries(v.screen)
      .filter(([, value]) => value !== null && value !== undefined && typeof value !== "object")
      .map(([k, value]) => `${k}: ${value}`);
    return text(
      [`# ${screen.name}, version ${screen.content_version}`, "", ...meta, `nodes with an id: ${v.nodes.length}`, "", describeFindings(v.findings)].join("\n"),
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

/** Every Wave tool. A host may leave some out, or wrap them with its own lookups. */
export function createWaveTools(): WaveTool[] {
  return [markAddressed, setFlow, checkScreen, getHandover, getHandoverScreen];
}
