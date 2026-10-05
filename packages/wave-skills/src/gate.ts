import type { HostSteps } from "./design";

/**
 * Wave Figma Gate: the entry gate run by anyone (usually the designer) from a
 * chat with only the Figma and host connectors, no command line. The gate
 * script and the rules table are passed in from @wave/figma, so the skill runs
 * exactly the script `wave-figma script GATE` prints and grades it with the
 * same rules `wave-figma gate` uses. It is a self-check: the official gate is
 * still the engineer's run in Wave Figma.
 */

export type GateRule = { severity: "blocking" | "advice"; title: string; fix: string };

const fence = (lang: string, body: string) => "```" + lang + "\n" + body.trimEnd() + "\n```";

/** Finds what each linked node is and which page it is on, before the gate runs. */
const LOCATE = `const ids = {{IDS}};
const out = [];
for (const id of ids) {
  const n = await figma.getNodeByIdAsync(id);
  if (!n) { out.push({ id, missing: true }); continue; }
  let p = n; while (p && p.type !== "PAGE") p = p.parent;
  out.push({ id, type: n.type, name: n.name, page: p ? p.id : null, pageName: p ? p.name : null });
}
return { file: figma.fileKey || null, nodes: out };`;

export function waveFigmaGateSkill(steps: HostSteps, gate: { script: string; rules: Record<string, GateRule> }): string {
  const H = steps.host;
  const rows = Object.entries(gate.rules)
    .sort((a, b) => (a[1].severity === b[1].severity ? 0 : a[1].severity === "blocking" ? -1 : 1))
    .map(([rule, r]) => `| \`${rule}\` | ${r.severity} | ${r.title} | ${r.fix.replace(/\|/g, "\\|")} |`);
  return `---
name: Wave Figma Gate
description: Runs Wave's Figma entry gate on a Figma file, read-only, for a project in ${H}, and lists what to fix in Figma (blocking) and what is optional (advice), with a link to each layer. For the designer, from a chat with the Figma and ${H} connectors and no command line. Use when someone says "run the gate", "check my Figma file for Wave" or "is <project> ready for Wave".
---

# Wave Figma Gate

Wave takes a Figma file only when it passes the entry gate: the gate reads the
file and lists what Wave cannot take exactly as drawn. **Blocking** findings
are fixed in Figma; **advice** is optional. This skill lets the designer run
the gate as often as they like while fixing the file. It is a self-check: when
it passes, the engineer runs the official gate (Wave Figma) on that version.

## Rules

- **Read only.** Never change the Figma file and never offer to; the designer
  fixes it in Figma.
- **The script as published.** Run the gate script below exactly, changing
  only its three placeholders. Never edit, shorten, rewrite or re-create it.
- **The gate is the gate.** Report every finding as the gate gives it. Never
  call a blocking finding fine, and never suggest changing Wave to fit the file.
- **If anything cannot be reached** (the Figma connector, the file, a page,
  ${H}) or a script throws, stop and say exactly what failed. Never take
  another route to the same result.
- Load the Figma connector's \`figma-use\` skill before the first
  \`use_figma\`, as that connector requires.

## What you need from the designer

1. The **project** name in ${H} (for example "keel").
2. The **Figma links**: the design-system page and the screens page (each
   link with its \`node-id\`). A frame link works too: the gate checks that
   frame. Several screen pages or frames are fine.

Ask only for what is missing. If the project has a **Wave Figma progress**
article that lists the links, propose those.

## 1. Find the project

${steps.findProject ?? steps.projects}
   - Do not create anything. If there is no such project, say so and stop.
   - Read the project's **Figma entry gate** article if it exists: it is the
     last official result, to compare with.

## 2. Locate the nodes

Take the file key from the links (\`figma.com/design/<file key>/...\`) and each
\`node-id\` (\`28-129\` in a link is the node \`28:129\`). All links must be the
same file. Run this with \`use_figma\`, with \`{{IDS}}\` replaced by the ids as
a JSON array, for example \`["28:129","1:86"]\`:

${fence("js", LOCATE)}

A node that is \`missing\` means a wrong link or no access: stop and say so.
The **design-system page** is the \`page\` of the design-system link.

## 3. Run the gate

Replace exactly these three placeholders, and nothing else:

- \`{{IDS}}\`: the ids from the links, as a JSON array, design system first.
- \`{{PAGE}}\`: the design-system page id from step 2.
- \`{{PART}}\`: \`0\`.

Run it with \`use_figma\` on the file key, description "Wave entry gate
(read-only)". It returns \`checksum\`, \`length\`, \`parts\`, \`part\` and
\`data\`. When \`parts\` is more than 1, run it again with \`{{PART}}\` as 1, 2
and so on, and join the \`data\` pieces in order: together they are one JSON
report of \`length\` characters.

${fence("js", gate.script)}

## 4. Grade it

The report's \`hits\` maps each rule to its \`count\` and its \`nodes\`, each
\`[node id, layer name, detail, area]\` (the area is the component or screen it
is in). Give each rule its severity from this table. A rule not in it is
blocking. The gate **passes** only when no blocking rule has findings.

| Rule | Severity | What it is | How to fix it in Figma |
| --- | --- | --- | --- |
${rows.join("\n")}

## 5. Report

1. **PASS** or **FAIL**, then the blocking and advice counts, and what was
   checked: the report's \`areas\` (components and screens) and \`fonts\`.
2. **Changed since the last official gate**, when the project has one: what is
   fixed, what is still open, what is new (match layers by name; node ids can
   change between files).
3. **Blocking**, by rule: the rule's fix, then a table of area, layer, detail
   and a link \`https://www.figma.com/design/<file key>/?node-id=<node id with : as ->\`.
4. **Advice**: one line per rule with its count.

When the designer has fixed something and asks again, run step 3 again.

## When it passes

Tell the designer to send the engineer the Figma design link, the prototype
link and this result (PASS, 0 blocking, the \`checksum\`), so the engineer runs
the official gate on the same version.
`;
}
