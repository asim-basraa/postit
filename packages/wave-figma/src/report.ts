import { evaluateGate, type GateReport } from "./gate";

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
  fontsMissing?: string[];
  fidelity?: PageFidelity[];
  /** The fidelity pass mark, in percent. */
  threshold?: number;
  /** How many example layers to link per correction. */
  examples?: number;
};

export type Readiness = {
  ready: boolean;
  blocking: number;
  advice: number;
  areas: number;
  fidelityFailures: number;
  markdown: string;
};

const cell = (x: string | undefined) => (x ?? "").replace(/\|/g, "/").replace(/\n/g, " ");

export function readinessReport(report: GateReport, opts: ReadinessOptions = {}): Readiness {
  const result = evaluateGate(report);
  const link = (id: string) => (report.file ? `https://www.figma.com/design/${report.file}?node-id=${id.replace(/:/g, "-")}` : null);
  const max = opts.examples ?? 5;
  const fontsMissing = opts.fontsMissing ?? [];
  const fidelityFailures = (opts.fidelity ?? []).filter((f) => !f.pass);
  const ready = result.pass && !fontsMissing.length && !fidelityFailures.length;

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

  const lines: string[] = [`# ${opts.title ?? "Figma readiness report"}`, ""];
  if (report.file) lines.push(`Figma file: [open in Figma](https://www.figma.com/design/${report.file}). Every component, screen and layer below links to its node in the file.`, "");
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
  return { ready, blocking: result.blocking, advice: result.advice, areas: blockingAreas.length, fidelityFailures: fidelityFailures.length, markdown: lines.join("\n") + "\n" };
}
