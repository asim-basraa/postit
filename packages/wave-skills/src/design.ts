import { ATTRIBUTES, DESIGN_SECTIONS, decisionTreeMarkdown, designMdTemplate, featureMdTemplate } from "@wave/spec";

/**
 * Wave's skills for Claude Design, one per stage of the work:
 *
 * - Wave Brief: an interview that writes the project's DESIGN.md.
 * - Wave Design System: tokens and component specimens, from DESIGN.md.
 * - Wave Feature: a feature's FEATURE.md from the designer's prompt, then
 *   screens generated with their data-wave-* attributes already in place.
 * - Wave Review: reads the mockup, asks only what is still open (grouped),
 *   checks, uploads and makes the prototype.
 *
 * Wave Design is the router: it starts every conversation and says which of
 * the four comes next. Everything an element inherits from DESIGN.md,
 * FEATURE.md and the catalogue is never asked again, so the questions left
 * are the real decisions.
 *
 * The vocabulary, the rules and the decision tree are generated from
 * @wave/spec, so the skills always ask exactly what the validator checks. The
 * host supplies the tools that create projects and publish pages.
 */
export type HostSteps = {
  /** The product the designer works in: "Post-it", "Lighter". */
  host: string;
  /** Numbered Markdown steps for finding or creating the project and feature. */
  projects: string;
  /** Numbered Markdown steps for publishing a screen (or specimen) page. */
  publish: string;
  /** Numbered Markdown steps for one round of review comments. */
  review: string;
  /** Where the designer sees an uploaded screen, e.g. "/review/<page id>". */
  reviewLink: string;
  /** How to get the wave-figma command line from this host, for the Figma flow. */
  figmaCli?: string;
};

