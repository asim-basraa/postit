import { parseDestination } from "./destination";
import { followsPathGrammar } from "./vocabulary";
import { setAttributes, setDocumentAttribute, setMeta, setNativeAttributes, setResource, setWaived } from "./edit";
import { parseConfig, type Requirement } from "./requirements";

/**
 * The question sheet and the answer sheet.
 *
 * A dry run lists every open question for a feature's screens as a Markdown
 * page anyone can fill in (the designer shares it with product). Each question
 * carries its stable id, so an answer stays attached to the right element
 * across runs. When every mandatory question has a valid answer or a waiver,
 * the dry run writes the answer sheet, which the full run applies to the HTML.
 */

export type SheetAnswer = { qid: string; answer: string | null };

const QID_LINE = /^\s*-\s*\[( |x|X)\]\s*\*\*(.+?)\*\*\s*`([^`]+)`/;
const ANSWER_LINE = /^\s*Answer:\s*(.*)$/;

/** Reads the answers out of a question or answer sheet. */
export function parseSheet(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  let current: string | null = null;
  for (const line of markdown.split(/\r?\n/)) {
    const q = QID_LINE.exec(line);
    if (q) {
      current = q[3].trim();
      continue;
    }
    // Answer sheets list "qid: answer" in a code block-free list.
    const direct = /^\s*-\s*`([^`]+)`\s*:\s*(.*)$/.exec(line);
    if (direct) {
      if (direct[2].trim()) out.set(direct[1].trim(), direct[2].trim());
      current = null;
      continue;
    }
    const a = ANSWER_LINE.exec(line);
    if (a && current) {
      const v = a[1].trim();
      if (v) out.set(current, v);
      current = null;
    }
  }
  return out;
}

export const WAIVE = /^waive\s*:\s*(.+)$/i;

export type Checked = { ok: true; value: string } | { ok: false; error: string };

/** Whether an answer can be written as it stands. */
export function checkAnswer(req: Requirement, raw: string, screens: { slug: string; nodes: { id: string; slug: string | null }[] }[]): Checked {
  const value = raw.trim();
  const waive = WAIVE.exec(value);
  if (waive) return waive[1].trim().length >= 3 ? { ok: true, value } : { ok: false, error: "A waiver needs a reason." };
  if (req.write.kind === "check") {
    return { ok: false, error: "This is answered by changing the design (see the question), or waived with 'waive: <reason>'." };
  }
  if (req.choices && !req.choices.includes(value)) return { ok: false, error: `Answer one of: ${req.choices.join(", ")}.` };
  const k = req.write.kind === "attr" ? req.write.key : req.field;
  if (k === "to" || k === "to-failure") {
    if (/^(stay|none)$/i.test(value)) return { ok: true, value: value.toLowerCase() };
    const d = parseDestination(value);
    if (d.kind === "invalid") return { ok: false, error: "Write a destination: screen:<slug>, node:<screen>/<slug>, modal:<screen>/<slug>, back, url:<address>, stay or none." };
    if (d.kind === "screen" || d.kind === "node" || d.kind === "modal") {
      const target = screens.find((s) => s.slug === (d.screen ?? req.screen));
      if (!target) return { ok: false, error: `There is no screen ${d.screen} in this feature.` };
      if (d.kind !== "screen" && !target.nodes.some((n) => n.slug === d.node || n.id === d.node)) return { ok: false, error: `There is no ${d.node} on ${target.slug}.` };
    }
    return { ok: true, value };
  }
  if (["bind", "field"].includes(k) && !/^none$/i.test(value) && !followsPathGrammar(value)) {
    return { ok: false, error: "Write a data path such as user/firstName (letters, digits, dots, dashes, separated by /)." };
  }
  if (k === "repeat" && !/\[\]$/.test(value)) return { ok: false, error: "A list's data path ends in [], e.g. orders[]." };
  if (k === "states" && !/^[a-z-]+(\s+[a-z-]+)*$/i.test(value)) return { ok: false, error: "List states separated by spaces, e.g. default hover disabled." };
  if (k === "paginate" && !/^(all|(pages|load-more|infinite):\d+)$/.test(value)) return { ok: false, error: "Answer all, pages:<n>, load-more:<n> or infinite:<n>." };
  if (req.write.kind === "resource") {
    const parts = value.split(";").map((p) => p.trim());
    if (parts.length < 3 || parts.some((p) => !p)) return { ok: false, error: "Answer as: type; source; description." };
  }
  if (!value) return { ok: false, error: "Empty answer." };
  return { ok: true, value };
}

