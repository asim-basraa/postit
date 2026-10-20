import type { GateReport, GateSpacing, SpacingUse, SpacingVariable } from "./gate";

/**
 * Hand-typed spacing in a Figma file: how safely it could be bound to spacing
 * variables, and, when a person allows it for a project, a skill the
 * project's designer runs in their own Claude session to do it in Figma.
 *
 * Wave itself never changes Figma. It only reads the file (the gate) and
 * writes two things: the assessment, for the person who decides, and the
 * project's spacing skill, which the designer downloads and runs. The skill
 * never moves a pixel: it binds a gap or padding only to a variable of the
 * same value, and checks every layer after binding it.
 */

export type SpacingGroup = "exact" | "ambiguous" | "missing" | "off-scale" | "fractional";
export type SpacingRisk = "low" | "medium" | "high";

/** What the skill may do with one value: bind to a variable, create one, or leave the value as it is. */
export type SpacingOption =
  | { kind: "bind"; id: string; name: string; note?: string }
  | { kind: "create"; name: string }
  | { kind: "skip"; note?: string };

export type SpacingValue = {
  /** The value in px, as Figma has it. */
  px: number;
  /** The same in rem (px / 16), as the token will hold it. */
  rem: number;
  group: SpacingGroup;
  risk: SpacingRisk;
  count: number;
  props: Record<string, number>;
  areas: Record<string, number>;
  examples: [string, string, string][];
  /** Why it is in its group, in a sentence. */
  why: string;
  /** What the skill does unless the designer chooses otherwise. Anything not certain is skip. */
  proposed: SpacingOption;
  /** Everything the designer may choose from. Never a variable of another value: that would move the layer. */
  options: SpacingOption[];
};

export type SpacingPlan = {
  project: string;
  /** The Figma file key: the skill refuses to run on any other file. */
  file: string | null;
  /** When the gate's data was assessed (ISO). */
  at: string;
  /** The frames and components the gate checked: the only places the skill looks. */
  covers: string[];
  /** The collection new variables go in: an existing one by id, or a new one by name. */
  collection: { id: string } | { create: string };
  /** The group new variables are named in (space/18). */
  prefix: string;
  /** The grid the scale is built on (4 means 4, 8, 12...), or null when there is none to see. */
  grid: number | null;
  /** Spacing bound to a library's variables: the skill cannot add to a library. */
  library: number;
  values: SpacingValue[];
};

export type SpacingAssessment = {
  risk: SpacingRisk;
  /** Whether a spacing skill can be made for this file at all. */
  possible: boolean;
  /** Whether Wave recommends allowing it. */
  recommend: boolean;
  recommendation: string;
  layers: Record<SpacingGroup, number>;
  total: number;
  plan: SpacingPlan;
  markdown: string;
};

const rem = (px: number) => +(px / 16).toFixed(8);
const same = (a: number | null | undefined, b: number) => typeof a === "number" && Math.abs(a - b) < 0.01;
const isWhole = (x: number) => Math.abs(x - Math.round(x)) < 0.01;
const RISK: Record<SpacingGroup, SpacingRisk> = { exact: "low", ambiguous: "medium", missing: "medium", "off-scale": "high", fractional: "high" };

/**
 * The grid a scale is built on: the largest of 8, 4 and 2 that the values are multiples of.
 * The file's own variables are the scale, so every step must fit; hand-typed values are a
 * guess, so 80% of the layers is enough.
 */
function gridOf(values: { px: number; weight: number }[], share: number): number | null {
  const all = values.filter((v) => v.px > 0 && isWhole(v.px));
  const total = all.reduce((n, v) => n + v.weight, 0);
  if (!total) return null;
  for (const g of [8, 4, 2]) {
    const on = all.filter((v) => Math.round(v.px) % g === 0).reduce((n, v) => n + v.weight, 0);
    if (on / total >= share) return g;
  }
  return null;
}