function vocabulary(): string {
  const rows = ATTRIBUTES.map((a) => `| \`${a.attr}\` | ${a.description.replace(/\|/g, "\\|")} | ${a.example ? `\`${a.example.replace(/\|/g, "\\|")}\`` : ""} |`);
  return ["| Attribute | Meaning | Example |", "| --- | --- | --- |", ...rows].join("\n");
}

const fence = (lang: string, body: string) => "```" + lang + "\n" + body.trimEnd() + "\n```";

/** The skills, by the path each is published at. */
export const WAVE_SKILLS = [
  { slug: "wave-design", title: "Wave Design" },
  { slug: "wave-brief", title: "Wave Brief" },
  { slug: "wave-design-system", title: "Wave Design System" },
  { slug: "wave-feature", title: "Wave Feature" },
  { slug: "wave-review", title: "Wave Review" },
  { slug: "wave-figma", title: "Wave Figma" },
  { slug: "wave-figma-brief", title: "Wave Figma Brief" },
  { slug: "wave-figma-design-system", title: "Wave Figma Design System" },
  { slug: "wave-figma-feature", title: "Wave Figma Feature" },
] as const;

const INHERITANCE = `## What is never asked

Every element inherits, in this order, and anything inherited is not a
question:

1. **Its own HTML** (\`data-wave-*\`, native attributes).
2. **FEATURE.md**: the fields it writes (\`data-wave-field\`: rules, options,
   default, shown-when), the data it shows (\`data-wave-bind\`: type, source,
   empty, format), the action it takes (trigger, effects, destinations,
   confirm, tracking) and the screen's route, title and access.
3. **Its component** in the catalogue: states, variants, responsive
   behaviour, events; parts inside a component instance belong to it.
4. **DESIGN.md**: copy status and where copy lives, who can see things,
   analytics, flags, form behaviour, empty values, overflow, icons,
   viewports, language.
5. **What Wave knows for certain**: names (slugs), element types, a submit
   button's trigger, the action name, "none" for a control that only
   navigates.

When answers are applied, what came from FEATURE.md and what Wave is certain
of is written into the HTML; DESIGN.md and the catalogue stay the policy.`;

export function waveDesignSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Design
description: Start here for any Wave work in ${H} (design systems, features, HTML mockups, dry runs, uploads, prototypes and review). Says which Wave skill to use next (Wave Brief, Wave Design System, Wave Feature, Wave Review). Use before creating, changing or uploading any HTML mockup or component.
---

# Wave Design

Wave is how ${H} reviews HTML mockups and hands them to Claude Code. **The HTML
is the spec**: what every element is, says and does lives on it as
\`data-wave-*\` attributes, checked against the project's design system.

The work goes in four stages, each with its own skill. Load the one you need
with \`get_skill\` (space \`wave\`, path \`skills/designer/<name>\`; the Figma flow and
Wave Build are in \`skills/engineering/\`) and follow it exactly.

| Stage | Skill | Makes | When |
| --- | --- | --- | --- |
| 1 | \`wave-brief\` | DESIGN.md at the project root | Once per project, first |
| 2 | \`wave-design-system\` | Tokens and component specimens | Once per project, after the brief; again for a new component |
| 3 | \`wave-feature\` | FEATURE.md, then the screens with their attributes | Each feature |
| 4 | \`wave-review\` | The few questions left, preflight, upload, prototype, review | Each feature, after stage 3 |
| Figma | \`wave-figma\` | The whole flow from a Figma file: its own three stages (brief, design system, feature), run for an engineer | Instead of everything above when the design is in Figma |

## Always start here

1. Ask the designer **which project** and **which feature** this is for.
${steps.projects}
2. \`wave_get_brief\` (kind design, the project). No DESIGN.md yet, or it
   lists problems: **Wave Brief** first.
3. \`get_catalogue\` for the project. No approved catalogue (no components,
   or no valid token file): **Wave Design System** next.
4. For a feature: \`wave_get_brief\` (kind feature). No FEATURE.md yet: **Wave
   Feature** (it writes the brief with the designer, then the screens).
5. The design is in Figma (a Figma link, or "from Figma"): load **Wave Figma**
   and follow it instead of this list. It runs its own three stages with the
   engineer and refuses a file Wave cannot convert exactly.
6. Screens designed, or the designer brings a mockup made elsewhere: **Wave
   Review**. "Wave dry run" also means Wave Review (it saves the question
   sheet and uploads nothing).
7. "Make it a prototype" or "share the prototype": Wave Review, prototype
   section.

Nothing is uploaded before the designer has approved DESIGN.md and the
catalogue. To build an approved flow in code, use **Wave Build**.

${INHERITANCE}
`;
}

export function waveBriefSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Brief
description: Interview the designer and write the project's DESIGN.md (its defaults and design language) in ${H}, so Wave never asks the same thing per element. Use once per project, before the design system and any screen.
---

# Wave Brief: DESIGN.md

DESIGN.md sits at the project root. Its **front matter** is the defaults
every element in the project inherits; its **prose** is the design language
you follow whenever you design for this project. A complete DESIGN.md removes
most of Wave's questions before anything is drawn.

## Steps

1. \`wave_get_brief\` (kind design, id = the project). It returns the saved
   file, or a template, and what is missing.
2. **Read before asking.** Take everything you can from what the designer
   already gave you: their prompt, brand notes, existing screens, the token
   file. Fill those in first; never ask what you already know.
3. **Interview for the rest, grouped**, a few questions at a time, each with
   your proposed answer to confirm or change:
   - Product: what it is, who uses it, the platforms and widths
     (\`viewports\`), the language (\`lang\`).
   - Content: is the copy in the designs final, draft or placeholder
     (\`content.copy\`)? Where will copy live: code, a CMS, translation keys
     (\`content.source\`)?
   - Access: who can open a screen by default: public, signed-in, a role
     (\`access\`)? Can everyone see every element (\`element-access\`)?
   - Analytics: are controls tracked, and with what naming convention
     (\`analytics.controls\`: none or e.g. object_action)? Page views
     (\`analytics.page-views\`)?
   - Feature flags by default (\`flags\`: none, or the flag system).
   - Forms: when errors show (\`forms.validate-on\`: submit, blur, change);
     warn on leaving with unsaved changes (\`forms.dirty-guard\`).
   - Data: what data-driven text shows with no value (\`data.empty\`: hide,
     a dash, text); long text (\`data.overflow\`: wrap, truncate, clamp:2).
   - Icons: the library (lucide, material) or inline SVG (\`icons\`).
   - Responsive: what sections and cards do on small screens by default
     (\`responsive\`: stack, hide, collapse, scroll).
   - Links to other sites (\`links.external\`: _blank or _self); how dialogs
     and toasts close (\`overlays\`).
4. **Write the prose**, one section each, in the designer's words where you
   can: ${DESIGN_SECTIONS.join(", ")}. The visual language is concrete:
   colours with their hex values and roles, type families, sizes and
   weights, spacing scale, corner radii, shadows, motion. Components names
   every component the product needs. Forms carries the UX rules (when to
   use chips instead of a select, when errors appear, what is never
   disabled).
5. **Show the designer the whole file** and ask: "Is this right? Anything to
   change?" Change it until they approve.
6. \`wave_save_brief\` (kind design). Fix anything it still lists and save
   again.
7. Next: **Wave Design System** builds the tokens and components from it.

## The format

${fence("markdown", designMdTemplate("Acme"))}

Front matter values are what an element inherits when its own HTML says
nothing. An element can always override one (\`data-wave-copy="draft"\`,
\`data-wave-track="checkout_started"\`).

${INHERITANCE}
`;
}

