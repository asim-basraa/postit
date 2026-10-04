---
name: Wave Figma Feature
description: Stage 3 of the Figma flow. Checks a feature's Figma screens, refuses them with a readiness report if Wave cannot convert them exactly, otherwise converts them against the approved catalogue, interviews the engineer for FEATURE.md, runs the dry run, publishes the feature to Post-it for the designer's review and makes the prototype. Load it from Wave Figma.
---

# Wave Figma Feature

Needs an approved catalogue (stage 2). Ask which feature and which frames;
propose the frames from the screens page and their prototype links, in order.

## 1. Are the screens ready?

`wave-figma script GATE --page <design-system page> --ids <design-system page>,<screens page>`,
save, checksum, `wave-figma gate --report gate.json --fonts`. Anything
blocking: readiness report for the feature, the link, the Figma edit only as
the rules say, stop.

## 2. Convert each screen, without asking

1. `script NODE_MAP --node <frame>` (save as `map.json`), `script BINDINGS --ids <frame>`,
   `EFFECTS --node <frame>`, `EXPORT_SVG --ids <its vectors>`, `get_design_context`,
   `get_screenshot`.
2. `wave-figma convert --gate gate.json --components <dir of component.json>
   --specimen-pages <published specimens> --map map.json
   --code code.tsx --width <w> --height <h> --tokens tokens.json --bindings bindings.txt
   --effects effects.json --svgs svgs.json --fonts fonts.css --source figma:<file>/<frame>
   --title "<the frame's name>" -o screen.html`.
   A screen is called what its frame is called, and its slug is that name's
   (About you, `about-you`): never propose or change a screen's name; the
   gate refuses a frame that is not named as a screen.
3. `align`, `fidelity` (record every result), `upgrade --plan` (look lock
   clean), `ids --screen <slug>` (`--from` the published screen when there
   is one, which keeps every test id), `preflight`. `ids` gives the test ids
   (`<screen>.<section>.<DS id>.<label>`); a duplicate it reports is the
   design's to name apart, in Figma.
4. `wave-figma behaviour --page screen.html --specimens <published specimens> -o behaviour.json`:
   it plays the screen with the prototype and clicks every control. A choice
   has to show being chosen, a select has to open the menu its Open variant
   draws, a button has to go where it goes. Record every result for the report.
5. The plan says what Figma cannot draw, in the design's own words: a heading
   is `h1`, a form is `form`, a group of chips is a `radiogroup` with its
   field, a decorative icon is `aria-hidden`; `data-wave-role` where Wave
   would guess wrong. Ask the engineer only where the design does not decide.

A screen that does not match Figma, or a control that does nothing in the
behaviour check, makes the feature **not ready**: readiness report with the
fidelity and behaviour results, stop. Never change the page to make a control
pass; what is missing is drawn in Figma. A control that does nothing because
of FEATURE.md (an action with nowhere to go) is the engineer's to answer in the
interview below; run the check again after.

## 3. Interview the engineer for FEATURE.md

`wave_get_brief` (kind feature) gives the template. Figma already says the
screens, the components, where each button goes (prototype links) and each
field's error message (the Error variant's text). Draft FEATURE.md from that,
then ask screen by screen, in groups, each with a proposal:

1. **Fields**: what each one writes, required or not, rules, options, default,
   and a **sample**: the value the end-to-end tests fill in (one of the drawn
   choices for a chip, card or select). Propose one from what Figma shows
   (the placeholder, the first choice); never save one the engineer has not
   agreed.
2. **Data**: what each screen shows, where it comes from, what empty shows.
3. **Actions**: what each button does, where it goes when it works and when it
   fails, whether it asks to confirm.
4. **Anything else open** after `wave_dry_run` on the converted screens.

A question that does not apply is **waived** with a reason the engineer
agrees to (data the screen never fetches, a group the catalogue has no
component for). Show FEATURE.md in full and `wave_save_brief` (kind feature)
on a yes. Run `wave_dry_run` again until it passes, applying answers with
`wave_apply_answers`.

## 4. Publish for the designer

1. Preflight every screen with Post-it's `preflight_html` (target = the feature),
   and run the behaviour check again on the files you will send: both pass.
2. Show the engineer the screens and the report (fidelity per screen, every
   waiver) and ask: "Publish these for the designer's review?"
3. On a yes: `wave-figma bundle --screen "<frame name>=<file>,..." -o screens.json`,
   `wave_upload_link`, then `wave-figma send --link <link> --tool wave_publish_flow
   --args '{"feature_id":"<id>"}' --json-file screens=screens.json`.
4. Make the prototype (the prototype section of Wave Review, `skills/designer/wave-review`): without an
   API, actions simulate loading and the viewer picks success or failure.
5. `ask_for_review` on each screen. Give the engineer the review links and
   the prototype link for the designer. Record "waiting for the designer".

## 5. The designer's answer

As in stage 2: comments about the conversion are fixed in Wave's output only
if the page stays exactly as Figma draws it; anything that needs Figma goes in
the readiness report. When every screen is approved in Post-it, the feature can
be approved and handed over: engineers build it with **Wave Build**. Mark the
feature done in **Wave Figma progress**.

## When Figma changes

Start the stage again from its check: gate, convert with `ids --from` the
published version (check anything reported as vanished), publish the new
versions, and run `wave_design_system_page` again after specimens change.

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

`wave-figma report --gate gate.json -o REPORT.md --fonts [--fidelity results.json] [--behaviour behaviour.json] --title "<project> <stage>: Figma readiness"`
writes it: whether Wave can take the file, then every correction by component
and screen, in plain words, with a Figma link for each, the pages that do
not match Figma (`results.json`: `[{name, node, score, pass, cause}]`, one
for each fidelity run, with the cause in a sentence when you know it), and the
controls that do nothing in the prototype (`behaviour.json`:
`[{name, result}]`, one for each screen's behaviour check).
Publish it as the article **Figma readiness report** in the project (design
system) or the feature (screens), replacing the last one, and give the link.

## The progress page

Keep the article **Wave Figma progress** in the project folder up to date
after every step: each stage and step with done, waiting (on whom, for what)
or to do; the open questions; the links (readiness report, design-system page,
review, prototype). Any session starts by reading it and carries on from
there; tell the engineer where things stand in one line.
