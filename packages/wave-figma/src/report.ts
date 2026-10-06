import { evaluateGate, type GateReport } from "./gate";
import type { BehaviourResult } from "./behaviour";

/**
 * The Figma readiness report: what a designer reads when Wave refuses a file.
 *
 * The entry gate lists findings by rule, one row per layer, which is what a
 * converter needs. A designer needs the other cut: by component and by screen,
 * what to change and why, with a link to see it. Wave converts a file exactly
 * as drawn or not at all, so anything that blocks, and any page that does not
 * match Figma's own render, makes the whole file not ready.
 */

export type PageFidelity = {
  /** The component or screen, as the designer knows it. */
  name: string;
  /** Its Figma node id. */
  node?: string;
  /** Structural difference from Figma's render, in percent. */
  score: number;
  pass: boolean;
  /** What differs, in a sentence, when it is known. */
  cause?: string;
};

export type ReadinessOptions = {
  /** What is being checked, e.g. "Acme design system". */
  title?: string;
  /** The report's version: 1 for the first, one more than the report it replaces. Defaults to one more than \`previous\`. */
  version?: number;
  /**
   * The report this one replaces (its Markdown, as published). Its findings
   * record is compared with this check to list what was fixed since.
   */
  previous?: string | null;
  /** When the file was checked (ISO); defaults to now. */
  checkedAt?: string;
  fontsMissing?: string[];
  fidelity?: PageFidelity[];
  /** The fidelity pass mark, in percent. */
  threshold?: number;
  /** How many example layers to link per correction. */
  examples?: number;
  /** The behaviour check, per screen: controls that do nothing visible in the prototype. */
  behaviour?: { name: string; result: BehaviourResult }[];
};

export type Readiness = {
  ready: boolean;
  version: number | null;
  /** Corrections made since the previous version (null when there is no previous record to compare). */
  fixed: number | null;
  /** Regressions: problems the previous version did not have, where it looked. */
  regressions: number | null;
  blocking: number;
  advice: number;
  areas: number;
  fidelityFailures: number;
  behaviourFailures: number;
  markdown: string;
};

/**
 * What a report found, kept in the report itself (an HTML comment the page
 * does not show) so the next version can say what was fixed since.
 */
export type ReadinessRecord = {
  version: number | null;
  /** The pages and frames the gate checked. */
  covers: string[];
  /** Per rule, per component or screen: how many layers, and the layers listed. */
  gate: Record<string, { title: string; count: number; complete: boolean; areas: Record<string, { count: number; layers: [string, string][] }> }>;
  /** Pages compared with Figma: by name. */
  pages: Record<string, { node: string | null; pass: boolean; score: number }>;
  /** Controls played in the prototype: by screen and control. */
  controls: Record<string, { screen: string; name: string; node: string | null; pass: boolean }>;
  /** Fonts Wave could not get, and whether fonts were checked at all. */
  fonts: { checked: boolean; missing: string[] };
};

const RECORD_RE = /<!-- wave:readiness (\{[\s\S]*?\}) -->/;

/** The findings record of a published report, or null when it has none (a report from before records). */
export function readReadinessRecord(markdown: string): ReadinessRecord | null {
  const m = RECORD_RE.exec(markdown);
  if (!m) return null;
  try {
    return JSON.parse(m[1]) as ReadinessRecord;
  } catch {
    return null;
  }
}

/** The version a published report states at its top, from its record or its text. */
export function readReadinessVersion(markdown: string): number | null {
  const v = readReadinessRecord(markdown)?.version ?? Number(/\*\*Version (\d+)\*\*/.exec(markdown)?.[1] ?? NaN);
  return Number.isInteger(v) && (v as number) > 0 ? (v as number) : null;
}

const cell = (x: string | undefined) => (x ?? "").replace(/\|/g, "/").replace(/\n/g, " ");

