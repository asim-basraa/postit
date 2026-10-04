import {
  applyAnswersToDraft,
  catalogueOverview,
  writeDesignSystemPage,
  contextFor,
  describeFindings,
  dryRunFeature,
  ensureVersion,
  flowHandover,
  parseSheet,
  preflightDraft,
  draftFeatureApi,
  prototypeOf,
  projectPrototypeOf,
  screenUsage,
  describeUsage,
  useScreen,
  unuseScreen,
  reopenFlow,
  publishFlow,
  readDesignBrief,
  readFeatureBrief,
  saveDesignBrief,
  saveFeatureBrief,
  saveFeatureApi,
  screenReport,
  writeFlowFeature,
  readFlowFeature,
  type WaveHost,
} from "@wave/server";
import { assignIds, assignTestIds, extractComponent, parseMockup, upgradePrefix, type CommentAnchor, type Requirement } from "@wave/spec";

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
        ...usageLines(screen.name, await screenUsage(host, screen.id), screen.content_version),
        "",
        describeFindings(v.findings),
      ].join("\n"),
    );
  },
};

function usageLines(name: string, uses: Awaited<ReturnType<typeof screenUsage>>, current: number): string[] {
  const lines = describeUsage(name, uses, current);
  return lines.length ? ["", ...lines] : [];
}

const useScreenTool: WaveTool = {
  name: "wave_use_screen",
  description:
    "Adds a screen that lives in another feature of the same project to this feature, so both show the same screen (one identity, one address, one version history). Changing it later makes a new version: features approved and locked at an older version keep theirs, open ones show the new one. Refused while this feature is locked.",
  inputSchema: {
    type: "object",
    properties: { feature_id: { type: "string" }, screen_id: { type: "string" }, remove: { type: "boolean", description: "true to stop using it." } },
    required: ["feature_id", "screen_id"],
    additionalProperties: false,
  },
  async run(host, args) {
    const flowId = String(args.feature_id ?? "");
    const screenId = String(args.screen_id ?? "");
    if (args.remove === true) {
      const r = await unuseScreen(host, flowId, screenId);
      return r.ok ? text("Removed from this feature. The screen itself is unchanged.") : { error: r.error };
    }
    const r = await useScreen(host, flowId, screenId);
    if (!r.ok) return { error: r.error };
    const screen = await host.resources.screen(screenId);
    return text(["Added.", ...usageLines(screen?.name ?? screenId, r.usage, screen?.content_version ?? 0)].join("\n"));
  },
};

const screenUsageTool: WaveTool = {
  name: "wave_screen_usage",
  description:
    "Which features show a screen (where it lives, which use it) and which of them are approved and locked at which version. Call it before changing a screen: say to the engineer what the change does to each feature, then make the change on top of the latest version.",
  inputSchema: { type: "object", properties: { screen_id: { type: "string" } }, required: ["screen_id"], additionalProperties: false },
  async run(host, args) {
    const screen = await host.resources.screen(String(args.screen_id ?? ""));
    if (!screen) return { error: "Not found." };
    const uses = await screenUsage(host, screen.id);
    const lines = describeUsage(screen.name, uses, screen.content_version);
    return text(lines.length ? lines.join("\n") : `${screen.name} is shown by ${uses.length ? uses[0].flow.name + " only, which is not locked" : "no feature"}. Changing it affects nothing else.`);
  },
};

