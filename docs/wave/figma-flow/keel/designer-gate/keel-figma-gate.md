---
name: Keel Figma Gate
description: For the Keel designer. Runs Wave's Figma entry gate on the Keel Figma file, read-only, and lists what to fix in Figma (blocking) and what is optional (advice), with a link to each layer. Use when the designer says "run the gate", "check my Figma file for Wave" or "is Keel ready for Wave".
---

# Keel Figma Gate

Wave turns the Keel Figma file into a prototype only when the file passes its
entry gate. This skill runs the gate for the designer so they can fix the file
in Figma and send Asim a version that passes. Asim then runs the official
gate. This run is the designer's self-check.

## Rules

- Read only. Never change anything in the Figma file, and never offer to.
- Load the figma-use skill first, as the Figma connector requires before
  `use_figma`.
- Run the gate script exactly as published. Do not edit, shorten, rewrite or
  re-create it. The only allowed change is the line `const part = 0;`.
- If anything cannot be reached (the Figma connector, the file, a page, the
  script or rules page in Post-it) or the script throws, stop and tell the
  designer exactly what failed. Do not try another route.
- Never fix in your report what should be fixed in Figma: report findings as
  they are.

## What the designer needs

1. The Figma connector connected in Claude, signed in with the Figma account
   that can open the Keel file.
2. The Post-it staging connector, with access to the Design space (and the
   Wave space for the docs below).
3. The Keel file keeps its two pages: Design system (node `28:129`) and the
   screens page (node `1:86`). Edit inside them freely; do not rebuild them.
   A duplicated file keeps its node ids, so a copy works too.

## Steps

1. Ask for the Figma file link if the designer has not given one. Take the
   file key from it (`figma.com/design/<file key>/...`).
2. Read the script page `keel/skills/keel-gate-script` in the Design space
   (`read_page`). Its `script` value is the gate script.
3. Run `script` with `use_figma` on the file key, description
   "Wave entry gate (read-only)".
4. The result has `data`, `checksum`, `length` and `parts`. If `parts` is
   more than 1, run the script again with `const part = 1;`, then 2, and so
   on, and join the `data` pieces in order. `data` is one JSON report.
5. Read `keel/skills/keel-gate-rules` in the Design space for each rule's
   severity and fix.
6. Report, in this format:
   1. **PASS** or **FAIL**. The gate passes only when no rule marked blocking
      has findings. Then the totals: blocking and advice counts.
   2. Blocking findings grouped by rule: the rule's "How to fix it" text, then
      a table with the area (the 4th value of each node entry: a component or
      screen), the layer name, the detail, and a link built as
      `https://www.figma.com/design/<file key>/?node-id=<node id with : as ->`.
   3. Advice findings, one line per rule with its count.
   4. Fonts used (the report's `fonts`).
7. When the designer fixes something and asks again, run the gate again from
   step 3.

## When it passes

Tell the designer to send Asim the Figma design link, the prototype link
(starting at About-you), and this result (PASS, 0 blocking, with the
`checksum`).

## Known findings on the 22:05 file

- **Instance at another size than its component**: the 6 Option rows in the
  Select's Open variant fill their parent. Set them to Hug, or give Select
  option a full-width variant or a size variable for its width.
- **Boolean property away from its default**: the Select on Budget & timing
  has Show helper on. Make "Show helper" a variant property of Select and
  draw that variant, or set it back to its default.
- **Instance restyled** with detail "boundVariables" on Chips and Option
  cards: the instances carry the same variables as their component, yet
  Figma marks them overridden, probably since their interactions were added.
  Suggest resetting the overrides on one instance (right-click, Reset all
  changes), re-adding its interaction and running the gate again. Ask the
  designer to tell Asim whether it cleared.
- Advice "Instance recoloured with variables" on icons is fine to leave.

## Read more (Post-it staging)

- Figma quick guide: https://post.staging.maqsoodlabs.com/s/wave/figma-quick-guide
- Figma entry gate, every rule: https://post.staging.maqsoodlabs.com/s/wave/reference/figma-entry-gate
- User manual: https://post.staging.maqsoodlabs.com/s/wave/user-manual
- Concepts: https://post.staging.maqsoodlabs.com/s/wave/concepts
- Wave Figma skill: https://post.staging.maqsoodlabs.com/s/wave/skills/engineering/wave-figma
- Keel readiness report: https://post.staging.maqsoodlabs.com/s/design/keel/figma-readiness-report
- Keel entry gate (last published): https://post.staging.maqsoodlabs.com/s/design/keel/figma-entry-gate
- Keel design system: https://post.staging.maqsoodlabs.com/s/design/keel/design-system/design-system
