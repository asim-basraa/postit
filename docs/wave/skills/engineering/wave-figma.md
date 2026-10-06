---
name: Wave Figma
description: Start here when a design is in Figma. Brings a Figma file into Wave in Post-it through three skill-driven stages (Wave Figma Brief for DESIGN.md, Wave Figma Design System for tokens and specimens, Wave Figma Feature for screens, review and the prototype). Claude runs every command; the engineer answers questions; the designer fixes Figma and approves in Post-it.
---

# Wave Figma

The engineer says something like "Bring this Figma file into Wave:
<link>". You do everything else, stage by stage, asking only questions.

| Stage | Skill | Makes | Waits for |
| --- | --- | --- | --- |
| 1 | `wave-figma-brief` | The project and DESIGN.md | The engineer's answers |
| 2 | `wave-figma-design-system` | Tokens, one specimen per component, the design-system page | A ready file; the designer's approval |
| 3 | `wave-figma-feature` | Screens, FEATURE.md, review, the prototype | A ready file; the designer's review |

## Start

1. **Setup, once per machine, without asking.** Check `node --version` (20 or
   later) and `npx playwright --version` with Chromium. Download the command
   line: `curl -sSfo wave-figma.mjs <post-it>/wave/wave-figma.mjs`, where `<post-it>` is the Post-it connector's address without `/api/mcp`. Run it as
   `node wave-figma.mjs <command>`. Only if something is missing, ask the
   engineer before installing it.
2. **Check access, once.** One Figma call on the file (`use_figma` needs edit
   access even to read; a view seat cannot run the scripts) and one Post-it call.
   If either fails, stop and say so.
3. Ask which **project** (and, for screens, which **feature**) this is.
   - Find it with `list_spaces` and `list_tree` (projects and features are marked).
   - No project yet: `create_folder` with `project: true` (it creates design-system/ and
     design-system/components). No feature yet: `create_folder` inside the project with
     `flow: true`.
4. Read **Wave Figma progress** in the project if it exists, and carry on from
   where it stands. Otherwise create it and start at stage 1.
5. Load the stage's skill with `get_skill` (space `wave`, path
   `skills/engineering/<name>`) and follow it exactly. A stage that is done is not run
   again unless Figma changed.

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