export function waveDesignSystemSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Design System
description: Build and upload a project's design system to ${H} (DTCG tokens and one approved HTML specimen per component, with variants, states, events and responsive behaviour) from DESIGN.md. Use after Wave Brief, and whenever a design needs a new component or variant.
---

# Wave Design System

The catalogue is the project's tokens and components, approved by the
designer. Every instance on a screen inherits its component's states,
variants, events and responsive behaviour, so they are never asked per
element.

## Steps

1. \`wave_get_brief\` (kind design). Without a saved DESIGN.md, run **Wave
   Brief** first. Take everything you can from it: the visual language gives
   the tokens, the Components section the list of components, Interaction and
   states the states, Layout the responsive behaviour.
2. **Tokens.** Every colour, size, spacing, radius, border width, shadow,
   font family, font weight, line height, letter spacing, duration, easing,
   opacity and z-index the designs use, as one W3C DTCG JSON file: every
   token has \`$type\` (own or inherited), dimensions are
   \`{"value": 1, "unit": "rem"}\` (never px; 1px is 0.0625rem), aliases point
   at real tokens. Show the designer the list grouped by type and ask: "Are
   these the right names and values? Anything missing or duplicated?"
   Publish it as the JSON page \`design-system/tokens\`.
3. **Components.** For each component in DESIGN.md (and any the designs
   show), propose, then confirm with the designer, grouped:
   - name and element type (button, textInput, card...); whether two
     similar things are one component with variants or two components;
   - variants, and **every state** it has (default, hover, focus, filled,
     valid, warning, error, disabled, loading, selected...);
   - **events**: what using it means, e.g. \`{"select": "change"}\` for a
     chip, \`{"press": "click"}\` for a button;
   - **responsive**: what it does on small screens (stack, full-width,
     hide, scroll);
   - anatomy (label, icon, helper text) and accessibility notes.
4. **Specimens.** One HTML page per component: head with
   \`<meta name="wave:spec" content="1">\`, \`<meta name="wave:component" content="Button">\`
   and a \`<script type="application/wave-component+json" id="wave-component">\`
   holding \`{"type","description","variants","states","events","responsive","anatomy","a11y","status"}\`;
   body drawing **every variant and every state**, each example marked
   \`data-wave-component\`, \`data-wave-variant\` and, for states,
   \`data-wave-state\`. Styles use only token variables.
   \`wave_extract_component\` makes a first specimen from an element on a
   screen.
5. \`preflight_html\` on each specimen (target = the project); fix everything
   it reports.
6. **Designer approval.** Show the tokens and every component with its
   variants and states. When the designer approves, set \`"status": "approved"\`
   in each definition and publish the specimens into
   \`design-system/components\`.
${steps.publish}
7. \`wave_design_system_page\` writes the design-system page (every
   component's design-system id, its variants' ids and its type) and the same
   table as JSON (\`design-system-ids\`) next to it, from the specimens. Never
   write that table by hand; run it again whenever a specimen is published,
   changed or approved.
8. Confirm with \`get_catalogue\`. Next: **Wave Feature** for the first
   feature.

## A new component later

When a screen needs something the catalogue lacks, ask the designer: "Is
this a new component, or a new variant of X?" Yes: steps 3 to 7 for it. No:
rebuild it from the existing component.
`;
}

