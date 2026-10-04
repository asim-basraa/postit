# Figma to Wave: the engineer's guide

How an engineer brings a design drawn in Figma into Wave by talking to
Claude. You never run a command: Claude runs everything, interviews you, and
stops only for your answers and for the designer. The one-page version is the
[[figma-quick-guide|Figma to Wave quick guide]].

## How it works

Three stages, each a skill Claude loads from Post-it:

| Stage | Skill | What you get | Who it waits for |
| --- | --- | --- | --- |
| 1. Brief | Wave Figma Brief | The project in Post-it and its DESIGN.md | You (a short interview) |
| 2. Design system | Wave Figma Design System | Tokens, one specimen per component, the design-system page and its JSON | A ready Figma file; the designer's approval |
| 3. Feature | Wave Figma Feature | The screens, FEATURE.md, the prototype, ready for review and handover | A ready Figma file; your answers; the designer's review |

**Wave takes a Figma file exactly as it is drawn, or not at all.** If the
file has something Wave cannot turn into exactly the same page, Wave refuses
it and writes a **Figma readiness report** for the designer: what to change in
Figma, component by component and screen by screen, with a link to every
node. Nothing is guessed, redrawn by hand, or bent to fit.

## Before you start

You need, once:

| | |
| --- | --- |
| Claude Code | Where you talk to Claude |
| The **Figma** connector, signed in with **edit access** to the file | Figma only lets its plugin scripts run with edit access, even to read. You will not be asked to edit anything. |
| The **Post-it** connector | In Post-it: Your account, Connect to Claude (`/settings/mcp`). Make a token pinned to the project's space and add it with the Claude Code snippet shown there. |
| Node 20 or later and Playwright with Chromium on your machine | Claude checks these itself and asks before installing anything |

You never handle a token again after connecting: when Claude needs to send
files to Post-it, it asks Post-it for a short-lived upload link (one space, at
most an hour, revocable in `/settings/mcp`).

## Start

In Claude Code:

> Bring this Figma file into Wave: `<link to the Figma file>`

Claude checks your setup and access (one call to Figma, one to Post-it), asks
which **project** this is (it creates it if needed), and starts at the first
stage not yet done. It keeps a **Wave Figma progress** page in the project, so
you can stop at any point and pick up later, in any session, with the same
sentence.

## Stage 1: the brief

Claude reads the file (pages, frame widths, variables, styles, components,
copy) and drafts DESIGN.md from it. Then it asks you only what Figma cannot
say, a few questions at a time, each with a proposal you can accept with
"yes":

- **Copy**: is it final, draft or placeholder, and where will it live (code,
  a CMS, translation keys)?
- **Access**: who may open these screens?
- **Analytics**: is anything tracked, and how are events named?
- **Data**: what does an empty value show, what does long text do?
- **Anything else** you know that Figma does not: flags, platforms,
  accessibility targets.

You see DESIGN.md in full and say whether to save it.

## Stage 2: the design system

Claude asks which page in Figma is the design system (it proposes one), then
checks it.

**If the file is not ready**, Claude publishes the **Figma readiness report**
in the project and gives you its link to send to the designer. It may offer
to make the corrections in Figma itself; it asks twice, and you will usually
say no, because the designer owns the file. The stage then waits for the
designer.

**When the file is ready**, Claude builds the tokens and fonts and converts
every component, checking each against Figma's own render. You may get a
question where a component could be two things ("Is Option card a checkbox
or a radio?"). Claude publishes the specimens, writes the **design-system
page** (every component's design-system id, such as `DS.button`, and its
variants' ids, such as `DS.primaryButton`) and its **JSON** next to it, and
asks the designer to review.

**The designer reviews in Post-it**: compares each specimen with Figma,
comments on anything wrong, and approves. When you come back ("carry on with
`<project>`"), Claude reads the comments, fixes what is Wave's to fix,
reports what needs Figma, and marks the approved components approved. Only
the designer approves; Claude never does, and neither do you.

## Stage 3: a feature

Claude asks which feature, and proposes its frames in order from the
screens page and their prototype links. It checks the screens exactly as in
stage 2 (readiness report if they are not ready), then converts each one
against the approved components, checking each against Figma. It then plays
each screen as the prototype will and clicks every control (the **behaviour
check**): a chip or segment has to show being chosen, a select has to open the
menu drawn in its Open state, a button has to go somewhere. A control that
does nothing goes in the readiness report for the designer; Claude never
patches the page to make it pass.

Then the **FEATURE.md interview**, screen by screen, each question with a
proposal taken from Figma:

- **Fields**: what each one saves, whether it is required, its rules, options
  and default. (Error messages already come from Figma.)
- **Samples**: for each field the happy path fills, the value the end-to-end
  tests type or pick (one of the drawn choices for a chip, card or select).
- **Data**: what each screen shows, where it comes from, what empty shows.
- **Actions**: what each button does, where it goes when it works and when it
  fails (Figma's prototype links already say the first), whether it asks to
  confirm.
- **Anything still open** after Wave's dry run.

A question that does not apply is **waived** with a reason you agree to (for
example, a loading state for data the screen never fetches).

You see FEATURE.md, then the screens and a short report (how close each is to
Figma, every waiver), and say whether to publish. Claude publishes the
feature (every screen gets its **test ids**, `<screen>.<section>.<DS id>.<label>`,
and Wave writes the feature's **Gherkin**, its happy path), makes the
**prototype** (without an API, actions show loading and the viewer picks
success or failure), runs the end-to-end tests with **Wave Test** and gives
you the review, prototype and E2E report links for the designer. The designer
approves the Gherkin with the screens; the feature can be approved only after
a passing run on the versions being approved.

**The designer reviews in Post-it**, as in stage 2. When every screen is
approved, the feature is approved and locked, and engineers build it with
**Wave Build**: "Build `<project>` `<feature>` from Wave".

## The Figma readiness report

What the designer gets when Wave cannot take the file:

- A verdict: **Ready** or **Not ready for Wave**, with the counts.
- **What to change, in short**: each kind of correction once, with how to do
  it in Figma (bind a colour to a variable, apply a text style, use auto
  layout, make a boolean a variant...).
- **Corrections by component and screen**: under each component or screen
  (linked to its node in Figma), each correction with links to the layers.
- **Pages that do not match Figma**, with how far off they are and why.
- **Controls that do nothing in the prototype**, from the behaviour check,
  each linked to its layer, with what is missing (a chosen state, an open
  menu, a prototype link).
- **Fonts** Wave cannot get, and **suggestions** that do not block.

It replaces the previous report each time Wave checks again. Every rule is
in [[reference/figma-entry-gate|Figma entry gate rules]].

## When Figma changes

Say "Figma changed for `<project>`" (or for a feature). Claude checks again,
converts what changed keeping every id (so comments and answers stay on their
elements), republishes, and updates the design-system page.

## What Claude will never do

- Run a step you have to type, or ask you for a token.
- Approve anything, or edit the designer's Figma file without two clear yeses.
- Work around something it cannot reach: it stops and tells you what failed.
- Redraw, guess or adjust a design to make it pass.

## When something stops

| Claude says | What to do |
| --- | --- |
| It cannot reach Figma, or `use_figma` was refused | Ask for edit access to the file, or check the Figma connector |
| It cannot reach Post-it | Check the Post-it connector and its token |
| The file is not ready | Send the readiness report to the designer; say "carry on" when they have fixed it |
| Waiting for the designer | Ask the designer to review in Post-it; say "carry on" when they have |
| A font cannot be served | The designer sends the font files and confirms they may be used on the web, or uses a free font |
