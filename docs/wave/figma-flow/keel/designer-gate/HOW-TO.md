# Keel: run Wave's entry gate yourself

Wave turns the Keel Figma file into a prototype only when the file passes its
entry gate. The gate reads the file (it never changes it) and lists what Wave
cannot take as drawn. Findings marked **blocking** must be fixed in Figma.
Findings marked **advice** are optional.

Run the gate as often as you like while you fix the file. When it shows
**0 blocking**, send the file link to Asim, who runs the official gate.

## What you need (one time)

1. Claude (claude.ai or the Claude desktop app).
2. The Figma connector connected in Claude: Settings > Connectors > Figma >
   Connect, signed in with the Figma account that can open the Keel file.
3. The two files from this kit: `keel-gate-script.js` and `GATE-RULES.md`.

## Keep the file's structure

The script reads two pages by their node ids. Do not rebuild, delete or
re-create them:

- Design system page: node `28:129`
- Screens page: node `1:86`

Edit freely inside them. If you duplicate the file, the node ids carry over,
so the script still works. Use the new file's link in the prompt.

## Run the gate

1. Start a **new chat** in Claude.
2. Attach `keel-gate-script.js` and `GATE-RULES.md`.
3. Paste this prompt, with your current file link in place of `<FIGMA LINK>`:

```
Run Wave's entry gate on this Figma file: <FIGMA LINK>

Rules:
- Read only. Do not change anything in the Figma file.
- Load the figma-use skill first, as the Figma connector requires.
- Run the attached keel-gate-script.js exactly as it is with use_figma on
  this file's key. Do not edit or rewrite the script; the only allowed
  change is the line `const part = 0;` (see below).
- The result has `data`, `checksum` and `parts`. If `parts` is more than 1,
  run the script again with `const part = 1;`, then 2, and so on, and join
  the `data` pieces in order. `data` is one JSON report.
- If anything fails (connector, file, page, script error), stop and tell me
  exactly what failed. Do not try another route.
- Use the attached GATE-RULES.md to give each rule its severity.

Report in this format:
1. PASS or FAIL. The gate passes only when there are 0 blocking findings.
   Then the totals: blocking count and advice count.
2. Blocking findings, grouped by rule. For each rule give its "How to fix it"
   text, then a table with: screen or component (the 4th value of each
   node entry), layer name, detail, and a link built as
   https://www.figma.com/design/<file key>/?node-id=<node id with : replaced by ->
3. Advice findings, one line per rule with the count.
4. Fonts used (the report's "fonts").
```

4. Fix the blocking findings in Figma, then run it again. You can reuse the
   same chat: say "run the gate again".

## When it passes

Send Asim:

- the Figma file link (design file, not prototype),
- the prototype link, starting at About-you,
- the last gate result from Claude (PASS, 0 blocking).

Asim then runs the official gate. If it disagrees with yours, Asim sends you
the list.

## Tips for the findings open on 22:05

- **Instance at another size than its component** (6 Option rows inside the
  Select's Open variant set to Fill): set them to Hug, or give the Select
  option component a full-width variant or a size variable for its width.
- **Boolean property away from its default** (the Select on Budget & timing
  with Show helper on): make "Show helper" a variant property of Select and
  draw that variant, or set the property back to its default.
- **Instance restyled** (Chips and Option cards on the screens, detail
  "boundVariables"): these instances carry the same variables as their
  component, yet Figma marks them as overridden, probably since the
  interactions were added. Try resetting the overrides on one instance
  (right-click > Reset all changes), re-add its interaction, and run the
  gate again to see whether it clears. Tell Asim what happened either way.
- Advice "Instance recoloured with variables" on icons is fine to leave.