export function waveFeatureSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Feature
description: Turn the designer's prompt for a feature into FEATURE.md (screens, fields, data, actions) in ${H}, then generate the feature's HTML screens with every data-wave-* attribute already in place, reusing the catalogue exactly. Use for each new feature, after the design system is approved.
---

# Wave Feature

A feature is designed from its brief. FEATURE.md says what the screens are,
what people fill in, what data they see and what every action does; the
screens are then generated from it with their attributes, so almost nothing
is left to ask.

## 1. FEATURE.md, from the prompt

1. \`wave_get_brief\` (kind design) and \`get_catalogue\`: the defaults and the
   components you design with. \`wave_get_brief\` (kind feature, the feature
   folder) for the brief so far (or a template).
2. **Extract from the prompt first.** A good prompt already says most of it:
   - **screens**: one per step or state the prompt describes, each with a
     slug, title and route (\`/start\`, \`/start/project\`), and access if it
     differs from DESIGN.md;
   - **fields**: every input, as a data path (\`lead/email\`) with its type,
     rules (\`required; pattern:email\`), options for choices (chips, cards,
     selects), default, and \`visible-if\` for conditional fields ("Other
     opens a text field" is \`visible-if: lead/role == Other\`);
   - **data**: everything a screen shows that is not fixed copy (a name, a
     recap, a price), with type, source, description, and empty/format when
     it matters;
   - **actions**: every button or link that does something, as an id
     (\`lead/save-about\`) with its screen, trigger, effects
     (\`api/leads/save\`, \`email/confirmation\`), destination on success
     (\`to: screen:your-project\`) and on failure
     (\`failure: node:about-you/error-count\`), and confirm, feedback,
     tracking or disabled-if when they apply. A screen's submit action
     belongs to its submit buttons; name others with \`on: [slug]\`.
3. **Ask only what the prompt leaves open**, grouped, with your proposal:
   where a failure goes, what a dead end links to, which effects an action
   has. Never ask what DESIGN.md already sets.
4. Show the designer FEATURE.md and ask for their approval, then
   \`wave_save_brief\` (kind feature). Fix what it lists.

${fence("markdown", featureMdTemplate("checkout", "Checkout"))}

## 2. The screens, with their attributes

Generate each screen so the HTML is already the spec:

1. **Components exactly as the catalogue draws them**: read each specimen
   (\`read_page\`) and copy its markup and classes; mark each instance
   \`data-wave-component\` and \`data-wave-variant\`. Never restyle one.
2. **Ids**: every meaningful element gets \`data-wave-id\` (\`n_\` + 4 or more
   lowercase letters or digits); \`wave_assign_ids\` adds missing ones.
3. **From FEATURE.md**, on the elements themselves:
   - each input \`data-wave-field="<path>"\` (its rules, options and default
     come from the brief; write them too if you like);
   - each piece of data \`data-wave-content="dynamic"\` and
     \`data-wave-bind="<path>"\`;
   - each action's control \`data-wave-action="action/<id>"\`, and
     \`data-wave-trigger\`, \`data-wave-effect\`, \`data-wave-to\`,
     \`data-wave-to-failure\` as the brief says;
   - the screen's meta: \`wave:screen\`, \`wave:flow\`, \`wave:route\`,
     \`wave:title\`.
4. **Draw every state the brief implies**: an error message for each rule
   (\`data-wave-state-of\` the field, \`data-wave-state="error"\`), a warning
   where the brief has one, the loading state of every action with effects,
   the screen's loading and error states when it shows data, and every
   dialog an action confirms with.
5. **Choices are radios or checkboxes**: chips and cards to pick from are a
   \`role="radiogroup"\` (or group) of \`role="radio"\`/\`"checkbox"\`
   buttons with \`aria-checked\`, the group carrying \`data-wave-field\`.
6. **Tokens only**: every colour, size and font is \`var(--token)\`.
7. **One self-contained file** per screen (see Fidelity), with the viewport tag.

Then **Wave Review** reads the screens and asks the few questions left.

## Fidelity: the upload must look exactly like the design

- **Export, never regenerate.** Start from the exact HTML the designer saw.
  Every change you make is additive (ids, attributes, asset addresses, token
  variables for the same values) and listed for the designer.
- **One self-contained file.** All CSS in \`<style>\` in the page. No local
  scripts or stylesheets; nothing but the HTML file is uploaded.
- **Scripts run, but in a sandbox with no storage.** \`localStorage\`,
  \`sessionStorage\`, \`indexedDB\` and cookies throw there: remove such code
  or wrap it in try/catch. A page built by a script at run time (an empty
  \`<div id="root">\` filled by JavaScript) cannot be specified: export the
  rendered HTML instead.
- **Viewport.** Include \`<meta name="viewport" content="width=device-width, initial-scale=1">\`.

| Looks different in ${H} | Usually because | Fix |
| --- | --- | --- |
| Fonts are wrong | A font file was local or inline | \`upload_asset\` the font, point \`@font-face\` at the hosted address |
| Images missing | Local or relative paths | \`upload_asset\` each, use the hosted addresses |
| Part of the page missing | A script failed (storage, a missing file) | Remove or guard the script; export rendered HTML |
| Everything missing | The page is built by a script | Export the rendered DOM as HTML |
| Colours or sizes shifted | Values changed while tokenising | Use the token with the same value; add a token if none |
| Layout wrong at a width | Viewport tag missing, or designed for another width | Add the viewport tag; check \`wave:viewports\` |
| Interactions dead | Handlers used storage or missing files | As above |

## Screen meta, in the head

\`\`\`html
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="wave:spec" content="1">
<meta name="wave:screen" content="checkout-address">
<meta name="wave:flow" content="checkout">
<meta name="wave:route" content="/checkout/:orderId/address">
<meta name="wave:title" content="Add delivery address">
<meta name="wave:access" content="signed-in">
<meta name="wave:viewports" content="375 768 1440">
<script type="application/wave+json" id="wave-resources">
  { "user/firstName": { "type": "string", "source": "auth profile", "description": "Given name" } }
</script>
\`\`\`

## Attributes

${vocabulary()}

Names (resources, actions, effects, fields) are free text in a path grammar;
reuse the same name for the same thing across screens. \`none\` is a valid
answer where nothing applies; what Wave refuses is no answer at all.

${INHERITANCE}
`;
}