const reopenFlowTool: WaveTool = {
  name: "wave_reopen_flow",
  description:
    "Unlocks an approved feature so its screens show their latest versions again (and screens can be added or removed). It needs approving again afterwards. Only when the engineer or designer asks to change an approved feature itself; a new feature that changes a shared screen does not need it.",
  inputSchema: { type: "object", properties: { feature_id: { type: "string" } }, required: ["feature_id"], additionalProperties: false },
  async run(host, args) {
    const r = await reopenFlow(host, String(args.feature_id ?? ""));
    return r.ok ? text("Reopened. The feature follows its screens' latest versions until it is approved again.") : { error: r.error };
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
    "Gives every element of a draft screen that needs an identity a data-wave-id (headings, text, controls, images, sections, lists, and the first item of each list), and, with screen, a data-testid to the screen's root, each section and each design-system component (<screen>.<sections>.<DS id>.<label>). Existing ids are kept. Run it before the first dry run so every question and answer stays attached to the same element. Returns the new HTML.",
  inputSchema: {
    type: "object",
    properties: { html: htmlArg, screen: { type: "string", description: "Optional: the screen's slug (about-you). Without it, the screen's wave:screen meta; without either, no test ids." } },
    required: ["html"],
    additionalProperties: false,
  },
  async run(_host, args) {
    const r = assignIds(String(args.html ?? ""));
    const screen = typeof args.screen === "string" && args.screen.trim() ? args.screen.trim() : parseMockup(r.html).screen.screen?.trim() || null;
    const t = screen ? assignTestIds(r.html, screen) : null;
    const said = `Added ${r.added} id${r.added === 1 ? "" : "s"}${t ? ` and ${t.added} test id${t.added === 1 ? "" : "s"}` : ""}.`;
    const problems = t?.problems.length ? `\n\nTest ids the design has to settle:\n${t.problems.map((p) => `- ${p.message}`).join("\n")}` : "";
    return text(`${said}${problems}\n\n${t ? t.html : r.html}`);
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

/** Hosts upload_asset may fetch from: font and design-tool CDNs, never anything internal. */
const ASSET_HOSTS = [/^fonts\.gstatic\.com$/, /^www\.figma\.com$/, /^(s3-)?[a-z0-9-]*\.?figma\.com$/, /^figma-alpha-api\.s3\.[a-z0-9-]+\.amazonaws\.com$/, /^cdn\.jsdelivr\.net$/, /^raw\.githubusercontent\.com$/, /^unpkg\.com$/];
const MAX_ASSET = 10 * 1024 * 1024;

/** Fetches a public file from an allowed host, following at most three redirects, each checked. */
export async function fetchAsset(raw: string): Promise<{ ok: true; bytes: Uint8Array; name: string } | { ok: false; error: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "url is not a valid address." };
  }
  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || url.username || url.password || url.port) return { ok: false, error: "Only plain https addresses can be fetched." };
    if (!ASSET_HOSTS.some((re) => re.test(url.hostname))) return { ok: false, error: `${url.hostname} is not a host assets are fetched from (fonts.gstatic.com, figma.com, cdn.jsdelivr.net, raw.githubusercontent.com, unpkg.com). Send the bytes as data_base64 instead.` };
    let res: Response;
    try {
      res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(20_000) });
    } catch (e) {
      return { ok: false, error: `Could not fetch ${url.hostname}: ${(e as Error).message}` };
    }
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) return { ok: false, error: "The address redirects nowhere." };
      url = new URL(next, url);
      continue;
    }
    if (!res.ok || !res.body) return { ok: false, error: `${url.hostname} answered ${res.status}.` };
    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > MAX_ASSET) return { ok: false, error: "The file is over 10 MB." };
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_ASSET) {
        await reader.cancel();
        return { ok: false, error: "The file is over 10 MB." };
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let at = 0;
    for (const c of chunks) {
      bytes.set(c, at);
      at += c.byteLength;
    }
    return { ok: true, bytes, name: decodeURIComponent(url.pathname.split("/").pop() || "asset") };
  }
  return { ok: false, error: "Too many redirects." };
}

