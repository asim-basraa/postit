import type { HostSteps } from "./design";

/**
 * The Figma flow: a design drawn in Figma, brought into Wave exactly as drawn,
 * by an engineer talking to Claude. Four skills: Wave Figma (where every run
 * starts, and the rules all three stages share), then Wave Figma Brief
 * (DESIGN.md), Wave Figma Design System (tokens and specimens) and Wave Figma
 * Feature (screens, FEATURE.md, review, prototype).
 *
 * The engineer never runs a command. Claude runs the wave-figma command line
 * and the host's tools itself, and the engineer answers questions. Wave does
 * not bend to a file: a file Wave cannot convert exactly is refused, with a
 * readiness report the designer acts on in Figma.
 */

const RULES = (H: string) => `## Rules for every stage

- **The engineer never runs a command.** You run every \`wave-figma\` command
  and every ${H} and Figma tool yourself, read the JSON each prints, and only
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
  **Figma readiness report** (below), publish it in ${H}, give the engineer
  its link to send to the designer, and stop at "waiting for the designer".
  You may offer to edit the Figma file yourself, but only by asking twice:
  first "Wave could make these corrections in the Figma file itself. That
  changes the designer's file. Do you want me to edit it?", and only after a
  yes, "Please confirm the designer has agreed to me changing
  <file name>. Edit it now?". Anything but two clear yeses means no; engineers
  usually may not edit the design, so expect no and do not argue. If you do
  edit, list every change and whether it moved a pixel.
- **The designer approves.** Specimens and screens are approved by the
  designer in ${H} (review, then approve), never by the engineer and never by
  you: do not call \`approve_page\`. Designer feedback arrives as ${H}
  comments; read them with \`list_comments\`, act on them, and answer with
  \`mark_addressed\`.
- **If anything cannot be reached** (Figma, ${H}, a font, an image, the
  command line), stop and say exactly what failed. Never take another route to
  the same result.
- **Keep it safe.** Ask ${H} for an upload link (\`wave_upload_link\`) for each
  step that sends files, use it only in \`wave-figma send --link\`, and never
  write it to a file, a page or a message. Never ask the engineer for a token.

## The readiness report

\`wave-figma report --gate gate.json -o REPORT.md --fonts [--fidelity results.json] [--behaviour behaviour.json] --title "<project> <stage>: Figma readiness"\`
writes it: whether Wave can take the file, then every correction by component
and screen, in plain words, with a Figma link for each, the pages that do
not match Figma (\`results.json\`: \`[{name, node, score, pass, cause}]\`, one
for each fidelity run, with the cause in a sentence when you know it), and the
controls that do nothing in the prototype (\`behaviour.json\`:
\`[{name, result}]\`, one for each screen's behaviour check).
Publish it as the article **Figma readiness report** in the project (design
system) or the feature (screens), replacing the last one, and give the link.

## The progress page

Keep the article **Wave Figma progress** in the project folder up to date
after every step: each stage and step with done, waiting (on whom, for what)
or to do; the open questions; the links (readiness report, design-system page,
review, prototype). Any session starts by reading it and carries on from
there; tell the engineer where things stand in one line.
`;

/** The entry: where every Figma run starts. */
export function waveFigmaSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Figma
description: Start here when a design is in Figma. Brings a Figma file into Wave in ${H} through three skill-driven stages (Wave Figma Brief for DESIGN.md, Wave Figma Design System for tokens and specimens, Wave Figma Feature for screens, review and the prototype). Claude runs every command; the engineer answers questions; the designer fixes Figma and approves in ${H}.
---

# Wave Figma

The engineer says something like "Bring this Figma file into Wave:
<link>". You do everything else, stage by stage, asking only questions.