export function waveReviewSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Review
description: Analyse a feature's HTML mockups against DESIGN.md, FEATURE.md and the catalogue, ask only the questions still open (grouped, with proposals), run the Wave dry run for product, check, upload to ${H}, make the clickable prototype and handle review comments.
---

# Wave Review

The screens exist (from Wave Feature, or brought by the designer). Wave now
works out everything it can from the HTML, FEATURE.md, the catalogue and
DESIGN.md, and what is left are the real decisions.

## Steps

1. **Context.** \`wave_get_brief\` (design and feature) and \`get_catalogue\`.
   A mockup made without Wave Feature: write FEATURE.md from it first (Wave
   Feature, part 1: read the screens and the prompt, propose the fields,
   data and actions, confirm), because every answer in the brief answers
   every element that uses it.
2. **Ids.** \`wave_assign_ids\` on each screen, with its screen slug from
   FEATURE.md (it never changes an id). It also gives the test ids
   (\`<screen>.<section>.<DS id>.<label>\`) that the end-to-end tests and the
   built app use; publishing gives any still missing. Two elements it would
   name the same are the designer's to name apart.
3. **Analyse.** \`wave_dry_run\` with the feature and every screen. It saves
   the question sheet ("Wave questions") with only what is open: one entry
   per decision, listing every element it applies to, mandatory first, split
   into questions for product and for the designer, each with Wave's
   proposal. What was inherited is counted, not listed.
4. **Before asking, look for a better home for the answer.** A question
   about a field, data or an action belongs in FEATURE.md; a question that
   will repeat on every screen (copy, analytics, access) belongs in
   DESIGN.md; a question about a component's states belongs in its
   specimen. Update the brief (with the designer's agreement) and run again:
   it answers every element at once.
5. **Ask the designer the rest**, a group at a time, with the proposal:
   "These 3 step buttons are disabled: when can people jump to a step?".
   Write their answers in the sheet (one answer under a grouped question
   covers every element in it) and run \`wave_dry_run\` again. Product's
   questions: give the designer the link to "Wave questions" to share; when
   product has answered in it, run again. It marks answers to fix
   ("**Fix:** ..."); tidy plain words into the format asked. Repeat until it
   **passes** (it saves "Wave answers"). "Wave dry run" stops here: nothing
   is uploaded.
6. **Apply.** \`wave_apply_answers\` with the "Wave answers" sheet on each
   screen: it writes the answers, the brief's values and the names Wave
   assigned into the HTML.
7. **Assets.** Every local or inline image, SVG file, icon, logo and font:
   \`upload_asset\` (project id, file name, base64 bytes), then use the
   returned address. Links to other websites stay.
8. **Preflight.** \`preflight_html\` (target = the feature) on every screen;
   fix everything mandatory. Then **show the designer** each screen, what you
   changed (ids, attributes, asset addresses, tokens), what they confirmed,
   anything waived and the result. **Ask: "Does this match what you
   designed? May I upload it?"** Upload only on a clear yes.
${steps.publish}
9. **Compare after upload.** Give the designer the ${H} link to each
   uploaded screen (${steps.reviewLink}) to compare with the original side by
   side; fix any difference (see Fidelity in Wave Feature), preflight and
   upload again.
10. **Prototype** (below), then give the designer the prototype link.
11. Only then ask for review.

A waiver (\`waive: <reason>\`) is the designer's call, for something that
really does not apply. Optional questions are hidden; ask for "the optional
questions" only if the designer wants them.

## Prototype: the feature as a working product, on a mock API

A feature plays as one prototype: every screen in one frame with a device bar
(mobile, tablet, desktop), links and actions moving between screens, forms
validating, and the data coming from a **mock API** served by MSW in the
page. The mock API is the feature's OpenAPI document; the screens connect to
it through the attributes they already have.

1. **Publish the whole flow at once** when there are several screens:
   \`wave_publish_flow\` (feature id, every screen's name and HTML, and the
   OpenAPI document and mock files if you have them). It preflights and saves
   every screen, then the API, and returns the review and prototype links.
   The designer's confirmation (step 8 above) still comes first.
2. **The API.** If the designer or product gave an OpenAPI file, use it.
   Otherwise \`wave_generate_api\` drafts one from the uploaded screens: one
   GET per data root the screens read, one POST per \`api/...\` effect, with
   the values the design shows as examples. Show the designer the draft and
   the data requirements it lists, and improve it with them:
   - realistic examples: more list items, long and short values, an empty list;
   - every failure product expects (validation 422, not found 404, server 500),
     as extra responses or named examples: each becomes a choice in the
     prototype's **Scenarios** menu;
   - \`x-wave-delay\` on slow calls, so loading states show.
   Save it with \`wave_save_api\` (JSON or YAML; mock files are response
   bodies by operationId). It rewrites the feature's **Data requirements** page
   and lists anything the screens read or call that the API does not serve.
3. **How screens meet the API** (keep these exact):
   - \`x-wave-provides: order\` on a GET: its response is the data root
     \`order\`, so \`data-wave-bind="order/total"\`, \`data-wave-repeat="order/items[]"\`
     and \`data-wave-visible-if="order/paymentFailed"\` read it.
   - \`x-wave-effect: api/orders/place\` on an operation: an action with
     \`data-wave-effect="api/orders/place"\` calls it, shows the loading state
     drawn for the control, then follows \`data-wave-to\` on success or
     \`data-wave-to-failure\` on an error response.
   - Form fields (\`data-wave-field\`) are validated (\`data-wave-validate\`)
     on submit, showing the error states drawn for them, and sent as the body.
   - Route parameters (\`:orderId\`) come from the path parameters' examples.
4. \`get_prototype\` gives the link and what is still missing. Give the
   designer the link: "Click through it on mobile and desktop, and try the
   failure scenarios." Fix what they find.
5. To show it to somebody without a ${H} account (a client, a stakeholder),
   \`share_prototype\` makes a link (label it for who it is for; give an
   expiry). Give the designer the link at once: it is not shown again.

Screens that call \`fetch\` themselves also work: every request to the API's
base address is answered by the same mock server. Use \`fetch\`, never
\`XMLHttpRequest\` or jQuery (preflight warns about both).

An action with \`data-wave-confirm="<dialog slug>"\` opens that dialog first
in the prototype: its cancel control (\`data-wave-to="back"\`, or a button
reading Cancel, No or Keep) closes it; its other button confirms and runs the
action. So draw the dialog on the screen, with both buttons.

## Review rounds

${steps.review}

Each comment says where it points: an address (\`screen.type.slug\`) and
\`data-wave-id\`, quoted words, an area, or an element without an id (give it
one). You cannot resolve comments: a reviewer confirms. If you disagree, say so
to the designer rather than marking it addressed.

## Rules that matter most

1. Every meaningful element has a \`data-wave-id\` (\`n_\` + at least 4
   lowercase letters or digits). **Never change or reuse an id**: comments and
   answers are anchored to ids.
2. Every element's address is \`screen.type.slug\`; its parent's address is the
   same for the element it sits in. Slugs are unique on a screen; screen slugs
   are unique in the project.
3. Always read the latest version before editing: reviewers' confirmed values
   and waivers are saved as new versions of the file.
4. Only the uploader can change a screen in ${H}; everybody else comments.

${INHERITANCE}

## The decision tree: what to ask for every element

Wave detects each element's type. For each type, ask every **mandatory**
question (and the recommended ones the designer wants to answer). Questions
marked "designer" are about look, components, states and accessibility;
"product" ones are about data, behaviour, rules, navigation, permissions and
tracking (the designer answers these too, having agreed them with product).

${decisionTreeMarkdown()}`;
}