export type DryRunItem = Requirement & { answer: string | null; raw: string | null; answerError: string | null; open: boolean };

export type ScreenSheetInput = { slug: string; label: string; requirements: Requirement[]; nodes: { id: string; slug: string | null }[] };

export type DryRunResult = {
  pass: boolean;
  items: DryRunItem[];
  counts: { mandatoryOpen: number; recommendedOpen: number; answeredInSheet: number; invalid: number; waived: number };
};

/** Merges the sheet's answers with each screen's requirements and says what is still open. */
export function dryRun(screens: ScreenSheetInput[], answers: Map<string, string>): DryRunResult {
  const items: DryRunItem[] = [];
  const context = screens.map((s) => ({ slug: s.slug, nodes: s.nodes }));
  for (const s of screens) {
    for (const r of s.requirements) {
      const raw = answers.get(r.qid) ?? null;
      let answer: string | null = null;
      let answerError: string | null = null;
      if (r.status === "answered" || r.status === "waived") {
        answer = null;
      } else if (raw) {
        const c = checkAnswer(r, raw, context);
        if (c.ok) answer = c.value;
        else answerError = c.error;
      }
      const open = r.status !== "answered" && r.status !== "waived" && answer === null;
      items.push({ ...r, answer, raw, answerError, open });
    }
  }
  const counts = {
    mandatoryOpen: items.filter((i) => i.open && i.level === "mandatory").length,
    recommendedOpen: items.filter((i) => i.open && i.level === "recommended").length,
    answeredInSheet: items.filter((i) => i.answer !== null).length,
    invalid: items.filter((i) => i.answerError !== null).length,
    waived: items.filter((i) => i.status === "waived" || (i.answer !== null && WAIVE.test(i.answer))).length,
  };
  return { pass: counts.mandatoryOpen === 0, items, counts };
}

function ownerTag(r: Requirement) {
  return r.owner === "design" ? "designer" : "product";
}

/** The question sheet as Markdown. Answered questions are listed too, ticked, so the sheet is a full record. */
export function renderQuestionSheet(feature: string, run: number, screens: ScreenSheetInput[], result: DryRunResult): string {
  const lines: string[] = [];
  const c = result.counts;
  lines.push(`# Wave question sheet: ${feature} (dry run ${run}, ${c.mandatoryOpen} mandatory open)`);
  lines.push("");
  lines.push(`Screens: ${screens.map((s) => `${s.slug} (${s.label})`).join(", ")}`);
  lines.push(`Status: ${result.pass ? "**passes**" : "**not yet**"} · ${c.mandatoryOpen} mandatory open · ${c.recommendedOpen} recommended open · ${c.invalid} answers to fix · ${c.waived} waived`);
  lines.push("");
  lines.push("How to answer: write after `Answer:` in plain words or in the format asked. To skip a question on purpose, write `waive: <reason>` (only the designer should). `*` marks a mandatory question. Ticked questions are already answered in the design.");
  lines.push("");
  for (const s of screens) {
    const mine = result.items.filter((i) => i.screen === s.slug);
    if (!mine.length) continue;
    lines.push(`## ${s.slug}`);
    lines.push("");
    const groups = new Map<string, DryRunItem[]>();
    for (const i of mine) {
      const key = i.pid ? `${i.address}` : "Screen";
      groups.set(key, [...(groups.get(key) ?? []), i]);
    }
    for (const [group, list] of groups) {
      const first = list[0];
      lines.push(`### ${group === "Screen" ? "The screen" : `${first.type} ${group.split(".").slice(2).join(".")} (${first.pid})`}`);
      lines.push("");
      for (const i of list.sort((a, b) => (a.level === b.level ? 0 : a.level === "mandatory" ? -1 : 1))) {
        const done = !i.open;
        lines.push(`- [${done ? "x" : " "}] **${i.label}** \`${i.qid}\`${i.level === "mandatory" ? " *" : ""} _(${ownerTag(i)})_`);
        lines.push(`  ${i.question}`);
        if (i.proposal && i.status === "proposed") lines.push(`  Proposed: ${i.proposal.value} (${i.proposal.reason})`);
        if (i.status === "answered") lines.push(`  In the design: ${i.value ?? "yes"}`);
        if (i.status === "waived") lines.push(`  Waived: ${i.waivedReason}`);
        if (i.answerError) lines.push(`  **Fix:** ${i.answerError}`);
        if (i.status !== "answered" && i.status !== "waived") lines.push(`  Answer: ${i.answer ?? i.raw ?? ""}`);
        lines.push("");
      }
    }
  }
  return lines.join("\n");
}