| Stage | Skill | Makes | Waits for |
| --- | --- | --- | --- |
| 1 | \`wave-figma-brief\` | The project and DESIGN.md | The engineer's answers |
| 2 | \`wave-figma-design-system\` | Tokens, one specimen per component, the design-system page | A ready file; the designer's approval |
| 3 | \`wave-figma-feature\` | Screens, FEATURE.md, review, the prototype | A ready file; the designer's review |

## Start

1. **Setup, once per machine, without asking.** Check \`node --version\` (20 or
   later) and \`npx playwright --version\` with Chromium. Download the command
   line: ${steps.figmaCli ?? "`wave-figma.mjs` from the host"}. Run it as
   \`node wave-figma.mjs <command>\`. Only if something is missing, ask the
   engineer before installing it.
2. **Check access, once.** One Figma call on the file (\`use_figma\` needs edit
   access even to read; a view seat cannot run the scripts) and one ${H} call.
   If either fails, stop and say so.
3. Ask which **project** (and, for screens, which **feature**) this is.
${steps.projects}
4. Read **Wave Figma progress** in the project if it exists, and carry on from
   where it stands. Otherwise create it and start at stage 1.
5. Load the stage's skill with \`get_skill\` (space \`wave\`, path
   \`skills/engineering/<name>\`) and follow it exactly. A stage that is done is not run
   again unless Figma changed.

${RULES(H)}`;
}

/** Stage 1: DESIGN.md from the Figma file. */
export function waveFigmaBriefSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Figma Brief
description: Stage 1 of the Figma flow. Writes the project's DESIGN.md in ${H} from a Figma file, asking the engineer only what Figma cannot say. Load it from Wave Figma.
---

# Wave Figma Brief

DESIGN.md holds the defaults every element inherits and the design language
Wave checks against. Most of it is in the Figma file; ask for the rest.

## 1. Read the file

1. \`wave-figma script INVENTORY\` (pages, frames and their widths, components,
   text), \`script VARIABLES\` and \`script STYLES\`: run each with \`use_figma\`,
   save the result, and check it with \`wave-figma checksum\` (a result too big
   for one reply comes in parts, \`--part n\`).
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

\`wave_get_brief\` (kind design) gives the template and any DESIGN.md already
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
yes, \`wave_save_brief\` (kind design). Fix every problem it lists. Mark stage
1 done in **Wave Figma progress**, then load \`wave-figma-design-system\`.

${RULES(H)}`;
}

/** Stage 2: tokens, specimens and the design-system page. */
export function waveFigmaDesignSystemSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Figma Design System
description: Stage 2 of the Figma flow. Checks the Figma design-system page, refuses it with a readiness report for the designer if Wave cannot convert it exactly, otherwise builds the tokens and one specimen per component in ${H}, gets the designer's approval there, and writes the design-system page. Load it from Wave Figma.
---

# Wave Figma Design System

No screen is converted until the catalogue is approved.

## 1. Is the file ready?

