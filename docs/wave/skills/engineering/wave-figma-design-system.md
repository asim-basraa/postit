---
name: Wave Figma Design System
description: Stage 2 of the Figma flow. Checks the Figma design-system page, refuses it with a readiness report for the designer if Wave cannot convert it exactly, otherwise builds the tokens and one specimen per component in Post-it, gets the designer's approval there, and writes the design-system page. Load it from Wave Figma.
---

# Wave Figma Design System

No screen is converted until the catalogue is approved.

## 1. Is the file ready?

1. Ask which page is the design-system page (propose it from the page names).
2. `wave-figma script GATE --page <design-system page> --ids <design-system page>`,
   run with `use_figma`, save as `gate.json`, checksum it.
3. `wave-figma gate --report gate.json --fonts`. If anything blocks or a font
   cannot be served: write and publish the **readiness report**, tell the
   engineer in two or three sentences what the designer has to change, give
   the link, offer the Figma edit only as the rules say, and stop. When the
   designer says it is done, start again at step 2.

## 2. Tokens and fonts

1. `script VARIABLES` and `script STYLES` (as in stage 1), then
   `wave-figma tokens --variables vars.txt --styles styles.json -o tokens.json`:
   it must report no problems. Save it as the JSON page `design-system/tokens`.
2. `wave-figma fonts --families "<families from the gate>" --out fonts/`, then
   `upload_asset` for each file, then `wave-figma font-css --manifest fonts/fonts.json --urls urls.json -o fonts.css`.

## 3. One specimen per component

For each component set and component on the page, without asking:

1. `script COMPONENT --node <set>` (save as `component.json`),
   `script BINDINGS --ids <set>`, `script EFFECTS --node <set>`,
   `script EXPORT_SVG --ids <its vectors>`, Figma's `get_design_context` and
   `get_screenshot`.
2. `wave-figma convert --gate gate.json --component component.json --type <element type>
   --code code.tsx --width <w> --height <h> --tokens tokens.json --bindings bindings.txt
   --effects effects.json --svgs svgs.json --fonts fonts.css -o specimen.html`.
   The element type is Wave's (button, textInput, checkbox, radio, select,
   navigation, icon, text...). Ask the engineer only when two fit ("Is Option
   card a checkbox or a radio?").
3. `wave-figma align`, then `wave-figma fidelity --component component.json`
   against the screenshot. Record every result for the report.
4. Where Figma drew a picture of a control, an upgrade plan makes the real
   element (`wave-figma upgrade --plan`); the look lock must be clean.
5. `wave-figma ids` (with `--from <published specimen>` when there is one),
   then `wave-figma preflight`, then Post-it's `preflight_html` (target = the
   project).

If any specimen does not match Figma, the file is **not ready**: publish the
readiness report with the fidelity results and stop, as in 1.3.

## 4. Publish for the designer

1. `wave_upload_link`, then `wave-figma send --link <link> --tool create_page`
   (or `update_page` for a new version) with `--file content=specimen.html`,
   one call per specimen, into `design-system/components`.
2. `wave_design_system_page`: it writes the design-system page and its JSON
   from the specimens. Never write that table by hand.
3. `ask_for_review` on each specimen. Tell the engineer: "The design system is
   ready for the designer to review in Post-it: <link to the design-system page>.
   They compare each specimen with Figma, comment on anything wrong, and
   approve." Record "waiting for the designer" in **Wave Figma progress**.

## 5. The designer's answer

When the engineer comes back:

1. `list_comments` on the specimens. A comment about the conversion (a page
   that differs from Figma): fix it in Wave's output only if the fix keeps the
   page exactly as Figma draws it, publish the new version and
   `mark_addressed`. A comment that needs a change in Figma: it goes in the
   readiness report for the designer, as in 1.3.
2. `read_page` each specimen: when its review is **approved** (by the
   designer, in Post-it), set its definition's `"status": "approved"` and publish
   that version.
3. When every specimen is approved, run `wave_design_system_page` again, mark
   stage 2 done, and load `wave-figma-feature`.

## Rules for every stage

- **The engineer never runs a command.** You run every `wave-figma` command
  and every Post-it and Figma tool yourself, read the JSON each prints, and only
  ever ask the engineer questions, show results and ask for decisions.
- **Interviews, not forms.** Ask in small groups (at most five questions at a
  time), each with a proposal taken from Figma or DESIGN.md, so "yes" accepts
  it. Never ask what the file already says. Say which stage you are in and
  what comes next.
- **Exactly as drawn, or not at all.** Wave refuses a Figma file it cannot
  convert to exactly the same page: anything the entry gate marks as blocking,
  any page that does not match Figma's own render, any font Wave cannot serve,
  any control that does nothing in the prototype because the look it changes
  to is not drawn (a chosen state, a select's open menu).
  Never work around one: no value read off a screenshot, no layer redrawn in
  HTML, no font swapped for a similar one, no look or menu made up, no change
  to Wave to fit the file.
- **The designer fixes Figma.** When the file is not ready, write the
  **Figma readiness report** (below), publish it in Post-it, give the engineer
  its link to send to the designer, and stop at "waiting for the designer".
  You may offer to edit the Figma file yourself, but only by asking twice:
  first "Wave could make these corrections in the Figma file itself. That
  changes the designer's file. Do you want me to edit it?", and only after a
  yes, "Please confirm the designer has agreed to me changing
  <file name>. Edit it now?". Anything but two clear yeses means no; engineers
  usually may not edit the design, so expect no and do not argue. If you do
  edit, list every change and whether it moved a pixel.
- **The designer approves.** Specimens and screens are approved by the
  designer in Post-it (review, then approve), never by the engineer and never by
  you: do not call `approve_page`. Designer feedback arrives as Post-it
  comments; read them with `list_comments`, act on them, and answer with
  `mark_addressed`.
- **If anything cannot be reached** (Figma, Post-it, a font, an image, the
  command line), stop and say exactly what failed. Never take another route to
  the same result.
- **Keep it safe.** Ask Post-it for an upload link (`wave_upload_link`) for each
  step that sends files, use it only in `wave-figma send --link`, and never
  write it to a file, a page or a message. Never ask the engineer for a token.

## The readiness report

`wave-figma report --gate gate.json -o REPORT.md --fonts --version <n> [--fidelity results.json] [--behaviour behaviour.json] --title "<project> <stage>: Figma readiness"`
writes it, with its version and the date checked at the top: `<n>` is 1 for
the first report, otherwise one more than the version at the top of the report
it replaces (`read_page` it first). Then whether Wave can take the file, then every correction by component
and screen, in plain words, with a Figma link for each, the pages that do
not match Figma (`results.json`: `[{name, node, score, pass, cause}]`, one
for each fidelity run, with the cause in a sentence when you know it), and the
controls that do nothing in the prototype (`behaviour.json`:
`[{name, result}]`, one for each screen's behaviour check).
Publish it as the article **Figma readiness report** in the project (design
system) or the feature (screens), replacing the last one, and give the link
with its version ("Figma readiness report, version 3: <link>").

## The progress page

Keep the article **Wave Figma progress** in the project folder up to date
after every step: each stage and step with done, waiting (on whom, for what)
or to do; the open questions; the links (readiness report, design-system page,
review, prototype). Any session starts by reading it and carries on from
there; tell the engineer where things stand in one line.
