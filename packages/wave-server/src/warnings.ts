import { preflightIssues, type FeatureBrief, type Requirement } from "@wave/spec";
import type { WaveHost, WaveScreen } from "./host";
import { featureBrief, reportFor, screenReport, type ProjectContext, type ProjectSlugs, type ScreenReport, type SlugMemo } from "./project";

/**
 * Everything still open on a screen, in one list: the questions Wave asks of
 * its elements (answered in the review panel, FEATURE.md or DESIGN.md) and what
 * preflight finds in the file itself (test ids, the Figma match, scripts). The
 * same list is the screens table's count, the warnings on the project and
 * feature pages, and what wave_warnings returns, so they cannot disagree.
 */

export type Warning = {
  /** Mandatory blocks upload and approval; recommended does not. */
  level: "mandatory" | "recommended";
  /** A question (answerable by its qid) or a preflight finding about the file. */
  kind: "question" | "file";
  /** The question's id, for answering it: screen/pid/field. Null for a file finding. */
  qid: string | null;
  /** The preflight code, for a file finding. */
  code: string | null;
  /** Short name of what is missing. */
  label: string;
  /** What is asked, or what is wrong and how to fix it. */
  message: string;
  /** The element it is about: its Wave id and readable address. Null for the screen as a whole. */
  pid: string | null;
  address: string | null;
  /** Who answers: design or product. */
  owner: "design" | "product" | null;
  /** A value Wave worked out, to confirm. */
  proposal: string | null;
  /** Allowed answers, when fixed. */
  choices: string[] | null;
};

export type ScreenWarnings = {
  screenId: string;
  name: string;
  slug: string;
  version: number;
  featureId: string | null;
  mandatory: number;
  recommended: number;
  warnings: Warning[];
};

const isOpen = (r: Requirement) => r.status === "missing" || r.status === "proposed";

/** A screen's warnings from its report (which already read DESIGN.md, FEATURE.md and the catalogue). */
export function warningsFrom(report: ScreenReport, html: string, screen: { id: string; name: string; content_version: number }, featureId: string | null): ScreenWarnings {
  const warnings: Warning[] = [];
  for (const i of preflightIssues(html, report.parsed, report.slug)) {
    warnings.push({ level: i.level, kind: "file", qid: null, code: i.code, label: i.code, message: i.message, pid: null, address: null, owner: null, proposal: null, choices: null });
  }
  for (const r of report.requirements.filter(isOpen)) {
    warnings.push({
      level: r.level,
      kind: "question",
      qid: r.qid,
      code: null,
      label: r.label,
      message: r.question,
      pid: r.pid,
      address: r.address,
      owner: r.owner,
      proposal: r.proposal?.value ?? null,
      choices: r.choices ?? null,
    });
  }
  warnings.sort((a, b) => (a.level === b.level ? 0 : a.level === "mandatory" ? -1 : 1));
  return {
    screenId: screen.id,
    name: screen.name,
    slug: report.slug,
    version: screen.content_version,
    featureId,
    mandatory: warnings.filter((w) => w.level === "mandatory").length,
    recommended: warnings.filter((w) => w.level === "recommended").length,
    warnings,
  };
}

/** FEATURE.md per feature, read once however many screens share it. */
export type BriefMemo = Map<string, Promise<FeatureBrief | null>>;

export function briefOf(host: WaveHost, featureId: string | null, memo: BriefMemo): Promise<FeatureBrief | null> {
  if (!featureId) return Promise.resolve(null);
  let hit = memo.get(featureId);
  if (!hit) memo.set(featureId, (hit = featureBrief(host, featureId)));
  return hit;
}

/** One screen's warnings in its project, with its feature's FEATURE.md. */
export async function screenWarningsIn(
  host: WaveHost,
  screen: WaveScreen,
  html: string,
  ctx: ProjectContext | null,
  slugs: ProjectSlugs,
  featureId: string | null,
  briefs: BriefMemo,
): Promise<ScreenWarnings> {
  const brief = await briefOf(host, featureId, briefs);
  return warningsFrom(reportFor(html, screen.name, ctx, slugs, screen.id, brief), html, screen, featureId);
}