1. Ask which page is the design-system page (propose it from the page names).
2. \`wave-figma script GATE --page <design-system page> --ids <design-system page>\`,
   run with \`use_figma\`, save as \`gate.json\`, checksum it.
3. \`wave-figma gate --report gate.json --fonts\`. If anything blocks or a font
   cannot be served: write and publish the **readiness report**, tell the
   engineer in two or three sentences what the designer has to change, give
   the link, offer the Figma edit only as the rules say, and stop. When the
   designer says it is done, start again at step 2.

## 2. Tokens and fonts

1. \`script VARIABLES\` and \`script STYLES\` (as in stage 1), then
   \`wave-figma tokens --variables vars.txt --styles styles.json -o tokens.json\`:
   it must report no problems. Save it as the JSON page \`design-system/tokens\`.
2. \`wave-figma fonts --families "<families from the gate>" --out fonts/\`, then
   \`upload_asset\` for each file, then \`wave-figma font-css --manifest fonts/fonts.json --urls urls.json -o fonts.css\`.

## 3. One specimen per component

For each component set and component on the page, without asking:

1. \`script COMPONENT --node <set>\` (save as \`component.json\`),
   \`script BINDINGS --ids <set>\`, \`script EFFECTS --node <set>\`,
   \`script EXPORT_SVG --ids <its vectors>\`, Figma's \`get_design_context\` and
   \`get_screenshot\`.
2. \`wave-figma convert --gate gate.json --component component.json --type <element type>
   --code code.tsx --width <w> --height <h> --tokens tokens.json --bindings bindings.txt
   --effects effects.json --svgs svgs.json --fonts fonts.css -o specimen.html\`.
   The element type is Wave's (button, textInput, checkbox, radio, select,
   navigation, icon, text...). Ask the engineer only when two fit ("Is Option
   card a checkbox or a radio?").
3. \`wave-figma align\`, then \`wave-figma fidelity --component component.json\`
   against the screenshot. Record every result for the report.
4. Where Figma drew a picture of a control, an upgrade plan makes the real
   element (\`wave-figma upgrade --plan\`); the look lock must be clean.
5. \`wave-figma ids\` (with \`--from <published specimen>\` when there is one),
   then \`wave-figma preflight\`, then ${H}'s \`preflight_html\` (target = the
   project).

If any specimen does not match Figma, the file is **not ready**: publish the
readiness report with the fidelity results and stop, as in 1.3.

## 4. Publish for the designer

1. \`wave_upload_link\`, then \`wave-figma send --link <link> --tool create_page\`
   (or \`update_page\` for a new version) with \`--file content=specimen.html\`,
   one call per specimen, into \`design-system/components\`.
2. \`wave_design_system_page\`: it writes the design-system page and its JSON
   from the specimens. Never write that table by hand.
3. \`ask_for_review\` on each specimen. Tell the engineer: "The design system is
   ready for the designer to review in ${H}: <link to the design-system page>.
   They compare each specimen with Figma, comment on anything wrong, and
   approve." Record "waiting for the designer" in **Wave Figma progress**.

## 5. The designer's answer

When the engineer comes back:

1. \`list_comments\` on the specimens. A comment about the conversion (a page
   that differs from Figma): fix it in Wave's output only if the fix keeps the
   page exactly as Figma draws it, publish the new version and
   \`mark_addressed\`. A comment that needs a change in Figma: it goes in the
   readiness report for the designer, as in 1.3.
2. \`read_page\` each specimen: when its review is **approved** (by the
   designer, in ${H}), set its definition's \`"status": "approved"\` and publish
   that version.
3. When every specimen is approved, run \`wave_design_system_page\` again, mark
   stage 2 done, and load \`wave-figma-feature\`.

${RULES(H)}`;
}

/** Stage 3: screens, FEATURE.md, review and the prototype. */
export function waveFigmaFeatureSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Figma Feature
description: Stage 3 of the Figma flow. Checks a feature's Figma screens, refuses them with a readiness report if Wave cannot convert them exactly, otherwise converts them against the approved catalogue, interviews the engineer for FEATURE.md, runs the dry run, publishes the feature to ${H} for the designer's review and makes the prototype. Load it from Wave Figma.
---

# Wave Figma Feature

Needs an approved catalogue (stage 2). Ask which feature and which frames;
propose the frames from the screens page and their prototype links, in order.

## 1. Are the screens ready?

