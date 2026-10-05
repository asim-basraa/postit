import type { RunResult } from "./run";

const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");

/** A run as Markdown, for the feature's E2E report page. */
export function runReport(r: RunResult, opts: { versions?: string } = {}): string {
  const lines = [`# E2E report: ${r.feature}`, ""];
  lines.push(`Against **${r.target}**, ${r.ranAt.replace("T", " ").slice(0, 16)} UTC, by Wave Test.${opts.versions ? ` Versions: ${opts.versions}.` : ""}`, "");
  lines.push(r.passed ? `**Passed.** ${r.steps} steps in ${r.scenarios.length} scenario${r.scenarios.length === 1 ? "" : "s"}.` : `**Failed.** ${r.failed} of ${r.steps} steps failed${r.problems.length ? `, and the Gherkin has ${r.problems.length} problem${r.problems.length === 1 ? "" : "s"}` : ""}.`);
  if (r.problems.length) lines.push("", "## Gherkin problems", "", ...r.problems.map((p) => `- ${p}`));
  for (const s of r.scenarios) {
    lines.push("", `## ${s.passed ? "Passed" : "Failed"}: ${s.name}`, "", "| Line | Step | Result |", "|---|---|---|");
    for (const st of s.steps) {
      const result = st.status === "passed" ? "passed" : st.status === "skipped" ? "skipped" : `**failed**: ${cell(st.error ?? "")}${st.screenshot ? ` (screenshot ${st.screenshot.split(/[\\/]/).pop()})` : ""}`;
      lines.push(`| ${st.line} | ${st.keyword} ${cell(st.text)} | ${result} |`);
    }
  }
  if (r.notices.length) lines.push("", "## What the prototype said", "", ...[...new Set(r.notices)].map((n) => `- ${n}`));
  return lines.join("\n") + "\n";
}