/** The Wave Build skill, for Claude Code: building from an approved flow's handover. */
export function waveBuildSkill(host: string): string {
  return `---
name: Wave Build
description: Build an approved flow of Wave mockups from its handover in ${host}. Use when asked to implement screens that were designed and approved with Wave.
---

# Wave Build

An approved Wave flow is a complete, frozen spec: HTML screens whose
\`data-wave-*\` attributes say what every element is, says and does, the
project's DTCG tokens, the catalogue specimens of every component used, the
assets, the answer sheet, and the decisions made in review.

1. Call \`get_handover\` with the flow's id. If it refuses, it lists what is
   blocking approval: stop and report that, do not build from unapproved
   screens.
2. Read HANDOVER.md from the answer end to end: routes, the flow graph, the data
   dictionary, the action catalog with side effects and destinations, component
   states, and the review decisions and accepted gaps.
3. Build components first, from \`components/*.html\` (the catalogue
   specimens): one code component per specimen, with every variant and state
   drawn there. Map tokens by name (\`var(--color-brand-500)\` is
   \`color.brand.500\`), never by value.
4. Fetch each screen with \`get_handover_screen\` as you build it. Every element
   with \`data-wave-component\` is an instance of a catalogue component.
5. Bind every \`data-wave-bind\` to the resource named, render \`data-wave-empty\`
   when it is empty, apply \`data-wave-format\` and \`data-wave-overflow\`. Build
   every state listed in \`data-wave-states\`, using the depicted states
   (\`data-wave-state-of\`) as the design for each.
6. Wire each \`data-wave-action\` with its \`data-wave-effect\`s, navigate to
   \`data-wave-to\` on success and \`data-wave-to-failure\` on failure, honour
   \`data-wave-confirm\`, \`data-wave-disabled-if\`, \`data-wave-visible-if\`,
   \`data-wave-access\` and \`data-wave-flag\`.
7. Copy the files in \`assets/\` into the codebase (the manifest maps each
   hosted address to its file).
8. \`api/openapi.json\` (and \`api/mocks/\`, \`api/data-requirements.md\`) is
   the mock API the prototype ran on: the contract the screens were designed
   against. Build the data layer to it (\`x-wave-provides\` names the data
   root a GET returns; \`x-wave-effect\` names the action that calls an
   operation), and serve its examples with MSW in development and tests until
   the real API exists. Where the real API differs, say so.
9. Where the handover lists an accepted gap or a waived field, follow its note;
   where something is neither specified nor waived, ask rather than guess.
`;
}
