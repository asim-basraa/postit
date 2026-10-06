---
name: Wave Figma Brief
description: Stage 1 of the Figma flow. Writes the project's DESIGN.md in Post-it from a Figma file, asking the engineer only what Figma cannot say. Load it from Wave Figma.
---

# Wave Figma Brief

DESIGN.md holds the defaults every element inherits and the design language
Wave checks against. Most of it is in the Figma file; ask for the rest.

## 1. Read the file

1. `wave-figma script INVENTORY` (pages, frames and their widths, components,
   text), `script VARIABLES` and `script STYLES`: run each with `use_figma`,
   save the result, and check it with `wave-figma checksum` (a result too big
   for one reply comes in parts, `--part n`).
2. From them, draft what Figma says:
   - **Viewports**: the frame widths of the screens.
   - **Design language**: colours, type, spacing, shape and elevation from the
     variables and styles; voice from the copy on the screens.
   - **Components**: the component sets and components on the design-system
     page, with their variants.
   - **Forms**: an Error variant with a message means errors show per field;
     a disabled submit variant means submit waits for valid input.
   - **Language** of the copy.

## 2. Interview the engineer

`wave_get_brief` (kind design) gives the template and any DESIGN.md already
saved. Ask only what is still open, in groups, each with a proposal:

1. **Copy**: final, draft or placeholder; where it will live (code, a CMS,
   translation keys).
2. **Access**: who may open the screens (public, signed in, a role).
3. **Analytics**: tracked or not; the event naming.
4. **Data**: what an empty value shows; what long text does.
5. **Anything the engineer knows that Figma does not**: feature flags,
   platforms, accessibility targets.

## 3. Save

Show DESIGN.md in full and ask: "Save this as the project's DESIGN.md?" On a
yes, `wave_save_brief` (kind design). Fix every problem it lists. Mark stage
1 done in **Wave Figma progress**, then load `wave-figma-design-system`.

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

`wave-figma report --gate gate.json -o REPORT.md --fonts [--previous OLD.md] [--fidelity results.json] [--behaviour behaviour.json] --title "<project> <stage>: Figma readiness"`
writes it. When a report is already published there, `read_page` it, save
it as `OLD.md` and pass `--previous OLD.md`. Leave it out only for the
first report. The new report is then the next version, with its version and the
date checked at the top. Under that, **Since version N** compares the two checks:

- **Fixed**: what the designer corrected, by component and screen, with links.
- **Regressions**: what passed in the last version and fails now, because a change
  in Figma broke it.
- **Checked for the first time**: anything checked for the first time, which is
  not a regression.

Then the report gives whether Wave can take the file, every correction by component
and screen, in plain words, with a Figma link for each, the pages that do
not match Figma (`results.json`: `[{name, node, score, pass, cause}]`, one
for each fidelity run, with the cause in a sentence when you know it), and the
controls that do nothing in the prototype (`behaviour.json`:
`[{name, result}]`, one for each screen's behaviour check). Pass the same
`--fidelity`, `--behaviour` and `--fonts` every time, so the comparison is
like for like. The report keeps a findings record in a hidden comment at its
end. Publish the file exactly as written: never edit the report by hand.
Publish it as the article **Figma readiness report** in the project (design
system) or the feature (screens), replacing the last one. Give the link with its
version and the counts the command prints, for example: "Figma readiness
report, version 3: 12 fixed, 1 regression: <link>". Name each regression to the
engineer in a sentence: the designer fixes those first.

## The progress page

Keep the article **Wave Figma progress** in the project folder up to date
after every step: each stage and step with done, waiting (on whom, for what)
or to do; the open questions; the links (readiness report, design-system page,
review, prototype). Any session starts by reading it and carries on from
there; tell the engineer where things stand in one line.
