# Concepts

The words Wave uses, and what each one means in practice.

## The work

**Project.** A product. It owns DESIGN.md, the design system (tokens and
components) and its features. In Post-it a project is a folder marked as one;
creating it makes `design-system/` and `design-system/components`.

**Feature (flow).** A set of screens that are designed, reviewed, approved and
handed over together, inside a project. It owns FEATURE.md, its screens and its
mock API (`api/openapi`, `api/data-requirements`).

**Screen.** One HTML page in a feature. Its slug (`wave:screen`) is unique in the
project, so a screen can be used by more than one feature.

**DESIGN.md.** The project's defaults and design language: copy status and
where copy lives, who sees what, analytics, flags, form behaviour, empty values,
overflow, icons, viewports, language. Every element inherits it.

**FEATURE.md.** A feature's brief: its screens (route, title, access), the fields
they write, the data they show and the actions they take. The elements that use
them inherit it.

## The design system

**Token.** A named design value in the DTCG format (`color.text.primary`,
`space.4`), sizes in rem. Pages use tokens as CSS variables; any other value is a
finding.

**Component.** A reusable part of the design system, with variants and states.

**Specimen.** The HTML page that draws one component in every variant and state.
It is the component's definition: screens copy its markup exactly.

**Catalogue.** The project's components, read from its specimens, with their
status (`proposed`, `approved`, `deprecated`), where each is used and the assets
they need.

**Design-system id.** How people and code name a component (`DS.button`) and
each of its variants (`DS.primaryButton`); states share their variant's id.
The project's **design-system page** lists them all, with
`design-system-ids` (the same table as JSON) next to it; both are written from
the specimens by `wave_design_system_page`, never by hand.

**Instance.** An element on a screen marked `data-wave-component`: a use of a
catalogue component. Wave compares it with its specimen and reports drift. An
instance inside another one (a segment in a segmented control) is part of the
outer one's markup and is compared with it there.

## The spec

**Element.** Anything on a screen that has meaning: a heading, a field, a
button, a list. Each has an id.

**Id.** `data-wave-id`, `n_` and at least four letters or digits. Never changed
or reused: comments, answers and usage are anchored to it.

**Address.** `screen.type.slug`: how people and agents refer to an element.

**Element type.** What Wave detects an element to be (button, text input,
list...). Each type has its questions. `data-wave-role` overrides the detection.

**Question.** A decision Wave needs for an element: mandatory or recommended,
for the designer or for product, with Wave's proposal when it has one.

**Inherited.** Answered by the element's own HTML, FEATURE.md, its component,
DESIGN.md or what Wave knows for certain, and therefore never asked.

**Proposed.** Wave's best guess for a question. It counts once the designer
confirms it.

**Waived.** Deliberately not answered, with a reason. Only the designer waives.

**State.** A look an element can be in (hover, disabled, loading, error).
A depicted state is drawn on the page, hidden, with `data-wave-state` and
`data-wave-state-of` pointing at the element it belongs to.

**Destination.** Where an action leads: `screen:`, `node:`, `modal:`, `url:`,
`back` or `stay`.

## The process

**Dry run.** Wave reads the screens and writes the question sheet ("Wave
questions"); nothing is uploaded. When everything mandatory is answered, it
writes "Wave answers".

**Apply.** Writes the answers into the HTML, so the page carries them.

**Preflight.** The last check before a screen is saved: things that would look
or behave differently in Wave, assets not hosted, values that are not tokens,
components that differ from the catalogue, and every mandatory question still
open.

**Review.** Comments anchored to elements; the uploader addresses them with a
new version; a reviewer resolves them and approves.

**Approved and locked.** An approved feature plays and hands over the versions
it approved. Reopening it unlocks it.

**Prototype.** The feature's screens played together on its mock API, with a
device bar and a Scenarios menu for failures.

**Mock API.** The feature's OpenAPI document. `x-wave-provides` names the data a
GET returns; `x-wave-effect` names the action that calls an operation.

**Handover.** What Claude Code builds from: the approved screens, catalogue,
tokens, assets, API and every decision and waiver.

## Figma

The Figma flow is three skills an engineer talks to (Wave Figma Brief, Design
System and Feature): see [[figma-engineer-guide|the engineer's guide]].

**Test id.** `data-testid` on a screen's root, its sections and every
design-system component: `<screen>.<sections>.<DS id>.<label>`
(`budget-timing.form.DS.select.company-size`). Given once at publish, never
renamed; the built app carries the same ones.

**Gherkin.** A feature's scenarios in `tests/flow-feature`, a `.feature` file,
with Wave's steps naming elements by test id. Wave writes the happy path from
the screens and FEATURE.md samples; people may add more.

**Catalogue JSON.** A screen's elements and their test ids as a tree, in the
feature's `catalogue/<screen>`; Wave Test and Wave Build read it.

**Figma match.** How closely a screen converted from Figma matches its frame:
100% minus the structural difference. Stamped into the page before upload;
Post-it uploads it only at 99% or better and logs every result in
`tests/fidelity-report`.

**Sample.** The value a FEATURE.md field gives the end-to-end tests to fill
in. Asked in the interview; never made up.

**Wave Test.** The skill that runs a feature's Gherkin against its prototype
or the built app and publishes the E2E report. A feature is approved only after
a passing run on the versions being approved.

**Entry gate.** The check a Figma file passes before Wave converts it. Blocking
items are fixed in Figma, never in Wave.

**Wave Figma Gate.** The skill that runs the entry gate from a chat with only
the Figma and Post-it connectors, given a project name and the Figma links. The
designer's self-check while fixing a file; the official gate is the engineer's
run in Wave Figma.

**Fidelity.** How closely a converted page matches Figma's own render,
measured pixel by pixel; the pass mark is 0.25% of structural difference.

**Behaviour check.** Each converted screen played by the prototype and every
control clicked, before publishing: a control that changes nothing on screen
(a chip with no chosen look, a select with no open menu) makes the file not
ready. What is missing is drawn in Figma.

**Look lock.** Proof that a change to a page (making a drawn input a real one)
moved no pixel.

**Readiness report.** What the designer gets when Wave cannot take a Figma
file: a verdict, then the corrections to make in Figma by component and
screen, each linked to its node, plus pages that do not match Figma, controls
that do nothing in the prototype, and fonts Wave cannot get.

**Wave Figma progress.** The page in a project that says where the Figma flow
stands (done, waiting on whom, to do), so any session can carry on.

**Upload link.** A short-lived link the `wave-figma` command line sends files
through, so the engineer never handles a token.