/** The answer sheet: every valid answer, for the full run to apply. */
export function renderAnswerSheet(feature: string, screens: { slug: string; fingerprint: string }[], result: DryRunResult): string {
  const lines = [`# Wave answer sheet: ${feature}`, "", `Passed dry run. Screens: ${screens.map((s) => `${s.slug} (${s.fingerprint})`).join(", ")}`, ""];
  for (const i of result.items) if (i.answer !== null) lines.push(`- \`${i.qid}\`: ${i.answer}`);
  lines.push("");
  return lines.join("\n");
}

export type ApplyResult = { html: string; applied: string[]; skipped: { qid: string; reason: string }[] };

/** Writes a screen's answers into its HTML. Checks are skipped: they are answered by changing the design. */
export function applyAnswers(html: string, requirements: Requirement[], answers: Map<string, string>): ApplyResult {
  let out = html;
  const applied: string[] = [];
  const skipped: { qid: string; reason: string }[] = [];
  const configs = new Map<string, Record<string, string>>();
  for (const r of requirements) {
    const raw = answers.get(r.qid);
    if (!raw || r.status === "answered") continue;
    const waive = WAIVE.exec(raw.trim());
    let res: { ok: true; html: string } | { ok: false; error: string };
    if (waive) {
      res = setWaived(out, r.pid, r.field, waive[1].trim());
    } else {
      switch (r.write.kind) {
        case "attr": {
          if (r.write.key === "config" && r.pid) {
            // Behaviour settings accumulate into one data-wave-config.
            const [, setting] = r.field.includes(":") ? r.field.split(":") : [null, null];
            const cfg = configs.get(r.pid) ?? {};
            if (setting) cfg[setting] = raw.trim();
            else Object.assign(cfg, parseConfig(raw));
            configs.set(r.pid, cfg);
            applied.push(r.qid);
            continue;
          }
          res = r.pid ? setAttributes(out, r.pid, { [r.write.key]: raw.trim() }) : { ok: false, error: "no element" };
          break;
        }
        case "native":
          res = r.pid ? setNativeAttributes(out, r.pid, { [r.write.name]: raw.trim() }) : r.write.name === "lang" ? setDocumentAttribute(out, "lang", raw.trim()) : { ok: false, error: "no element" };
          break;
        case "meta":
          res = setMeta(out, r.write.key, raw.trim());
          break;
        case "resource": {
          const [type, source, ...rest] = raw.split(";").map((p) => p.trim());
          res = setResource(out, r.write.path, { type, source, description: rest.join("; ") });
          break;
        }
        default:
          skipped.push({ qid: r.qid, reason: "Answered by changing the design, not by text." });
          continue;
      }
    }
    if (res.ok) {
      out = res.html;
      applied.push(r.qid);
    } else skipped.push({ qid: r.qid, reason: res.error });
  }
  for (const [pid, cfg] of configs) {
    const value = Object.entries(cfg).map(([k, v]) => `${k}:${v}`).join("; ");
    const res = setAttributes(out, pid, { config: value });
    if (res.ok) out = res.html;
  }
  return { html: out, applied, skipped };
}