const uploadAssetTool: WaveTool = {
  name: "upload_asset",
  description:
    "Uploads an image (PNG, JPEG, GIF, WebP, AVIF, SVG, ICO) or font (WOFF2, WOFF, TTF, OTF) to the project's public asset store, up to 10 MB. Identical files are stored once. Returns the public address to use in the HTML. No video. Links to other websites can stay as they are. Give the bytes as data_base64, or a url for the server to fetch (https, from fonts.gstatic.com, figma.com, cdn.jsdelivr.net, raw.githubusercontent.com or unpkg.com): prefer url for anything large, so the bytes are never copied by hand.",
  inputSchema: {
    type: "object",
    properties: {
      project_id: { type: "string", description: "The project, or any feature or screen in it." },
      name: { type: "string", description: "The file's name, e.g. logo.svg." },
      data_base64: { type: "string", description: "The file's bytes, base64 (a data: URL works too). Or give url." },
      url: { type: "string", description: "Instead of data_base64: a public https address on an allowed host for the server to fetch." },
    },
    required: ["project_id", "name"],
    additionalProperties: false,
  },
  async run(host, args) {
    if (!host.assets || !host.projects) return { error: "This host has no asset store." };
    const project = await host.projects.projectOf(String(args.project_id ?? ""));
    if (!project) return { error: "Not found, or not inside a project." };
    const hasData = typeof args.data_base64 === "string" && args.data_base64 !== "";
    const hasUrl = typeof args.url === "string" && args.url !== "";
    if (hasData === hasUrl) return { error: "Give either data_base64 or url." };
    let bytes: Uint8Array;
    if (hasUrl) {
      const got = await fetchAsset(String(args.url));
      if (!got.ok) return { error: got.error };
      bytes = got.bytes;
    } else {
      try {
        bytes = Uint8Array.from(atob(String(args.data_base64 ?? "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));
      } catch {
        return { error: "data_base64 is not valid base64." };
      }
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
          `- **${c.name}**${c.id ? ` \`${c.id}\`` : ""} (${c.type ?? "?"}, ${c.status}) variants: ${c.variants.map((v) => (c.variantIds?.[v] && c.variantIds[v] !== c.id ? `${v} \`${c.variantIds[v]}\`` : v)).join(", ")}; states: ${c.states.join(", ") || "none"}; specimen: ${c.pagePath} (id ${c.pageId}); used ${c.usage.length}×${c.usage.some((u) => u.status === "drift") ? `, ${c.usage.filter((u) => u.status === "drift").length} drifted` : ""}${c.problems.length ? `; problems: ${c.problems.join(" ")}` : ""}`,
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
// Prototypes -------------------------------------------------------------------------

const featureArg = { type: "string", description: "The feature (flow) folder's id." };

const problemsText = (problems: { level: string; message: string }[]) =>
  problems.length ? ["", "Notes:", ...problems.map((p) => `- [${p.level}] ${p.message}`)].join("\n") : "\nNo gaps: every piece of data the screens show is served, and every api effect is handled.";

const generateApiTool: WaveTool = {
  name: "wave_generate_api",
  description:
    "Drafts the feature's mock API from its uploaded screens: an OpenAPI 3.1 document with one GET per data root the screens read (x-wave-provides) and one POST per api/... effect an action names (x-wave-effect), each with examples taken from the values the design shows, plus success and failure responses. Also returns the data requirements page. Show both to the designer; improve the examples with them (realistic values, more list items, the error cases product expects), then save with wave_save_api. save: true saves the draft as it is (never over an existing document unless overwrite: true).",
  inputSchema: {
    type: "object",
    properties: { feature_id: featureArg, save: { type: "boolean" }, overwrite: { type: "boolean" } },
    required: ["feature_id"],
    additionalProperties: false,
  },
  async run(host, args) {
    const r = await draftFeatureApi(host, String(args.feature_id ?? ""), { save: args.save === true, overwrite: args.overwrite === true });
    if (!r.ok) return { error: r.error };
    return text(
      [
        r.saved ? `Saved: ${r.saved.join(", ")}.` : "Not saved (a draft). Save it with wave_save_api once the designer agrees.",
        "",
        "OpenAPI (JSON):",
        JSON.stringify(r.openapi, null, 2),
        "",
        "Data requirements:",
        r.requirements,
      ].join("\n"),
    );
  },
};

const saveApiTool: WaveTool = {
  name: "wave_save_api",
  description:
    "Saves the feature's mock API: an OpenAPI 3 document (JSON or YAML; stored as JSON) and/or mock files (response bodies by operationId, which replace that operation's first success example). Wave checks the document, then rewrites the feature's Data requirements page and reports what the screens read or call that the API does not serve. Operations connect to screens through x-wave-provides (the data root a GET returns, e.g. order for data-wave-bind=\"order/total\") and x-wave-effect (the data-wave-effect an action names, e.g. api/orders/place). Give several responses (or named examples) to let the prototype's Scenarios menu play errors. A mock given as null removes it.",
  inputSchema: {
    type: "object",
    properties: {
      feature_id: featureArg,
      openapi: { type: "string", description: "The OpenAPI document as JSON or YAML text." },
      mocks: { type: "object", description: "{ operationId: response body (JSON value or JSON text) }", additionalProperties: true },
    },
    required: ["feature_id"],
    additionalProperties: false,
  },
  async run(host, args) {
    const openapi = typeof args.openapi === "string" ? args.openapi : args.openapi && typeof args.openapi === "object" ? JSON.stringify(args.openapi) : null;
    const mocks = args.mocks && typeof args.mocks === "object" ? (args.mocks as Record<string, unknown>) : null;
    const r = await saveFeatureApi(host, String(args.feature_id ?? ""), { openapi, mocks });
    if (!r.ok) return { error: r.error };
    const link = host.links ? `\nPrototype: ${host.links.prototype(String(args.feature_id))}` : "";
    return text(`Saved: ${r.written.join(", ")}.${link}${problemsText(r.problems)}`);
  },
};

const publishFlowTool: WaveTool = {
  name: "wave_publish_flow",
  description:
    "Publishes a whole feature in one call, after the designer has confirmed it: every screen (a new screen, or a new version of the screen with the same name in the feature), then the feature's OpenAPI document and mock files if given. Each screen is preflighted and the result reported. Returns the review link for each screen and the prototype link. Use it for a multi-screen flow instead of uploading screens one by one.",
  inputSchema: {
    type: "object",
    properties: {
      feature_id: featureArg,
      screens: {
        type: "array",
        items: {
          type: "object",
          properties: { name: { type: "string", description: "The page name, e.g. Delivery address." }, html: { type: "string" } },
          required: ["name", "html"],
          additionalProperties: false,
        },
      },
      openapi: { type: "string", description: "Optional: the feature's OpenAPI document, JSON or YAML." },
      mocks: { type: "object", additionalProperties: true, description: "Optional: { operationId: response body }" },
    },
    required: ["feature_id", "screens"],
    additionalProperties: false,
  },
  async run(host, args) {
    const list = Array.isArray(args.screens) ? (args.screens as { name?: unknown; html?: unknown }[]) : [];
    const screens = list.filter((x) => typeof x?.name === "string" && typeof x?.html === "string").map((x) => ({ name: x.name as string, html: x.html as string }));
    if (!screens.length || screens.length !== list.length) return { error: "screens must be a list of { name, html }." };
    const openapi = typeof args.openapi === "string" ? args.openapi : args.openapi && typeof args.openapi === "object" ? JSON.stringify(args.openapi) : null;
    const mocks = args.mocks && typeof args.mocks === "object" ? (args.mocks as Record<string, unknown>) : null;
    const flowId = String(args.feature_id ?? "");
    const r = await publishFlow(host, flowId, { screens, openapi, mocks });
    if (!r.ok) return { error: r.error };
    const lines = r.screens.map((s) =>
      s.error
        ? `- ${s.name}: NOT saved: ${s.error}`
        : `- ${s.name}: ${s.created ? "created" : "updated"}, version ${s.version}${host.links && s.id ? `, ${host.links.screen(s.id)}` : ""}. ${s.mandatoryOpen} mandatory open${s.issues.length ? `; ${s.issues.join(" ")}` : ""}`,
    );
    for (const s of r.screens) if (s.usage.length) lines.push("", ...s.usage);
    if (r.api) lines.push("", `API: ${r.api.written.length ? `saved ${r.api.written.join(", ")}` : "not saved"}.${problemsText(r.api.problems)}`);
    if (r.tests.length) lines.push("", `Test ids given; each screen's tree and the Gherkin: ${r.tests.join(", ")}.`);
    if (r.gherkin) lines.push(r.gherkin.gaps.length ? `The Gherkin is not complete: ${r.gherkin.gaps.join(" ")} Answer these in FEATURE.md (samples).` : `The Gherkin: the happy path, ${r.gherkin.steps} steps.`);
    if (host.links) lines.push("", `Prototype: ${host.links.prototype(flowId)}`);
    return text(lines.join("\n"));
  },
};

const prototypeTool: WaveTool = {
  name: "get_prototype",
  description:
    "The link to play a feature as a working prototype (every screen together, on the feature's mock API, with a device bar), its start screen, the operations its mock server answers, and anything the API does not yet serve. Give the link to the designer to try it before asking for review. Given a project id instead, it is the master prototype: every feature's screens at their latest approved versions. A feature that is approved and locked plays the versions it approved.",
  inputSchema: { type: "object", properties: { feature_id: { type: "string", description: "The feature (flow) folder, or a project for its master prototype." } }, required: ["feature_id"], additionalProperties: false },
  async run(host, args) {
    const id = String(args.feature_id ?? "");
    const isProject = host.projects ? !!(await host.projects.project(id)) : false;
    const v = isProject ? await projectPrototypeOf(host, id) : await prototypeOf(host, id);
    if (!v) return { error: "Not found." };
    return text(
      [
        `${v.flow.name}: ${v.screens.length} screen${v.screens.length === 1 ? "" : "s"}, starting at ${v.start ?? "nothing"}.`,
        host.links ? `Prototype: ${host.links.prototype(id)}` : "",
        v.api
          ? `Mock API (${v.sources.feature ? "feature" : ""}${v.sources.feature && v.sources.project ? " + " : ""}${v.sources.project ? "project" : ""}): ${v.api.operations.map((o) => `${o.method.toUpperCase()} ${o.path} [${o.responses.map((r) => r.name).join(", ")}]`).join("; ")}`
          : isProject
          ? "No project mock API: actions show their loading state, then succeed or fail as the bar's switch says."
          : "No mock API: actions show their loading state, then succeed or fail as the bar's switch says (the Figma flow builds no API). wave_generate_api makes one from the screens when data is wanted.",
        v.screens.some((s) => s.version) ? `Versions played: ${v.screens.map((s) => `${s.slug} v${s.version}`).join(", ")}.` : "",
        problemsText(v.problems),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  },
};

const briefProblems = (problems: { path: string; message: string }[]) =>
  problems.length ? ["", ...problems.map((p) => `- ${p.path ? `${p.path}: ` : ""}${p.message}`)].join("\n") : "";

const kindArg = { type: "string", enum: ["design", "feature"], description: "design: the project's DESIGN.md. feature: a feature's FEATURE.md." };

const getBriefTool: WaveTool = {
  name: "wave_get_brief",
  description:
    "Reads a project's DESIGN.md (kind design; id is the project or anything in it) or a feature's FEATURE.md (kind feature; id is the feature folder). When there is none yet it returns a template to fill in. Lists what is wrong or missing in it. Every element inherits DESIGN.md's defaults and the fields, data and actions FEATURE.md names, so a good brief means few questions later.",
  inputSchema: { type: "object", properties: { kind: kindArg, id: { type: "string" } }, required: ["kind", "id"], additionalProperties: false },
  async run(host, args) {
    const id = String(args.id ?? "");
    const r = args.kind === "feature" ? await readFeatureBrief(host, id) : await readDesignBrief(host, id);
    if ("error" in r) return { error: r.error };
    return text(
      [
        `${r.kind === "design" ? "DESIGN.md" : "FEATURE.md"} for ${r.folderName}: ${r.exists ? `saved (version ${r.version})` : "not written yet; here is a template"}.`,
        briefProblems(r.problems),
        r.missingSections.length ? `Sections still to write: ${r.missingSections.join(", ")}.` : "",
        "",
        r.content,
      ]
        .filter((l, i) => l !== "" || i > 2)
        .join("\n"),
    );
  },
};

const saveBriefTool: WaveTool = {
  name: "wave_save_brief",
  description:
    "Saves a project's DESIGN.md (kind design, at the project root) or a feature's FEATURE.md (kind feature, in the feature folder). The front matter must be valid YAML between --- lines; anything else wrong is saved and listed so you can fix it. Show the designer the file and get their agreement before saving.",
  inputSchema: {
    type: "object",
    properties: { kind: kindArg, id: { type: "string" }, markdown: { type: "string", description: "The whole file." } },
    required: ["kind", "id", "markdown"],
    additionalProperties: false,
  },
  async run(host, args) {
    const id = String(args.id ?? "");
    const md = String(args.markdown ?? "");
    const r = args.kind === "feature" ? await saveFeatureBrief(host, id, md) : await saveDesignBrief(host, id, md);
    if (!r.ok) return { error: `${r.error}${briefProblems(r.problems)}` };
    // A feature with screens has its Gherkin written again: samples may have changed.
    const hasScreens = args.kind === "feature" && (await host.resources.members(id)).some((m) => m.kind === "screen");
    const g = hasScreens ? await writeFlowFeature(host, id) : null;
    return text(
      [
        `Saved ${args.kind === "feature" ? "FEATURE.md" : "DESIGN.md"} (id ${r.id}).`,
        r.problems.length ? `Still to fix:${briefProblems(r.problems)}` : "No problems.",
        r.missingSections.length ? `Sections still to write: ${r.missingSections.join(", ")}.` : "",
        g && g.ok ? gherkinText(g) : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  },
};

function gherkinText(g: { steps: number; gaps: { screen: string; message: string }[]; path: string[] }): string {
  return g.gaps.length
    ? `The feature's Gherkin (tests/flow-feature) is not complete: ${g.gaps.map((x) => `${x.screen}: ${x.message}`).join(" ")} Answer these in FEATURE.md (a sample for each field the happy path fills).`
    : `The feature's Gherkin (tests/flow-feature): the happy path, ${g.steps} steps through ${g.path.join(", ")}.`;
}

const flowFeatureTool: WaveTool = {
  name: "wave_flow_feature",
  description:
    "Writes the feature's Gherkin again (tests/flow-feature) from its screens and FEATURE.md, and returns it: the happy path from the screen nothing leads to, every required field filled with its FEATURE.md sample, each forward action, each screen arrived at. Steps name elements by test id. Scenarios people added after the marker line are kept. Publishing and saving FEATURE.md also write it; lists what keeps it from being complete (a field without a sample, an action without a test id).",
  inputSchema: { type: "object", properties: { feature_id: { type: "string", description: "The feature (flow) folder." } }, required: ["feature_id"], additionalProperties: false },
  async run(host, args) {
    const id = String(args.feature_id ?? "");
    const g = await writeFlowFeature(host, id);
    if (!g.ok) return { error: g.error };
    const page = await readFlowFeature(host, id);
    return text(`${gherkinText(g)}\n\n${page?.gherkin ?? ""}`);
  },
};

const designSystemPageTool: WaveTool = {
  name: "wave_design_system_page",
  description:
    "Writes the project's design-system page from its published specimens: a table of every component with its design-system id, its variants' ids and its type (with Figma and review links when known), and the same table as JSON (design-system-ids) next to it, linked under the table. The page's opening and its Notes section are kept. Run it after publishing, changing or approving specimens.",
  inputSchema: { type: "object", properties: { project_id: { type: "string", description: "The project, or any feature or screen in it." } }, required: ["project_id"], additionalProperties: false },
  async run(host, args) {
    if (!host.projects) return { error: "This host has no projects." };
    const project = await host.projects.projectOf(String(args.project_id ?? ""));
    if (!project) return { error: "Not found, or not inside a project." };
    const r = await writeDesignSystemPage(host, project.id);
    if ("error" in r) return { error: r.error };
    return text(
      [
        `Wrote ${r.page.path} (id ${r.page.id}) and ${r.ids.path} (id ${r.ids.id}) for ${r.components} components.`,
        r.proposed.length ? `Not approved yet: ${r.proposed.join(", ")}.` : "All approved.",
      ].join("\n"),
    );
  },
};

export function createWaveTools(): WaveTool[] {
  return [
    getBriefTool,
    saveBriefTool,
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
    designSystemPageTool,
    flowFeatureTool,
    extractTool,
    generateApiTool,
    saveApiTool,
    publishFlowTool,
    prototypeTool,
    useScreenTool,
    screenUsageTool,
    reopenFlowTool,
  ];
}
