import { ATTRIBUTES, decisionTreeMarkdown } from "@wave/spec";

/**
 * The Wave Design skill, for Claude Design: build a project's design system
 * catalogue, run a dry run whose question sheet product can answer, and
 * design, check and upload screens whose data-wave-* attributes are the spec.
 *
 * The vocabulary, the rules and the decision tree are generated from
 * @wave/spec, so the skill always asks exactly what the validator checks. The
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
};

function vocabulary(): string {
  const rows = ATTRIBUTES.map((a) => `| \`${a.attr}\` | ${a.description.replace(/\|/g, "\\|")} | ${a.example ? `\`${a.example.replace(/\|/g, "\\|")}\`` : ""} |`);
  return ["| Attribute | Meaning | Example |", "| --- | --- | --- |", ...rows].join("\n");
}

export function waveDesignSkill(steps: HostSteps): string {
  const H = steps.host;
  return `---
name: Wave Design
description: Build a project's design system catalogue, run a Wave dry run for product, and design, check and upload HTML mockups whose data-wave-* attributes are the complete spec, for review in ${H} and handover to Claude Code. Use before creating, changing or uploading any HTML mockup or component.
---

# Wave Design

Wave is how ${H} reviews HTML mockups and hands them to Claude Code. **The HTML
is the spec**: what every element is, says and does lives on it as
\`data-wave-*\` attributes, checked against the project's design system (DTCG
tokens and a catalogue of components). Wave's tools check every rule below;
this skill tells you how to satisfy them without missing anything.

Older files use \`data-pi-*\` and \`pi:\`. They are read, but upload only
\`data-wave-*\` (\`wave_upgrade_prefix\` converts a file).

## Always start here

1. Ask the designer **which project** and **which feature** this is for.
${steps.projects}
2. Call \`get_catalogue\` for the project. If it has **no approved catalogue**
   (no components, or no valid token file), run **catalogue setup** first.
   Nothing else is uploaded until the designer has approved the catalogue.
3. Decide the mode:
   - The designer said "Wave dry run", or wants questions to share with
     product before anything is uploaded: **dry run**.
   - Otherwise: **full run**.

## Mode 1: catalogue setup (a project's first run)

The design system comes first, approved by the designer.

1. **Tokens.** Collect every colour, size, spacing, radius, border width,
   shadow, font family, font weight, line height, letter spacing, duration,
   easing, opacity and z-index the designs use. Write them as one W3C DTCG
   JSON file: every token has \`$type\` (own or inherited), dimensions are
   \`{"value": 1, "unit": "rem"}\` (never px; 1px is 0.0625rem), aliases
   point at real tokens. Show the designer the list grouped by type and ask:
   "Are these the right names and values? Anything missing or duplicated?"
   Publish it as the JSON page \`design-system/tokens\`.
2. **Components.** List every distinct component in the designs (buttons,
   inputs, cards, badges, navigation, dialogs, toasts, list items…). For each,
   interview the designer, grouped:
   - Name and element type (button, textInput, card…). Are these two similar
     things the same component (with variants) or different components?
   - Variants (primary, secondary, destructive…), and states (default,
     hover, focus, disabled, loading, error…).
   - Anatomy (label, icon, helper text…), and accessibility notes.
3. **Specimens.** For each component make one HTML specimen page: head with
   \`<meta name="wave:spec" content="1">\`, \`<meta name="wave:component" content="Button">\`
   and a \`<script type="application/wave-component+json" id="wave-component">\`
   holding \`{"type","description","variants","states","anatomy","a11y","status"}\`;
   body drawing **every variant and every state**, each example marked
   \`data-wave-component\`, \`data-wave-variant\` and, for states,
   \`data-wave-state\`. Styles use only token variables. \`wave_extract_component\`
   makes a first specimen from an element on a screen.
4. Run \`preflight_html\` on each specimen (target = the project) and fix
   everything it reports.
5. **Designer approval.** Show the catalogue: tokens, and every component with
   its variants and states. Ask the designer to approve it. When they do, set
   \`"status": "approved"\` in each definition and publish the specimens into
   \`design-system/components\`. Confirm with \`get_catalogue\`.

## Mode 2: dry run (questions for product, nothing uploaded)

1. Produce the draft screens' HTML (see "Fidelity" below).
2. \`wave_assign_ids\` on each draft, so every element has its permanent id
   before any question is asked. Keep these ids from now on.
3. \`wave_dry_run\` with the feature id and the drafts. It saves the **question
   sheet** in the feature as "Wave questions": every question per element,
   mandatory first, what Wave already worked out (to confirm), and who should
   answer (designer or product).
4. Answer the designer's questions with them now. Give the designer the link
   to "Wave questions" to share with product, who write their answers in it
   (plain words are fine; you will turn them into the exact format).
5. When they say it is filled in, run \`wave_dry_run\` again (it reads the saved
   sheet). It marks answers that are missing or invalid ("**Fix:** …"). Tidy
   plain-word answers into the format asked, confirm changes with the
   designer, and repeat until it **passes**. A passing run saves
   "Wave answers".
6. Tell the designer the dry run passed and the full run can begin.

## Mode 3: full run (design, check, confirm, upload)

1. **Reuse the catalogue exactly.** Read each component's specimen
   (\`read_page\`) and copy its markup and classes; never restyle a component.
   If the design needs something the catalogue lacks, **ask the designer: "Is
   this a new component (or a new variant of X)?"** Yes: add it to the
   catalogue first (Mode 1 steps 3 to 5, for that component). No: rebuild it
   from an existing component.
2. **Ids.** \`wave_assign_ids\` on each screen (it never changes existing ids).
3. **Answers.** If the feature has "Wave answers", apply it with
   \`wave_apply_answers\` (sheet = its content). Then interview the designer for
   whatever is still open, using the decision tree below: group questions by
   component and type ("these 6 primary buttons…"), show what Wave proposed
   and ask the designer to confirm or change it (never write a guess without
   showing it), and ask every mandatory question until it is answered or the
   designer waives it with a reason (\`waive: <reason>\`). Write answers with
   \`wave_apply_answers\` (answers = {question id: answer}).
4. **Assets.** Every image, SVG file, icon, logo and font that is a local file
   or an inline \`data:\` file is uploaded with \`upload_asset\` (project id, file
   name, base64 bytes) and the HTML is changed to use the returned address.
   Links to other websites (stock photos, Google Fonts) stay as they are.
   No video.
5. **Tokens.** Every value DTCG can express must be \`var(--token)\` from the
   project's token file: colours, every px/rem/em size (use rem tokens),
   font families and weights, shadows, durations, easing, opacity and
   z-index. \`0\`, \`auto\`, percentages, \`fr\`, viewport units and keywords are
   fine. If a value has no token, ask the designer: add a token (catalogue
   change), or use the nearest existing one.
6. **Preflight.** \`preflight_html\` (target = the feature) on every screen.
   Fix everything mandatory. Then **show the designer**: the screen, what you
   changed from their design (ids, attributes, asset addresses, tokens), what
   Wave proposed and they confirmed, anything waived, and the preflight
   result. **Ask: "Does this match what you designed? May I upload it?"**
   Upload only on a clear yes.
${steps.publish}
7. **Compare after upload.** Give the designer the ${H} link to the uploaded
   screen (${steps.reviewLink}) and ask them to compare it with the original
   side by side. If anything looks different, use "Fidelity" below, fix,
   preflight and upload again.
8. Only then ask for review.

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

## The decision tree: what to ask for every element

Wave detects each element's type. For each type, ask every **mandatory**
question (and the recommended ones the designer wants to answer). Questions
marked "designer" are about look, components, states and accessibility;
"product" ones are about data, behaviour, rules, navigation, permissions and
tracking (the designer answers these too, having agreed them with product).

${decisionTreeMarkdown()}
`;
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
8. Where the handover lists an accepted gap or a waived field, follow its note;
   where something is neither specified nor waived, ask rather than guess.
`;
}