/** The most common group of the spacing variables' names (space/16 is in space), else "spacing". */
function prefixOf(vars: SpacingVariable[]): string {
  const counts = new Map<string, number>();
  for (const v of vars) {
    const i = v.name.lastIndexOf("/");
    if (i > 0) counts.set(v.name.slice(0, i), (counts.get(v.name.slice(0, i)) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "spacing";
}

const modeNote = (v: SpacingVariable, px: number) => {
  const other = Object.values(v.byMode).filter((x) => !same(x, px));
  return other.length ? `is ${other.map((x) => (x === null ? "not a number" : `${x}px`)).join(", ")} in another mode, so a layer in that mode would change` : "";
};

/** Sorts every hand-typed value into a group, with what the skill may do with it. */
export function planSpacing(report: GateReport, opts: { project: string; at?: string }): SpacingPlan {
  const sp: GateSpacing = report.spacing ?? { raw: {}, remote: 0, variables: [] };
  const vars = sp.variables.filter((v) => v.px !== null);
  const counts = new Map<string, number>();
  for (const v of vars) counts.set(v.collection, (counts.get(v.collection) ?? 0) + 1);
  const collectionId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const prefix = prefixOf(vars);
  // Steps under 4px (a hairline, a 2px nudge) do not say what the scale is built on.
  const steps = vars.filter((v) => v.px! >= 4);
  const grid = steps.length >= 3 ? gridOf(steps.map((v) => ({ px: v.px!, weight: 1 })), 1) : gridOf(Object.entries(sp.raw).map(([k, u]) => ({ px: +k, weight: u.count })), 0.8);
  const names = new Set(sp.variables.map((v) => v.name));
  const newName = (px: number) => {
    const base = `${prefix}/${String(px).replace(".", "-")}`;
    return names.has(base) ? `${base}px` : base;
  };

  const values: SpacingValue[] = Object.entries(sp.raw).map(([k, u]: [string, SpacingUse]) => {
    const px = +k;
    const base = { px, rem: rem(px), count: u.count, props: u.props, areas: u.areas, examples: u.examples };
    const skip: SpacingOption = { kind: "skip" };
    if (!isWhole(px)) {
      return { ...base, group: "fractional", risk: "high", why: `A fraction of a pixel is almost always a layer that was scaled or nudged, not a spacing anyone chose. The designer sets a whole value by hand.`, proposed: { kind: "skip", note: "fix by hand in Figma" }, options: [{ kind: "skip", note: "fix by hand in Figma" }] };
    }
    const matches = vars.filter((v) => same(v.px, px));
    const steady = matches.filter((v) => !modeNote(v, px));
    if (matches.length === 1 && steady.length === 1) {
      const v = matches[0];
      return { ...base, group: "exact", risk: "low", why: `Exactly one spacing variable is ${px}px, in every mode.`, proposed: { kind: "bind", id: v.id, name: v.name }, options: [{ kind: "bind", id: v.id, name: v.name }, skip] };
    }
    if (matches.length) {
      const binds: SpacingOption[] = matches.map((v) => ({ kind: "bind", id: v.id, name: v.name, ...(modeNote(v, px) ? { note: modeNote(v, px) } : {}) }));
      const why = matches.length > 1 ? `${matches.length} spacing variables are ${px}px (${matches.map((v) => v.name).join(", ")}): which one a layer means is the designer's choice.` : `${matches[0].name} is ${px}px here but ${modeNote(matches[0], px)}.`;
      return { ...base, group: "ambiguous", risk: "medium", why, proposed: skip, options: [...binds, ...(steady.length ? [] : [{ kind: "create", name: newName(px) } as SpacingOption]), skip] };
    }
    const nearest = [...vars].sort((a, b) => Math.abs(a.px! - px) - Math.abs(b.px! - px)).slice(0, 2).map((v) => `${v.name} (${v.px}px)`);
    const near = nearest.length ? ` The nearest variables are ${nearest.join(" and ")}; using one of them means changing the design, which only the designer does, by hand.` : "";
    if (grid && Math.round(px) % grid === 0 && u.count >= 2) {
      return { ...base, group: "missing", risk: "medium", why: `No variable is ${px}px, but it is on the ${grid}px grid and used on ${u.count} layers: a step the scale is missing.`, proposed: { kind: "create", name: newName(px) }, options: [{ kind: "create", name: newName(px) }, skip] };
    }
    const reason = !grid ? `No variable is ${px}px, and the file's spacing has no grid to check it against.` : Math.round(px) % grid !== 0 ? `No variable is ${px}px, and it is off the ${grid}px grid the scale is built on: it may be a slip.` : `No variable is ${px}px, and it is used on only one layer: it may be a one-off.`;
    return { ...base, group: "off-scale", risk: "high", why: reason + near, proposed: skip, options: [{ kind: "create", name: newName(px) }, skip] };
  });
  values.sort((a, b) => a.px - b.px);
  return {
    project: opts.project,
    file: report.file,
    at: opts.at ?? new Date().toISOString(),
    covers: report.covers,
    collection: collectionId ? { id: collectionId } : { create: "Spacing" },
    prefix,
    grid,
    library: sp.remote,
    values,
  };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const cell = (s: string) => s.replace(/\|/g, "/").replace(/\n/g, " ");
const optionText = (o: SpacingOption) => (o.kind === "bind" ? `bind to \`${o.name}\`${o.note ? ` (it ${o.note})` : ""}` : o.kind === "create" ? `create \`${o.name}\`` : `leave it${o.note ? ` (${o.note})` : ""}`);

/** The assessment for the person who decides whether the project gets a spacing skill. */
export function assessSpacing(report: GateReport, opts: { project: string; at?: string; version?: number }): SpacingAssessment {
  if (!report.spacing) throw new Error("This gate report has no spacing data: it was made before Wave collected it. Run the GATE script again.");
  const plan = planSpacing(report, opts);
  const layers: Record<SpacingGroup, number> = { exact: 0, ambiguous: 0, missing: 0, "off-scale": 0, fractional: 0 };
  for (const v of plan.values) layers[v.group] += v.count;
  const total = Object.values(layers).reduce((a, b) => a + b, 0);
  const high = layers["off-scale"] + layers.fractional;
  const risk: SpacingRisk = high ? "high" : layers.ambiguous + layers.missing ? "medium" : "low";
  const localVars = (report.spacing?.variables ?? []).length;
  const possible = total > 0 && !(plan.library > 0 && localVars === 0);

  let recommend = possible;
  let recommendation: string;
  if (!total) {
    recommend = false;
    recommendation = "Nothing to do: every gap and padding the gate checked is bound to a variable.";
  } else if (!possible) {
    recommendation = `Not possible here: this file's spacing variables come from a library (${plural(plan.library, "binding")}), and a skill run in this file cannot add variables to a library. The designer adds the missing steps in the library, then binds the layers.`;
  } else if (high / total > 0.2) {
    recommend = false;
    recommendation = `Not recommended: ${Math.round((high / total) * 100)}% of the hand-typed spacing is off the scale or a fraction of a pixel. A file not drawn on a scale gives variables that freeze its accidents. The designer settles the scale in Figma first; assess again after.`;
  } else if (risk === "high") {
    recommendation = `Allow only if the designer decides each high-risk value in the session (${plural(high, "layer")}). The skill leaves them as they are unless the designer chooses otherwise, so they stay in the readiness report until settled.`;
  } else if (risk === "medium") {
    recommendation = "Allow: the designer confirms the name of each new variable and chooses the variable for each value that matches more than one.";
  } else {
    recommendation = "Allow: every value matches exactly one variable in every mode. Nothing moves and nothing is created.";
  }

  const fileLink = (id?: string) => (plan.file ? `https://www.figma.com/design/${plan.file}${id ? `?node-id=${id.replace(/:/g, "-")}` : ""}` : null);
  const at = plan.at.slice(0, 10);
  const lines = [`# Figma spacing assessment: ${opts.project}`, ""];
  lines.push(`${opts.version ? `**Version ${opts.version}**, assessed` : "Assessed"} ${at}, from the entry gate's check of ${plural(plan.covers.length, "frame or component", "frames and components")}.${fileLink() ? ` [Open the file in Figma](${fileLink()}).` : ""}`, "");
  lines.push(
    "Wave never changes Figma. This page is for deciding whether this project's designer gets a **spacing skill**: a skill Wave writes for this project only, which the designer downloads and runs in their own Claude session, with Figma attached, to bind hand-typed gaps and paddings to spacing variables in the file itself. Figma stays the source of truth; the tokens follow from it as before.",
    "",
  );
  lines.push(`## Verdict: ${risk} risk`, "", recommendation, "");
  lines.push(
    "| Group | Values | Layers | Risk | What the skill does unless the designer chooses otherwise |",
    "|---|---|---|---|---|",
    ...(
      [
        ["exact", "Binds to the one variable of the same value"],
        ["ambiguous", "Leaves it; the designer chooses which variable"],
        ["missing", "Creates the missing step, with the name the designer confirms"],
        ["off-scale", "Leaves it; the designer creates a variable for it or changes the design by hand"],
        ["fractional", "Leaves it; the designer sets a whole value by hand"],
      ] as [SpacingGroup, string][]
    ).map(([g, does]) => `| ${g} | ${plan.values.filter((v) => v.group === g).length} | ${layers[g]} | ${RISK[g]} | ${does} |`),
    "",
  );
  if (plan.grid) lines.push(`The scale is built on a **${plan.grid}px grid**. New variables go in ${"id" in plan.collection ? "the collection most spacing variables are in" : `a new collection, **${plan.collection.create}**`}, named \`${plan.prefix}/<px>\`; the designer can rename each one in the session.`, "");
  else lines.push(`No grid shows in the file's spacing, so no value can be called a missing step: each one is the designer's call. New variables go in ${"id" in plan.collection ? "the collection most spacing variables are in" : `a new collection, **${plan.collection.create}**`}, named \`${plan.prefix}/<px>\`.`, "");

  lines.push("## Every value", "", "| Value | rem | Layers | Where | Group | Proposed | Why |", "|---|---|---|---|---|---|---|");
  for (const v of plan.values) {
    const where = Object.entries(v.areas).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => `${cell(a)} (${n})`).join(", ");
    const ex = v.examples[0];
    const value = ex && fileLink(ex[0]) ? `[${v.px}px](${fileLink(ex[0])})` : `${v.px}px`;
    lines.push(`| ${value} | ${v.rem}rem | ${v.count} | ${where} | ${v.group} | ${optionText(v.proposed)} | ${cell(v.why)} |`);
  }

  lines.push(
    "",
    "## What can go wrong",
    "",
    "**Misunderstanding: a value is not a meaning.** The skill sees 16px, not \"the gap between cards\". Binding by value is certain only when one variable has that value in every mode; then the result is the same as the designer binding it. Everything else is the designer's choice in the session: which of two 16px variables a layer means, whether a missing step deserves a variable, and whether an odd value is intended or a slip.",
    "",
    "**Missing: what the skill does not touch.**",
    "",
    "- Only the frames and components the gate checked. Pages not in the check are not looked at.",
    "- Not the inside of instances: an instance follows its main component, which is bound on the design-system page. An instance's own overrides are left as they are.",
    "- Not other modes' values: a variable that differs in another mode is never bound without the designer choosing it.",
    "- Not a library's variables: they cannot be added to from this file.",
    "- Not anything else: colours, radii, sizes and text stay as they are.",
    "",
    "If the file changes after this assessment, the skill finds the values it was not told about and leaves them; assess again to include them.",
    "",
    "## What is certain",
    "",
    "- **Nothing moves.** A layer is bound only to a variable of exactly its value, and the skill reads the layer back after binding it; if its value changed, it undoes that binding and stops.",
    "- **It can be undone in one step.** Before changing anything, the skill saves a named version in the file's history.",
    "- **It runs only on this file**, with the decisions the designer approved in the session, and lists every change it made.",
    "",
    "## Deciding",
    "",
    "Allowing it is a decision for this project only. Wave then writes the project's spacing skill next to this page. The designer runs it; Wave never runs it and never changes Figma. After it has run, the engineer checks the file again, and the next readiness report shows what was fixed.",
    "",
  );
  return { risk, possible, recommend, recommendation, layers, total, plan, markdown: lines.join("\n") };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * The changes the skill would make: every unbound gap and padding with a value the
 * designer decided, in the frames and components the gate checked, not inside
 * instances. Self-contained, as the plugin script carries it as source.
 */
export function spacingChanges(roots: any[], decided: Record<string, unknown>): { changes: [string, string, string, number, string][]; unplanned: Record<string, number> } {
  const changes: [string, string, string, number, string][] = [];
  const unplanned: Record<string, number> = {};
  const PROPS = ["itemSpacing", "counterAxisSpacing", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft"];
  const visit = (n: any) => {
    if (n.type === "INSTANCE") return;
    if (n.layoutMode && n.layoutMode !== "NONE") {
      for (const prop of PROPS) {
        if (prop === "counterAxisSpacing" && n.layoutWrap !== "WRAP") continue;
        const v = n[prop];
        if (typeof v !== "number" || v === 0) continue;
        if (n.boundVariables && n.boundVariables[prop]) continue;
        const key = String(+v.toFixed(2));
        const d: any = decided[key];
        if (d && typeof d === "object" && (d.bind || d.create)) changes.push([n.id, n.name, prop, v, d.bind ? "bind:" + d.bind : "create:" + d.create]);
        else if (!(key in decided)) unplanned[key] = (unplanned[key] || 0) + 1;
      }
    }
    for (const c of n.children || []) visit(c);
  };
  for (const r of roots) visit(r);
  return { changes, unplanned };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** The decisions the skill starts from: the proposed action for each value. */
export function proposedDecisions(plan: SpacingPlan): Record<string, { bind: string } | { create: string } | "skip"> {
  return Object.fromEntries(
    plan.values.map((v) => [String(v.px), v.proposed.kind === "bind" ? { bind: v.proposed.id } : v.proposed.kind === "create" ? { create: v.proposed.name } : "skip"]),
  );
}

/**
 * The plugin script the project's skill runs with use_figma: MODE "dry" lists the
 * changes (in parts), MODE "apply" saves a version, creates the decided variables,
 * binds, checks each layer, and stops at the first that changed.
 */
export function spacingScript(plan: SpacingPlan): string {
  return `
const PLAN = ${JSON.stringify({ file: plan.file, covers: plan.covers, collection: plan.collection, values: plan.values.map((v) => ({ px: v.px, options: v.options })) })};
const DECISIONS = {{DECISIONS}};
const MODE = "{{MODE}}";
const PART = {{PART}};
const CHECKPOINT = "{{CHECKPOINT}}";
const changesOf = ${spacingChanges.toString()};
if (PLAN.file && figma.fileKey && figma.fileKey !== PLAN.file) throw new Error("This skill is for another Figma file (" + PLAN.file + "). Open that file.");
// Only what the plan allows for each value: never a variable of another value.
const allowed = {};
for (const v of PLAN.values) allowed[String(v.px)] = v.options;
for (const [k, d] of Object.entries(DECISIONS)) {
  if (!(k in allowed)) throw new Error("No value " + k + "px in this project's plan.");
  if (d === "skip") continue;
  const ok = allowed[k].some((o) => (d.bind && o.kind === "bind" && o.id === d.bind) || (d.create && o.kind === "create"));
  if (!ok) throw new Error("The plan does not allow " + JSON.stringify(d) + " for " + k + "px.");
  if (d.create && !/^[^/\\s][^\\n]*[^/\\s]$/.test(d.create)) throw new Error("Not a variable name: " + d.create);
}
const roots = [];
for (const id of PLAN.covers) {
  const n = await figma.getNodeByIdAsync(id);
  if (!n) continue;
  let p = n; while (p && p.type !== "PAGE") p = p.parent;
  if (p) await p.loadAsync();
  roots.push(n);
}
const { changes, unplanned } = changesOf(roots, DECISIONS);
if (MODE === "dry") {
  const byValue = {};
  for (const c of changes) byValue[c[3]] = (byValue[c[3]] || 0) + 1;
  const s = JSON.stringify(changes);
  const size = 15000;
  return { mode: "dry", missingCovers: PLAN.covers.length - roots.length, total: changes.length, byValue, unplanned, parts: Math.max(1, Math.ceil(s.length / size)), part: PART, data: s.slice(PART * size, (PART + 1) * size) };
}
if (MODE !== "apply") throw new Error("MODE is dry or apply.");
if (!changes.length) return { mode: "apply", bound: 0, created: [], note: "Nothing to change." };
if (CHECKPOINT !== "saved-by-designer") {
  try {
    await figma.saveVersionHistoryAsync("Before spacing variables", "Saved by the project's spacing skill before it bound gaps and paddings to variables.");
  } catch (e) {
    return { mode: "apply", stopped: "Could not save a version first (" + (e && e.message ? e.message : e) + "). Nothing was changed.", bound: 0, created: [] };
  }
}
// The collection: the plan's, or a new one.
let col = PLAN.collection.id ? await figma.variables.getVariableCollectionByIdAsync(PLAN.collection.id) : null;
if (PLAN.collection.id && !col) throw new Error("The spacing collection is gone from the file. Assess again.");
const creates = [...new Set(Object.values(DECISIONS).filter((d) => d && d.create).map((d) => d.create))];
if (creates.length && !col) col = figma.variables.createVariableCollection(PLAN.collection.create);
const existing = col ? (await figma.variables.getLocalVariablesAsync("FLOAT")).filter((v) => v.variableCollectionId === col.id).map((v) => v.name) : [];
for (const name of creates) if (existing.indexOf(name) >= 0) throw new Error("A variable named " + name + " already exists. Choose another name.");
const made = {};
const created = [];
for (const [k, d] of Object.entries(DECISIONS)) {
  if (!d || !d.create || made[d.create]) continue;
  const v = figma.variables.createVariable(d.create, col, "FLOAT");
  for (const m of col.modes) v.setValueForMode(m.modeId, Number(k));
  v.scopes = ["GAP"];
  made[d.create] = v;
  created.push([d.create, Number(k), v.id]);
}
const byId = {};
let bound = 0;
for (const [id, name, prop, before, target] of changes) {
  const n = await figma.getNodeByIdAsync(id);
  let v = null;
  if (target.startsWith("create:")) v = made[target.slice(7)];
  else v = byId[target] || (byId[target] = await figma.variables.getVariableByIdAsync(target.slice(5)));
  if (!n || !v) return { mode: "apply", stopped: "Could not find " + (n ? "the variable for " : "the layer ") + name, bound, created };
  n.setBoundVariable(prop, v);
  if (Math.abs(n[prop] - before) > 0.01) {
    const now = n[prop];
    n.setBoundVariable(prop, null);
    n[prop] = before;
    return { mode: "apply", stopped: name + " " + prop + " would have changed from " + before + " to " + now + ": undone, and the skill stopped.", layer: id, bound, created };
  }
  bound++;
}
return { mode: "apply", bound, created };
`;
}

/** The project's spacing skill: what the designer downloads and runs in their own Claude session. */
export function spacingSkill(plan: SpacingPlan, opts: { assessmentLink?: string } = {}): string {
  const decisions = proposedDecisions(plan);
  const fileLink = plan.file ? `https://www.figma.com/design/${plan.file}` : "(the project's Figma file)";
  const rows = plan.values.map((v) => `| ${v.px}px | ${v.rem}rem | ${v.count} | ${v.group} (${v.risk}) | ${optionText(v.proposed)} | ${v.options.map(optionText).join("; ")} |`);
  return `---
name: ${plan.project} Figma spacing
description: For the ${plan.project} designer only, on ${plan.project}'s Figma file. Binds hand-typed gaps and paddings to spacing variables in Figma, creating the missing steps the designer approves. Never moves a pixel, saves a version first, and lists every change. Run it when the designer asks for it.
---

# ${plan.project} Figma spacing

This skill is for **${plan.project}** only, and only for the file ${fileLink}. Wave wrote it from its spacing
assessment of ${plan.at.slice(0, 10)}${opts.assessmentLink ? ` (${opts.assessmentLink})` : ""}, after a person allowed it for this project. Wave
itself never changes Figma: you, the designer, run this in your own Claude session.

It needs Figma attached to Claude with edit access to the file (Figma runs scripts only for
editors). If \`use_figma\` is not available, stop and say so.

## Rules

- Only the decisions the designer approves in this session. Nothing is changed before the designer
  says yes to the whole list.
- Never move a pixel: a layer is bound only to a variable of exactly its value. Never bind a value to
  a variable of another value, even a near one; that is a design change the designer makes by hand.
- Never change anything but the binding of gaps and paddings, and the creation of the approved
  variables. Not colours, sizes, text, layers or components.
- Never the inside of instances: they follow their main components.
- Stop at the first problem and tell the designer. Never work around the script.

## 1. Decide

Show the designer the plan below, in their words:

1. The **exact** values as one block ("${plural(plan.values.filter((v) => v.group === "exact").reduce((n, v) => n + v.count, 0), "layer")} bind to the one variable of their value; confirm?").
2. Then each other value, one at a time: what it is, where it is used, and its choices. For a new
   variable, ask for its name (propose the one in the plan). Leaving a value is always a choice.

| Value | rem | Layers | Group (risk) | Proposed | Choices |
|---|---|---|---|---|---|
${rows.join("\n")}

Write the answers as the decisions: an object from the value (as in the table, without px) to
\`{"bind": "<variable id>"}\`, \`{"create": "<name>"}\` or \`"skip"\`. The proposal is:

\`\`\`json
${JSON.stringify(decisions, null, 2)}
\`\`\`

Read the whole list back and ask the designer to approve it. Only then go on.

## 2. Dry run

Run the script below with \`use_figma\`, with \`{{DECISIONS}}\` replaced by the approved decisions,
\`{{MODE}}\` by \`dry\`, \`{{CHECKPOINT}}\` by \`auto\` and \`{{PART}}\` by \`0\` (then 1, 2... while \`part\`
is below \`parts\`). It
changes nothing. It returns how many layers each value would bind, and \`unplanned\`: values in the
file now that this plan does not know (the file changed since the assessment; they are left).
Tell the designer the counts. Keep the list of changes for the change log.

If \`missingCovers\` is not 0, frames or components have been deleted since the assessment: tell the
designer, who decides whether to go on.

## 3. Apply

With the designer's yes, run the same script with \`{{MODE}}\` as \`apply\`. It saves a version named
"Before spacing variables" (the designer can go back to it from File, Show version history), creates
the approved variables, binds each layer, and checks it: if a layer's value changed, it undoes that
binding and stops, saying which layer. Report \`bound\`, \`created\` and any \`stopped\`.

If it stops because it could not save a version, nothing was changed. Ask the designer to save one
by hand (File, Save to version history, named "Before spacing variables"). Only when they say it is
saved, run it again with \`{{CHECKPOINT}}\` as \`saved-by-designer\`. Never use that value otherwise.

Then run the dry run again: it should find nothing left for the approved values.

## 4. Change log

Write the change log for the designer and the engineer: the date, the version saved, each variable
created (name, px, rem), and each layer bound (layer, property, variable), from the dry run's list.
Save it as a file, and in Post-it next to the assessment if Post-it is attached. Tell the designer
to let the engineer know: the engineer checks the file again in Wave, and the next readiness report
lists the spacing as fixed.

## The script

\`\`\`js
${spacingScript(plan).trim()}
\`\`\`
`;
}