/** Warnings as Markdown: per screen, mandatory first, each with its question id and a link to the element. */
export function warningsMarkdown(
  title: string,
  list: ScreenWarnings[],
  link: ((screenId: string, pid: string | null) => string) | null,
  options: { level?: "mandatory" | "all" } = {},
): string {
  const only = options.level === "mandatory";
  const total = list.reduce((n, s) => n + s.mandatory, 0);
  const rec = list.reduce((n, s) => n + s.recommended, 0);
  const lines = [`# Warnings: ${title}`, "", `${total} mandatory and ${rec} recommended open across ${list.length} screen${list.length === 1 ? "" : "s"}.${only ? " Showing mandatory only." : ""}`, ""];
  for (const s of list) {
    const shown = s.warnings.filter((w) => !only || w.level === "mandatory");
    lines.push(`## ${s.name} (\`${s.slug}\`, v${s.version}): ${s.mandatory} mandatory, ${s.recommended} recommended`);
    if (link) lines.push("", `Screen: ${link(s.screenId, null)}`);
    lines.push("");
    if (!shown.length) {
      lines.push("Nothing open.", "");
      continue;
    }
    for (const w of shown) {
      const where = w.address ?? w.pid ?? "the screen";
      const head = `- **${w.level}** ${w.kind === "file" ? `file: \`${w.code}\`` : `\`${w.qid}\``} ${w.label} (${where})`;
      lines.push(head, `  ${w.message}`);
      if (w.proposal) lines.push(`  Wave proposes: \`${w.proposal}\`. Confirm it by answering with that value.`);
      if (w.choices?.length) lines.push(`  One of: ${w.choices.map((c) => `\`${c}\``).join(", ")}`);
      if (link && w.pid) lines.push(`  Open: ${link(s.screenId, w.pid)}`);
    }
    lines.push("");
  }
  lines.push(
    "Answer a question with wave_answer_warnings (screen id, its version, and question id to answer; `waive: <reason>` waives it), in the review panel, or in FEATURE.md or DESIGN.md when it is about the feature or the project. A file finding is fixed in the file (or in Figma) and published again.",
  );
  return lines.join("\n");
}

/** One screen's warnings, reading its project and feature. */
export async function screenWarnings(host: WaveHost, screen: WaveScreen, html?: string, memo?: SlugMemo): Promise<ScreenWarnings | null> {
  const source = html ?? (await host.resources.readCurrent(screen));
  if (source === null) return null;
  const report = await screenReport(host, screen, source, memo);
  if (!report) return null;
  const feature = await host.resources.flowOf(screen.id).catch(() => null);
  return warningsFrom(report, source, screen, feature?.id ?? null);
}

/**
 * The warnings for a project (every screen in it), a feature (its screens) or
 * one screen, with a title for the list. Null when the id is none of these.
 */
export async function warningsFor(host: WaveHost, id: string): Promise<{ title: string; screens: ScreenWarnings[] } | null> {
  const project = host.projects ? await host.projects.project(id).catch(() => null) : null;
  if (project && host.projects) {
    const memo: SlugMemo = new Map();
    const list = await host.projects.screens(project.id);
    const out = await Promise.all(list.map((s) => screenWarnings(host, s, undefined, memo)));
    return { title: project.name, screens: out.filter((x): x is ScreenWarnings => !!x) };
  }
  const flow = await host.resources.flow(id).catch(() => null);
  if (flow && flow.is_flow) {
    const memo: SlugMemo = new Map();
    const members = (await host.resources.members(id)).filter((m) => m.kind === "screen");
    const out = await Promise.all(
      members.map(async (m) => {
        const s = await host.resources.screen(m.id);
        return s ? screenWarnings(host, s, undefined, memo) : null;
      }),
    );
    return { title: flow.name, screens: out.filter((x): x is ScreenWarnings => !!x) };
  }
  const screen = await host.resources.screen(id).catch(() => null);
  if (screen) {
    const w = await screenWarnings(host, screen);
    return w ? { title: screen.name, screens: [w] } : null;
  }
  return null;
}