export function readinessReport(report: GateReport, opts: ReadinessOptions = {}): Readiness {
  const result = evaluateGate(report);
  const link = (id: string) => (report.file ? `https://www.figma.com/design/${report.file}?node-id=${id.replace(/:/g, "-")}` : null);
  const max = opts.examples ?? 5;
  const fontsMissing = opts.fontsMissing ?? [];
  const fidelityFailures = (opts.fidelity ?? []).filter((f) => !f.pass);
  const behaviourFailures = (opts.behaviour ?? []).flatMap((s) => s.result.controls.filter((c) => !c.pass).map((c) => ({ screen: s.name, ...c })));
  const ready = result.pass && !fontsMissing.length && !fidelityFailures.length && !behaviourFailures.length;

  // By area (the component set or frame a layer is in), then by correction.
  type Item = { rule: string; title: string; fix: string; severity: string; count: number; layers: [string, string, string?][] };
  const areas = new Map<string, Item[]>();
  for (const r of result.rules) {
    const byWhere = new Map<string, [string, string, string?][]>();
    for (const [id, name, detail, where] of r.nodes) {
      const key = where || "Elsewhere in the file";
      const list = byWhere.get(key) ?? [];
      list.push([id, name, detail]);
      byWhere.set(key, list);
    }
    // The report keeps a sample of layers per rule; the rest are counted, not lost.
    const listed = r.nodes.length;
    for (const [where, layers] of byWhere) {
      const items = areas.get(where) ?? [];
      const share = listed ? Math.round((r.count * layers.length) / listed) : layers.length;
      items.push({ rule: r.rule, title: r.title, fix: r.fix, severity: r.severity, count: Math.max(share, layers.length), layers });
      areas.set(where, items);
    }
  }
  const blockingAreas = [...areas.entries()].filter(([, items]) => items.some((i) => i.severity === "blocking"));
  const adviceOnly = [...areas.entries()].filter(([, items]) => items.every((i) => i.severity !== "blocking"));

  // This check's findings, for the next version to compare with.
  const record: ReadinessRecord = { version: null, covers: report.covers ?? [], gate: {}, pages: {}, controls: {}, fonts: { checked: opts.fontsMissing !== undefined, missing: fontsMissing } };
  for (const r of result.rules) {
    const g = (record.gate[r.rule] = { title: r.title, count: r.count, complete: r.nodes.length >= r.count, areas: {} as ReadinessRecord["gate"][string]["areas"] });
    for (const [where, items] of areas) {
      const i = items.find((x) => x.rule === r.rule);
      if (i) g.areas[where] = { count: i.count, layers: i.layers.map(([id, name]) => [id, name] as [string, string]) };
    }
  }
  for (const f of opts.fidelity ?? []) record.pages[f.name] = { node: f.node ?? null, pass: f.pass, score: f.score };
  for (const sc of opts.behaviour ?? []) {
    for (const c of sc.result.controls) record.controls[`${sc.name} / ${c.name || c.kind}`] = { screen: sc.name, name: c.name || c.kind, node: c.figma, pass: c.pass };
  }

  const previous = opts.previous ? readReadinessRecord(opts.previous) : null;
  const previousVersion = opts.previous ? readReadinessVersion(opts.previous) : null;
  const version = opts.version ?? (opts.previous ? (previousVersion ?? 0) + 1 : null);
  record.version = version;

  const lines: string[] = [`# ${opts.title ?? "Figma readiness report"}`, ""];
  const checked = (opts.checkedAt ?? new Date().toISOString()).slice(0, 10);
  const before = previousVersion ?? (version && version > 1 ? version - 1 : null);
  if (version) lines.push(`**Version ${version}**, checked ${checked}.${before ? ` It replaces version ${before}; act on this one.` : ""}`, "");
  if (report.file) lines.push(`Figma file: [open in Figma](https://www.figma.com/design/${report.file}). Every component, screen and layer below links to its node in the file.`, "");

  // What changed since the version this replaces: fixed first, then anything new.
  let fixedCount: number | null = null;
  let addedCount: number | null = null;
  if (opts.previous) {
    const since = before ? `version ${before}` : "the last report";
    lines.push(`## Since ${since}`, "");
    if (!previous) {
      lines.push(`The last report has no findings record (it was written before reports kept one), so what was fixed cannot be listed. The next version will list it.`, "");
    } else {
      const fixed: string[] = [];
      // Regressions: worse than the last check, where the last check looked.
      const added: string[] = [];
      // Pages and controls checked for the first time: not a regression.
      const firstTime: string[] = [];
      const sameScope = record.covers.every((c) => (previous.covers ?? record.covers).includes(c));
      const label = (id: string | null, name: string) => {
        const l = id ? link(id.replace(/^I/, "").split(";")[0]) : null;
        return l ? `[${cell(name)}](${l})` : cell(name);
      };
      const areaLabel = (where: string) => label(report.areas?.[where] ?? null, where);
      // Per component and screen when both checks listed every layer of a rule;
      // otherwise the per-area numbers are estimates, so the rule's total is compared.
      const exact = (rule: string) => (previous.gate[rule]?.complete ?? true) && (record.gate[rule]?.complete ?? true);
      for (const [rule, was] of Object.entries(previous.gate)) {
        const now = record.gate[rule];
        if (!exact(rule)) {
          const left = now?.count ?? 0;
          if (left < was.count) {
            fixed.push(`- **${was.title}**: ${left ? `${was.count - left} of ${was.count} layers fixed across the file, ${left} left` : `all ${was.count} layers fixed`}.`);
            fixedCount = (fixedCount ?? 0) + was.count - left;
          }
          continue;
        }
        for (const [where, a] of Object.entries(was.areas)) {
          const left = now?.areas[where]?.count ?? 0;
          if (left >= a.count) continue;
          const done = a.count - left;
          // Name the layers only when both checks listed every layer of the rule.
          const nowIds = new Set((now?.areas[where]?.layers ?? []).map(([id]) => id));
          const named = was.complete && (now ? now.complete : true) ? a.layers.filter(([id]) => !nowIds.has(id)) : [];
          const shown = named.slice(0, max).map(([id, name]) => label(id, name));
          const more = named.length > shown.length ? `, and ${named.length - shown.length} more` : "";
          fixed.push(`- **${was.title}** in ${areaLabel(where)}: ${left ? `${done} of ${a.count} layers fixed, ${left} left` : `${a.count === 1 ? "the layer is" : `all ${a.count} layers are`} fixed`}${shown.length ? ` (${shown.join(", ")}${more})` : ""}.`);
          fixedCount = (fixedCount ?? 0) + done;
        }
      }
      for (const [rule, now] of Object.entries(record.gate)) {
        if (!exact(rule)) {
          const had = previous.gate[rule]?.count ?? 0;
          if (now.count > had && sameScope) {
            added.push(`- **${now.title}**: ${now.count - had} more layer${now.count - had === 1 ? "" : "s"} across the file than in ${since} (${now.count} now).`);
            addedCount = (addedCount ?? 0) + now.count - had;
          } else if (now.count > had) firstTime.push(`- **${now.title}**: ${now.count - had} more layers, partly in parts of the file not checked in ${since}.`);
          continue;
        }
        for (const [where, a] of Object.entries(now.areas)) {
          const had = previous.gate[rule]?.areas[where]?.count ?? 0;
          if (a.count <= had) continue;
          // A component or screen with nothing before, in a part of the file the last check did not cover, is new to the check.
          if (!had && !sameScope) {
            firstTime.push(`- **${now.title}** in ${areaLabel(where)}: ${a.count} layer${a.count === 1 ? "" : "s"}.`);
            continue;
          }
          added.push(`- **${now.title}** in ${areaLabel(where)}: ${had ? `${a.count - had} more layer${a.count - had === 1 ? "" : "s"} than in ${since} (${a.count} now)` : `${a.count} layer${a.count === 1 ? "" : "s"}, none in ${since}`}.`);
          addedCount = (addedCount ?? 0) + a.count - had;
        }
      }
      for (const [name, was] of Object.entries(previous.pages)) {
        const now = record.pages[name];
        if (!was.pass && now?.pass) {
          fixed.push(`- ${label(now.node ?? was.node, name)} now matches Figma (${was.score.toFixed(3)}% difference before, ${now.score.toFixed(3)}% now).`);
          fixedCount = (fixedCount ?? 0) + 1;
        }
      }
      for (const [name, now] of Object.entries(record.pages)) {
        const was = previous.pages[name];
        if (now.pass || (was && !was.pass)) continue;
        if (was) {
          added.push(`- ${label(now.node, name)} matched Figma in ${since} and no longer does (${was.score.toFixed(3)}% difference before, ${now.score.toFixed(3)}% now).`);
          addedCount = (addedCount ?? 0) + 1;
        } else firstTime.push(`- ${label(now.node, name)} does not match Figma (${now.score.toFixed(3)}% difference).`);
      }
      for (const [key, was] of Object.entries(previous.controls)) {
        const now = record.controls[key];
        if (!was.pass && now?.pass) {
          fixed.push(`- ${cell(was.screen)}: ${label(now.node ?? was.node, was.name)} now responds in the prototype.`);
          fixedCount = (fixedCount ?? 0) + 1;
        }
      }
      for (const [key, now] of Object.entries(record.controls)) {
        const was = previous.controls[key];
        if (now.pass || (was && !was.pass)) continue;
        if (was) {
          added.push(`- ${cell(now.screen)}: ${label(now.node, now.name)} responded in the prototype in ${since} and now does nothing.`);
          addedCount = (addedCount ?? 0) + 1;
        } else firstTime.push(`- ${cell(now.screen)}: ${label(now.node, now.name)} does nothing in the prototype.`);
      }
      if (previous.fonts.checked && record.fonts.checked) {
        for (const f of previous.fonts.missing.filter((f) => !record.fonts.missing.includes(f))) {
          fixed.push(`- Font **${cell(f)}** is now available to Wave.`);
          fixedCount = (fixedCount ?? 0) + 1;
        }
        for (const f of record.fonts.missing.filter((f) => !previous.fonts.missing.includes(f))) {
          added.push(`- Font **${cell(f)}** is new in the file and cannot be served.`);
          addedCount = (addedCount ?? 0) + 1;
        }
      }
      fixedCount ??= 0;
      addedCount ??= 0;
      lines.push(`**Fixed** (${fixedCount}):`, "", ...(fixed.length ? fixed : ["- Nothing from the last report has been fixed yet."]), "");
      if (added.length) lines.push(`**Regressions** (${addedCount}): these passed in ${since} and fail now, so a change made in Figma since then broke them. Fix these first.`, "", ...added, "");
      else lines.push(`**Regressions**: none. Nothing that passed in ${since} has broken.`, "");
      if (firstTime.length) lines.push(`**Checked for the first time** (${firstTime.length}): not checked in ${since}, so not a regression.`, "", ...firstTime, "");
    }
  }
  if (ready) {
    lines.push("**Ready for Wave.** Nothing blocks, and every page Wave made matches Figma's own render." + (result.advice ? ` ${result.advice} suggestion${result.advice === 1 ? "" : "s"} below are optional.` : ""));
  } else {
    lines.push(
      "**Not ready for Wave.** Wave converts a Figma file exactly as it is drawn, or not at all, so nothing from this file is used until the corrections below are made in Figma. Wave is not changed to fit a file, and nothing is redrawn by hand.",
      "",
      "| | |",
      "|---|---|",
      `| Corrections that block | ${result.blocking} layer${result.blocking === 1 ? "" : "s"}, in ${blockingAreas.length} component${blockingAreas.length === 1 ? "" : "s"} or screen${blockingAreas.length === 1 ? "" : "s"} |`,
      ...(fidelityFailures.length ? [`| Pages that do not match Figma | ${fidelityFailures.length} |`] : []),
      ...(behaviourFailures.length ? [`| Controls that do nothing in the prototype | ${behaviourFailures.length} |`] : []),
      ...(fontsMissing.length ? [`| Fonts Wave cannot get | ${fontsMissing.join(", ")} |`] : []),
      `| Suggestions (optional) | ${result.advice} |`,
    );
  }

  // What to do first: each kind of correction once, most frequent first. A fix
  // made in a main component reaches every instance of it.
  const blockingRules = result.rules.filter((r) => r.severity === "blocking");
  if (blockingRules.length) {
    lines.push("", "## What to change, in short", "");
    for (const r of blockingRules) lines.push(`- **${r.title}** (${r.count}): ${r.fix}`);
    lines.push("", "Fix a component's main component first: every instance of it on the screens changes with it, and many of the screen corrections below go away.");
  }

  if (fontsMissing.length) {
    lines.push("", "## Fonts", "", `Wave serves free fonts itself. These are not available that way: ${fontsMissing.join(", ")}. Send the font files, and confirm they may be used on the web, or use a free font in Figma.`);
  }

  if (fidelityFailures.length) {
    const mark = opts.threshold ?? 0.25;
    lines.push("", "## Pages that do not match Figma", "", `Wave compares each page it makes with Figma's own render; more than ${mark}% difference in structure means the page is not what was drawn. These usually come from something the file asks a browser to do differently from Figma.`, "", "| Component or screen | Difference | What differs |", "|---|---|---|");
    for (const f of fidelityFailures) {
      const l = f.node ? link(f.node) : null;
      lines.push(`| ${l ? `[${cell(f.name)}](${l})` : cell(f.name)} | ${f.score.toFixed(3)}% | ${cell(f.cause) || "Being looked into; the comparison image is with the engineer."} |`);
    }
  }

  if (behaviourFailures.length) {
    const nodeLink = (id: string | null) => (id ? link(id.replace(/^I/, "").split(";")[0]) : null);
    lines.push("", "## Controls that do nothing in the prototype", "", "Wave played each screen and clicked every control. These show no change, because the look they change to is not drawn in Figma: a chosen state, an open menu. Wave does not invent a look; draw it, and the prototype uses it.", "", "| Screen | Control | What happens |", "|---|---|---|");
    for (const c of behaviourFailures) {
      const l = nodeLink(c.figma);
      lines.push(`| ${cell(c.screen)} | ${l ? `[${cell(c.name || c.kind)}](${l})` : cell(c.name || c.kind)} (${c.kind}) | ${cell(c.detail)} |`);
    }
  }

  const renderArea = ([where, items]: [string, Item[]]) => {
    const areaId = report.areas?.[where];
    const areaLink = areaId ? link(areaId) : null;
    lines.push("", `### ${areaLink ? `[${where}](${areaLink})` : where}`, "");
    for (const i of items.sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === "blocking" ? -1 : 1))) {
      const shown = i.layers.slice(0, max).map(([id, name, detail]) => {
        const l = link(id);
        const label = l ? `[${cell(name)}](${l})` : cell(name);
        return detail ? `${label} (${cell(detail)})` : label;
      });
      const more = i.count > shown.length ? `, and ${i.count - shown.length} more` : "";
      lines.push(`- ${i.severity === "blocking" ? "" : "Suggestion: "}**${i.title}**, ${i.count} layer${i.count === 1 ? "" : "s"}: ${shown.join(", ")}${more}.`);
    }
  };

  if (blockingAreas.length) {
    lines.push("", "## Corrections by component and screen", "", "Each link opens the layer in Figma.");
    blockingAreas.sort((a, b) => a[0].localeCompare(b[0])).forEach(renderArea);
  }
  if (adviceOnly.length) {
    lines.push("", "## Suggestions", "", "These do not stop anything; they make the result closer to what was meant.");
    adviceOnly.sort((a, b) => a[0].localeCompare(b[0])).forEach(renderArea);
  }

  lines.push("", "## Next", "", ready ? "The engineer continues with the design system and the screens in Wave." : "When the corrections are made, tell the engineer. Wave checks the file again from the start, and this report is replaced by the new one.");
  lines.push("", `<!-- wave:readiness ${JSON.stringify(record).replace(/--/g, "-\\u002d")} -->`);
  return { ready, version, fixed: fixedCount, regressions: addedCount, blocking: result.blocking, advice: result.advice, areas: blockingAreas.length, fidelityFailures: fidelityFailures.length, behaviourFailures: behaviourFailures.length, markdown: lines.join("\n") + "\n" };
}