\`wave-figma script GATE --page <design-system page> --ids <design-system page>,<screens page>\`,
save, checksum, \`wave-figma gate --report gate.json --fonts\`. Anything
blocking: readiness report for the feature, the link, the Figma edit only as
the rules say, stop.

## 2. Convert each screen, without asking

1. \`script NODE_MAP --node <frame>\` (save as \`map.json\`), \`script BINDINGS --ids <frame>\`,
   \`EFFECTS --node <frame>\`, \`EXPORT_SVG --ids <its vectors>\`, \`get_design_context\`,
   \`get_screenshot\`.
2. \`wave-figma convert --gate gate.json --components <dir of component.json>
   --specimen-pages <published specimens> --map map.json
   --code code.tsx --width <w> --height <h> --tokens tokens.json --bindings bindings.txt
   --effects effects.json --svgs svgs.json --fonts fonts.css --source figma:<file>/<frame>
   --title "<the frame's name>" -o screen.html\`.
   A screen is called what its frame is called, and its slug is that name's
   (About you, \`about-you\`): never propose or change a screen's name; the
   gate refuses a frame that is not named as a screen.
3. \`align\`, \`fidelity\` (record every result), \`upgrade --plan\` (look lock
   clean), \`ids --screen <slug>\` (\`--from\` the published screen when there
   is one, which keeps every test id), then the **Figma match**: \`wave-figma
   fidelity --page screen.html --reference <frame>.png --stamp screen.html\` on
   the finished page, then \`preflight\`. \`ids\` gives the test ids
   (\`<screen>.<section>.<DS id>.<label>\`); a duplicate it reports is the
   design's to name apart, in Figma. The stamp is the upload gate: ${H}
   uploads a screen converted from Figma only with a stamp of that exact page
   matching its frame at **99%** or better (100 minus the structural
   difference; the last 1% is for the browser and Figma drawing fonts
   slightly differently). Measure the page you will send, after every change:
   a page changed after measuring is refused. Never stamp a number you did not
   measure.
4. \`wave-figma behaviour --page screen.html --specimens <published specimens> -o behaviour.json\`:
   it plays the screen with the prototype and clicks every control. A choice
   has to show being chosen, a select has to open the menu its Open variant
   draws, a button has to go where it goes. Record every result for the report.
5. The plan says what Figma cannot draw, in the design's own words: a heading
   is \`h1\`, a form is \`form\`, a group of chips is a \`radiogroup\` with its
   field, a decorative icon is \`aria-hidden\`; \`data-wave-role\` where Wave
   would guess wrong. Ask the engineer only where the design does not decide.

A screen that does not match Figma, or a control that does nothing in the
behaviour check, makes the feature **not ready**: readiness report with the
fidelity and behaviour results, stop. Never change the page to make a control
pass; what is missing is drawn in Figma. A control that does nothing because
of FEATURE.md (an action with nowhere to go) is the engineer's to answer in the
interview below; run the check again after.

## 3. Interview the engineer for FEATURE.md

\`wave_get_brief\` (kind feature) gives the template. Figma already says the
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
4. **Anything else open** after \`wave_dry_run\` on the converted screens.

A question that does not apply is **waived** with a reason the engineer
agrees to (data the screen never fetches, a group the catalogue has no
component for). Show FEATURE.md in full and \`wave_save_brief\` (kind feature)
on a yes. Run \`wave_dry_run\` again until it passes, applying answers with
\`wave_apply_answers\`.

## 4. Publish for the designer

1. Preflight every screen with ${H}'s \`preflight_html\` (target = the feature),
   and run the behaviour check again on the files you will send: both pass.
2. Show the engineer the screens and the report (each screen's Figma match,
   structural and raw, every waiver) and ask: "Publish these for the designer's review?"
3. On a yes: \`wave-figma bundle --screen "<frame name>=<file>,..." -o screens.json\`,
   \`wave_upload_link\`, then \`wave-figma send --link <link> --tool wave_publish_flow
   --args '{"feature_id":"<id>"}' --json-file screens=screens.json\`.
   The answer lists each screen's match; a screen under 99% is not uploaded,
   and every Figma screen's result is logged in the feature's
   \`tests/fidelity-report\`. Report each screen's match to the engineer.
4. Make the prototype (the prototype section of Wave Review, \`skills/designer/wave-review\`): without an
   API, actions simulate loading and the viewer picks success or failure.
5. **The end-to-end tests.** Publishing wrote the feature's Gherkin
   (\`tests/flow-feature\`, a .feature file, the happy path by test id), each
   screen's tree as JSON in \`catalogue/\`, and \`tests/testing\`, which says
   where every test file is. If it says it is not
   complete, the gaps are FEATURE.md samples: ask the engineer, save, and it
   is written again. Then run them with the Wave Test skill
   (\`skills/engineering/wave-test\`) against the prototype. A failure that
   needs Figma goes in the readiness report; the feature is not ready.
6. \`ask_for_review\` on each screen and on \`tests/flow-feature\` (the designer
   reads the scenario next to the prototype). Give the engineer the review
   links, the prototype link and the E2E report for the designer. Record
   "waiting for the designer". The feature can be approved only with the
   Gherkin approved and a passing run on the versions being approved.

## 5. The designer's answer

As in stage 2: comments about the conversion are fixed in Wave's output only
if the page stays exactly as Figma draws it; anything that needs Figma goes in
the readiness report. When every screen is approved in ${H}, the feature can
be approved and handed over: engineers build it with **Wave Build**. Mark the
feature done in **Wave Figma progress**.

## When Figma changes

Start the stage again from its check: gate, convert with \`ids --from\` the
published version (check anything reported as vanished), publish the new
versions, and run \`wave_design_system_page\` again after specimens change.

${RULES(H)}`;
}
