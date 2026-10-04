-- Publishes Wave's skills into the Wave space, where Claude Design and
-- Claude Code find them with list_skills and get_skill:
--   skills/designer/     the Claude Design flow (Wave Design and its stages)
--   skills/engineering/  the Figma flow and Wave Build
--   skills/gates/        checks anyone can run (the Figma entry gate)
--
-- The Wave space is restricted: only its members can read it, so nothing here
-- is granted to everybody. The text is content/skills.ts (whose vocabulary comes
-- from packages/wave-skills). Wave's skills that earlier migrations put in the
-- Post-it space's shared Skills folder are removed from there.
--
-- Needs the Wave space (slug wave) to exist; without it, nothing changes.
-- Safe to run again: an existing page is brought up to date.

create or replace function pg_temp.put_skill(p_folder uuid, p_space uuid, p_title text, p_slug text, p_body text)
returns void
language plpgsql
as $fn$
declare
  v_node uuid;
begin
  select id into v_node from public.nodes where parent_id = p_folder and slug = p_slug limit 1;
  if v_node is null then
    insert into public.nodes (space_id, parent_id, kind, name, slug, content, content_type)
    values (p_space, p_folder, 'file', p_title, p_slug, p_body, 'skill');
  else
    update public.nodes
       set name = p_title, content = p_body, content_type = 'skill',
           content_version = content_version + 1, updated_at = now()
     where id = v_node and (name, content) is distinct from (p_title, p_body);
  end if;
end;
$fn$;

create or replace function pg_temp.folder(p_space uuid, p_parent uuid, p_name text, p_slug text)
returns uuid
language plpgsql
as $fn$
declare
  v_id uuid;
begin
  select id into v_id from public.nodes
   where space_id = p_space and kind = 'folder' and slug = p_slug
     and parent_id is not distinct from p_parent
   limit 1;
  if v_id is null then
    insert into public.nodes (space_id, parent_id, kind, name, slug)
    values (p_space, p_parent, 'folder', p_name, p_slug)
    returning id into v_id;
  end if;
  return v_id;
end;
$fn$;

do $$
declare
  v_space uuid;
  v_skills uuid;
  v_designer uuid;
  v_engineering uuid;
  v_gates uuid;
  v_postit uuid;
begin
  select id into v_space from public.spaces where slug = 'wave';
  if v_space is null then
    raise notice 'no Wave space here; skipping';
    return;
  end if;

  v_skills := pg_temp.folder(v_space, null, 'Skills', 'skills');
  v_designer := pg_temp.folder(v_space, v_skills, 'Designer', 'designer');
  v_engineering := pg_temp.folder(v_space, v_skills, 'Engineering', 'engineering');
  v_gates := pg_temp.folder(v_space, v_skills, 'Gates', 'gates');

  perform pg_temp.put_skill(v_designer, v_space, 'Wave Design', 'wave-design', '---
name: Wave Design
description: Start here for any Wave work in Post-it (design systems, features, HTML mockups, dry runs, uploads, prototypes and review). Says which Wave skill to use next (Wave Brief, Wave Design System, Wave Feature, Wave Review). Use before creating, changing or uploading any HTML mockup or component.
---

# Wave Design

Wave is how Post-it reviews HTML mockups and hands them to Claude Code. **The HTML
is the spec**: what every element is, says and does lives on it as
`data-wave-*` attributes, checked against the project''s design system.

The work goes in four stages, each with its own skill. Load the one you need
with `get_skill` (space `wave`, path `skills/designer/<name>`; the Figma flow and
Wave Build are in `skills/engineering/`) and follow it exactly.

| Stage | Skill | Makes | When |
| --- | --- | --- | --- |
| 1 | `wave-brief` | DESIGN.md at the project root | Once per project, first |
| 2 | `wave-design-system` | Tokens and component specimens | Once per project, after the brief; again for a new component |
| 3 | `wave-feature` | FEATURE.md, then the screens with their attributes | Each feature |
| 4 | `wave-review` | The few questions left, preflight, upload, prototype, review | Each feature, after stage 3 |
| Figma | `wave-figma` | The whole flow from a Figma file: its own three stages (brief, design system, feature), run for an engineer | Instead of everything above when the design is in Figma |

## Always start here

1. Ask the designer **which project** and **which feature** this is for.
   - Find it with `list_spaces` and `list_tree` (projects and features are marked).
   - No project yet: `create_folder` with `project: true` (it creates design-system/ and
     design-system/components). No feature yet: `create_folder` inside the project with
     `flow: true`.
2. `wave_get_brief` (kind design, the project). No DESIGN.md yet, or it
   lists problems: **Wave Brief** first.
3. `get_catalogue` for the project. No approved catalogue (no components,
   or no valid token file): **Wave Design System** next.
4. For a feature: `wave_get_brief` (kind feature). No FEATURE.md yet: **Wave
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

## What is never asked

Every element inherits, in this order, and anything inherited is not a
question:

1. **Its own HTML** (`data-wave-*`, native attributes).
2. **FEATURE.md**: the fields it writes (`data-wave-field`: rules, options,
   default, shown-when), the data it shows (`data-wave-bind`: type, source,
   empty, format), the action it takes (trigger, effects, destinations,
   confirm, tracking) and the screen''s route, title and access.
3. **Its component** in the catalogue: states, variants, responsive
   behaviour, events; parts inside a component instance belong to it.
4. **DESIGN.md**: copy status and where copy lives, who can see things,
   analytics, flags, form behaviour, empty values, overflow, icons,
   viewports, language.
5. **What Wave knows for certain**: names (slugs), element types, a submit
   button''s trigger, the action name, "none" for a control that only
   navigates.

When answers are applied, what came from FEATURE.md and what Wave is certain
of is written into the HTML; DESIGN.md and the catalogue stay the policy.
');
  perform pg_temp.put_skill(v_designer, v_space, 'Wave Brief', 'wave-brief', '---
name: Wave Brief
description: Interview the designer and write the project''s DESIGN.md (its defaults and design language) in Post-it, so Wave never asks the same thing per element. Use once per project, before the design system and any screen.
---

# Wave Brief: DESIGN.md

DESIGN.md sits at the project root. Its **front matter** is the defaults
every element in the project inherits; its **prose** is the design language
you follow whenever you design for this project. A complete DESIGN.md removes
most of Wave''s questions before anything is drawn.

## Steps

1. `wave_get_brief` (kind design, id = the project). It returns the saved
   file, or a template, and what is missing.
2. **Read before asking.** Take everything you can from what the designer
   already gave you: their prompt, brand notes, existing screens, the token
   file. Fill those in first; never ask what you already know.
3. **Interview for the rest, grouped**, a few questions at a time, each with
   your proposed answer to confirm or change:
   - Product: what it is, who uses it, the platforms and widths
     (`viewports`), the language (`lang`).
   - Content: is the copy in the designs final, draft or placeholder
     (`content.copy`)? Where will copy live: code, a CMS, translation keys
     (`content.source`)?
   - Access: who can open a screen by default: public, signed-in, a role
     (`access`)? Can everyone see every element (`element-access`)?
   - Analytics: are controls tracked, and with what naming convention
     (`analytics.controls`: none or e.g. object_action)? Page views
     (`analytics.page-views`)?
   - Feature flags by default (`flags`: none, or the flag system).
   - Forms: when errors show (`forms.validate-on`: submit, blur, change);
     warn on leaving with unsaved changes (`forms.dirty-guard`).
   - Data: what data-driven text shows with no value (`data.empty`: hide,
     a dash, text); long text (`data.overflow`: wrap, truncate, clamp:2).
   - Icons: the library (lucide, material) or inline SVG (`icons`).
   - Responsive: what sections and cards do on small screens by default
     (`responsive`: stack, hide, collapse, scroll).
   - Links to other sites (`links.external`: _blank or _self); how dialogs
     and toasts close (`overlays`).
4. **Write the prose**, one section each, in the designer''s words where you
   can: Product, Voice and copy, Visual language, Layout and breakpoints, Components, Interaction and states, Forms, Accessibility, Content and data, Analytics. The visual language is concrete:
   colours with their hex values and roles, type families, sizes and
   weights, spacing scale, corner radii, shadows, motion. Components names
   every component the product needs. Forms carries the UX rules (when to
   use chips instead of a select, when errors appear, what is never
   disabled).
5. **Show the designer the whole file** and ask: "Is this right? Anything to
   change?" Change it until they approve.
6. `wave_save_brief` (kind design). Fix anything it still lists and save
   again.
7. Next: **Wave Design System** builds the tokens and components from it.

## The format

```markdown
---
wave: 1
name: Acme
lang: en
viewports: [390, 1280]
access: public            # who opens a screen by default: public, signed-in, role:<name>
element-access: everyone
icons: inline             # a library name (lucide, material) or inline
content:
  copy: final             # fixed text is final, draft or placeholder
  source: code            # code, cms or i18n
analytics:
  controls: none          # none, or a convention such as object_action
  page-views: none
flags: none
responsive: stack         # sections and cards on small screens: stack, hide, collapse, scroll
forms:
  validate-on: submit     # submit, blur or change
  dirty-guard: off
data:
  empty: hide             # what data-driven text shows with no value
  overflow: wrap
images:
  fit: cover
links:
  external: _blank
overlays:
  modal: close-button escape
  toast: auto:5
---

# Acme design

## Product

## Voice and copy

## Visual language

## Layout and breakpoints

## Components

## Interaction and states

## Forms

## Accessibility

## Content and data

## Analytics
```

Front matter values are what an element inherits when its own HTML says
nothing. An element can always override one (`data-wave-copy="draft"`,
`data-wave-track="checkout_started"`).

## What is never asked

Every element inherits, in this order, and anything inherited is not a
question:

1. **Its own HTML** (`data-wave-*`, native attributes).
2. **FEATURE.md**: the fields it writes (`data-wave-field`: rules, options,
   default, shown-when), the data it shows (`data-wave-bind`: type, source,
   empty, format), the action it takes (trigger, effects, destinations,
   confirm, tracking) and the screen''s route, title and access.
3. **Its component** in the catalogue: states, variants, responsive
   behaviour, events; parts inside a component instance belong to it.
4. **DESIGN.md**: copy status and where copy lives, who can see things,
   analytics, flags, form behaviour, empty values, overflow, icons,
   viewports, language.
5. **What Wave knows for certain**: names (slugs), element types, a submit
   button''s trigger, the action name, "none" for a control that only
   navigates.

When answers are applied, what came from FEATURE.md and what Wave is certain
of is written into the HTML; DESIGN.md and the catalogue stay the policy.
');
  perform pg_temp.put_skill(v_designer, v_space, 'Wave Design System', 'wave-design-system', '---
name: Wave Design System
description: Build and upload a project''s design system to Post-it (DTCG tokens and one approved HTML specimen per component, with variants, states, events and responsive behaviour) from DESIGN.md. Use after Wave Brief, and whenever a design needs a new component or variant.
---

# Wave Design System

The catalogue is the project''s tokens and components, approved by the
designer. Every instance on a screen inherits its component''s states,
variants, events and responsive behaviour, so they are never asked per
element.

## Steps

1. `wave_get_brief` (kind design). Without a saved DESIGN.md, run **Wave
   Brief** first. Take everything you can from it: the visual language gives
   the tokens, the Components section the list of components, Interaction and
   states the states, Layout the responsive behaviour.
2. **Tokens.** Every colour, size, spacing, radius, border width, shadow,
   font family, font weight, line height, letter spacing, duration, easing,
   opacity and z-index the designs use, as one W3C DTCG JSON file: every
   token has `$type` (own or inherited), dimensions are
   `{"value": 1, "unit": "rem"}` (never px; 1px is 0.0625rem), aliases point
   at real tokens. Show the designer the list grouped by type and ask: "Are
   these the right names and values? Anything missing or duplicated?"
   Publish it as the JSON page `design-system/tokens`.
3. **Components.** For each component in DESIGN.md (and any the designs
   show), propose, then confirm with the designer, grouped:
   - name and element type (button, textInput, card...); whether two
     similar things are one component with variants or two components;
   - variants, and **every state** it has (default, hover, focus, filled,
     valid, warning, error, disabled, loading, selected...);
   - **events**: what using it means, e.g. `{"select": "change"}` for a
     chip, `{"press": "click"}` for a button;
   - **responsive**: what it does on small screens (stack, full-width,
     hide, scroll);
   - anatomy (label, icon, helper text) and accessibility notes.
4. **Specimens.** One HTML page per component: head with
   `<meta name="wave:spec" content="1">`, `<meta name="wave:component" content="Button">`
   and a `<script type="application/wave-component+json" id="wave-component">`
   holding `{"type","description","variants","states","events","responsive","anatomy","a11y","status"}`;
   body drawing **every variant and every state**, each example marked
   `data-wave-component`, `data-wave-variant` and, for states,
   `data-wave-state`. Styles use only token variables.
   `wave_extract_component` makes a first specimen from an element on a
   screen.
5. `preflight_html` on each specimen (target = the project); fix everything
   it reports.
6. **Designer approval.** Show the tokens and every component with its
   variants and states. When the designer approves, set `"status": "approved"`
   in each definition and publish the specimens into
   `design-system/components`.
   - Publish each screen into the feature folder with `attach_file` (`<screen-slug>.html`)
     or `create_page` (`content_type: "html"`, `parent_id` = the feature). For a new
     version, `read_page` then `update_page` with its version. Specimens go into
     `design-system/components` the same way.
   - After saving, `check_screen` shows what Wave still finds missing on the uploaded file.
7. `wave_design_system_page` writes the design-system page (every
   component''s design-system id, its variants'' ids and its type) and the same
   table as JSON (`design-system-ids`) next to it, from the specimens. Never
   write that table by hand; run it again whenever a specimen is published,
   changed or approved.
8. Confirm with `get_catalogue`. Next: **Wave Feature** for the first
   feature.

## A new component later

When a screen needs something the catalogue lacks, ask the designer: "Is
this a new component, or a new variant of X?" Yes: steps 3 to 7 for it. No:
rebuild it from the existing component.
');
  perform pg_temp.put_skill(v_designer, v_space, 'Wave Feature', 'wave-feature', '---
name: Wave Feature
description: Turn the designer''s prompt for a feature into FEATURE.md (screens, fields, data, actions) in Post-it, then generate the feature''s HTML screens with every data-wave-* attribute already in place, reusing the catalogue exactly. Use for each new feature, after the design system is approved.
---

# Wave Feature

A feature is designed from its brief. FEATURE.md says what the screens are,
what people fill in, what data they see and what every action does; the
screens are then generated from it with their attributes, so almost nothing
is left to ask.

## 1. FEATURE.md, from the prompt

1. `wave_get_brief` (kind design) and `get_catalogue`: the defaults and the
   components you design with. `wave_get_brief` (kind feature, the feature
   folder) for the brief so far (or a template).
2. **Extract from the prompt first.** A good prompt already says most of it:
   - **screens**: one per step or state the prompt describes, each with a
     slug, title and route (`/start`, `/start/project`), and access if it
     differs from DESIGN.md;
   - **fields**: every input, as a data path (`lead/email`) with its type,
     rules (`required; pattern:email`), options for choices (chips, cards,
     selects), default, `visible-if` for conditional fields ("Other
     opens a text field" is `visible-if: lead/role == Other`), and a
     `sample`: the value the end-to-end tests fill in (one of the options
     for a choice; ask, never make one up);
   - **data**: everything a screen shows that is not fixed copy (a name, a
     recap, a price), with type, source, description, and empty/format when
     it matters;
   - **actions**: every button or link that does something, as an id
     (`lead/save-about`) with its screen, trigger, effects
     (`api/leads/save`, `email/confirmation`), destination on success
     (`to: screen:your-project`) and on failure
     (`failure: node:about-you/error-count`), and confirm, feedback,
     tracking or disabled-if when they apply. A screen''s submit action
     belongs to its submit buttons; name others with `on: [slug]`.
3. **Ask only what the prompt leaves open**, grouped, with your proposal:
   where a failure goes, what a dead end links to, which effects an action
   has. Never ask what DESIGN.md already sets.
4. Show the designer FEATURE.md and ask for their approval, then
   `wave_save_brief` (kind feature). Fix what it lists.

```markdown
---
wave: 1
feature: checkout
name: Checkout
screens:
  first-screen: { title: First screen, route: /path }
fields:
  # path: { type, validate, options, default, sample, visible-if, label }
data:
  # path: { type, source, description, empty, format }
actions:
  # id: { screen, on: [slug], trigger, effect, to, failure, confirm, feedback, track }
---

# Checkout

## Goal

## Flow

## Rules

## Outcomes
```

## 2. The screens, with their attributes

Generate each screen so the HTML is already the spec:

1. **Components exactly as the catalogue draws them**: read each specimen
   (`read_page`) and copy its markup and classes; mark each instance
   `data-wave-component` and `data-wave-variant`. Never restyle one.
2. **Ids**: every meaningful element gets `data-wave-id` (`n_` + 4 or more
   lowercase letters or digits); `wave_assign_ids` adds missing ones.
3. **From FEATURE.md**, on the elements themselves:
   - each input `data-wave-field="<path>"` (its rules, options and default
     come from the brief; write them too if you like);
   - each piece of data `data-wave-content="dynamic"` and
     `data-wave-bind="<path>"`;
   - each action''s control `data-wave-action="action/<id>"`, and
     `data-wave-trigger`, `data-wave-effect`, `data-wave-to`,
     `data-wave-to-failure` as the brief says;
   - the screen''s meta: `wave:screen`, `wave:flow`, `wave:route`,
     `wave:title`.
4. **Draw every state the brief implies**: an error message for each rule
   (`data-wave-state-of` the field, `data-wave-state="error"`), a warning
   where the brief has one, the loading state of every action with effects,
   the screen''s loading and error states when it shows data, and every
   dialog an action confirms with.
5. **Choices are radios or checkboxes**: chips and cards to pick from are a
   `role="radiogroup"` (or group) of `role="radio"`/`"checkbox"`
   buttons with `aria-checked`, the group carrying `data-wave-field`.
6. **Tokens only**: every colour, size and font is `var(--token)`.
7. **One self-contained file** per screen (see Fidelity), with the viewport tag.

Then **Wave Review** reads the screens and asks the few questions left.

## Fidelity: the upload must look exactly like the design

- **Export, never regenerate.** Start from the exact HTML the designer saw.
  Every change you make is additive (ids, attributes, asset addresses, token
  variables for the same values) and listed for the designer.
- **One self-contained file.** All CSS in `<style>` in the page. No local
  scripts or stylesheets; nothing but the HTML file is uploaded.
- **Scripts run, but in a sandbox with no storage.** `localStorage`,
  `sessionStorage`, `indexedDB` and cookies throw there: remove such code
  or wrap it in try/catch. A page built by a script at run time (an empty
  `<div id="root">` filled by JavaScript) cannot be specified: export the
  rendered HTML instead.
- **Viewport.** Include `<meta name="viewport" content="width=device-width, initial-scale=1">`.

| Looks different in Post-it | Usually because | Fix |
| --- | --- | --- |
| Fonts are wrong | A font file was local or inline | `upload_asset` the font, point `@font-face` at the hosted address |
| Images missing | Local or relative paths | `upload_asset` each, use the hosted addresses |
| Part of the page missing | A script failed (storage, a missing file) | Remove or guard the script; export rendered HTML |
| Everything missing | The page is built by a script | Export the rendered DOM as HTML |
| Colours or sizes shifted | Values changed while tokenising | Use the token with the same value; add a token if none |
| Layout wrong at a width | Viewport tag missing, or designed for another width | Add the viewport tag; check `wave:viewports` |
| Interactions dead | Handlers used storage or missing files | As above |

## Screen meta, in the head

```html
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
```

## Attributes

| Attribute | Meaning | Example |
| --- | --- | --- |
| `data-wave-id` | Stable, opaque, designer-owned id. Never changed or reused. | `n_7f3a2c` |
| `data-wave-slug` | Human name, unique within the screen. Renaming it breaks nothing. | `add-address-button` |
| `data-wave-component` | The design-system component this should become. | `Button` |
| `data-wave-variant` | The component variant. | `primary` |
| `data-wave-ds` | The design-system id of the component variant this is (from the catalogue). | `DS.primaryButton` |
| `data-wave-tag` | The tag Figma drew this as, before the semantic upgrade made it a real element (wave-figma). | `div` |
| `data-wave-from` | On an input the semantic upgrade made: the tag it replaced (wave-figma). | `p` |
| `data-wave-text` | On an input the semantic upgrade made: whether the drawn text became its placeholder or value. | `placeholder` |
| `data-wave-filled-color` | On an input the semantic upgrade made: the colour of typed text. | `var(--color-text-primary)` |
| `data-wave-insert` | A native checkbox or radio the semantic upgrade added inside a drawn control; hidden, it carries the choice. |  |
| `data-wave-role` | Semantic role where the tag does not say it (for example input). | `form` |
| `data-wave-origin` | Set to wave on ids the review tool created. Remove it once adopted. | `wave` |
| `data-wave-content` | static or dynamic. | `dynamic` |
| `data-wave-bind` | Resource path the content comes from. Free text, path grammar. | `user/firstName` |
| `data-wave-sample` | Example value. Defaults to the rendered text. | `Asim` |
| `data-wave-empty` | What to show when the value is missing. | `there` |
| `data-wave-format` | How the value is formatted. Free text. | `currency:GBP` |
| `data-wave-max` | Maximum length before truncation. | `40` |
| `data-wave-repeat` | This element repeats over a list resource. | `orders[]` |
| `data-wave-item` | Marks the child that is the repeated item template (no value). |  |
| `data-wave-action` | Action name. Free text, path grammar. | `action/signup/add-address` |
| `data-wave-trigger` | click, submit, change or load. Defaults to click. | `click` |
| `data-wave-effect` | Named side effects, space separated. Free text. | `api/address/create` |
| `data-wave-to` | Destination on success: screen:, node:, modal:, back, url:. | `screen:checkout-review` |
| `data-wave-to-failure` | Destination or node revealed on failure. | `node:checkout-address/form-error` |
| `data-wave-field` | The field this control writes. Free text, path grammar. | `address/postcode` |
| `data-wave-validate` | Validation rules, separated by semicolons. | `required; pattern:uk-postcode; max:8` |
| `data-wave-states` | States this node supports, space separated. | `default hover disabled loading error` |
| `data-wave-state` | Which state this element depicts. | `error` |
| `data-wave-state-of` | This element depicts another node (by id) in the state named by data-wave-state. | `n_7f3a2c` |
| `data-wave-visible-if` | Visibility condition over resource paths. Free text. | `user/isLoggedIn` |
| `data-wave-access` | Who can see it, when it differs from the screen: public, signed-in, role:<name>, plan:<name>. | `role:admin` |
| `data-wave-flag` | Feature flag it is behind. | `flags/new-checkout` |
| `data-wave-responsive` | What happens on small screens: stack, hide, collapse, scroll, or a note. | `stack` |
| `data-wave-behavior` | Behaviours on top of the element type, space separated: carousel, reorderable, draggable, drop-target, accordion, collapsible, infinite-scroll, swipe-actions, sticky, pull-to-refresh, copy-to-clipboard. | `carousel` |
| `data-wave-config` | Settings a behaviour needs, key:value separated by semicolons. | `autoplay:off; loop:on; controls:arrows dots` |
| `data-wave-icon` | Icon name from the icon library. | `lucide:search` |
| `data-wave-waived` | Answers the designer decided not to give, as JSON {field: reason}. | `{"to-failure":"Navigation only, cannot fail"}` |
| `data-wave-copy` | For static text: final, draft or placeholder. | `final` |
| `data-wave-copy-source` | Where static copy will live: code, cms, or i18n:<key>. | `i18n:checkout.address.title` |
| `data-wave-overflow` | When text is too long: wrap, truncate, or clamp:<lines>. | `clamp:2` |
| `data-wave-fit` | How an image fills its box: cover, contain or fill, optionally with a ratio. | `cover 16:9` |
| `data-wave-asset` | Where the real asset will live: cdn, bundled or user-upload. | `cdn` |
| `data-wave-values` | Every value a status can take and how each looks, value:variant separated by spaces. | `paid:success pending:warning failed:danger` |
| `data-wave-sort` | The order of a list or the sortable column. | `newest` |
| `data-wave-paginate` | How much of a list shows: all, pages:<n>, load-more:<n> or infinite:<n>. | `pages:20` |
| `data-wave-empty-state` | The node shown when a list has nothing, by id or slug. | `no-orders` |
| `data-wave-filter` | What filters a list and on what. | `status-tabs:order/status` |
| `data-wave-playback` | Media playback: autoplay, muted, loop, controls. | `controls muted` |
| `data-wave-disabled-if` | When the control cannot be used. | `form/invalid` |
| `data-wave-confirm` | The dialog that asks for confirmation first, by id or slug, or none. | `confirm-delete` |
| `data-wave-feedback` | The toast or banner shown on success, by id or slug, or none. | `saved-toast` |
| `data-wave-shortcut` | Keyboard shortcut. | `mod+s` |
| `data-wave-dismiss` | How a dialog, toast or banner goes away: close-button, backdrop, escape, auto:<seconds>, choice. | `close-button escape` |
| `data-wave-active-if` | When a navigation item is the current one. | `route/section == orders` |
| `data-wave-controls` | The panel a tab shows, by id or slug. | `orders-panel` |
| `data-wave-commit` | Whether a switch or checkbox acts immediately or on save: instant or save. | `instant` |
| `data-wave-track` | Analytics event sent. | `checkout_address_saved` |
| `data-wave-options` | Choices: a list separated by \|, or a resource path. | `catalog/sizes[]` |
| `data-wave-default` | The starting value, or none. | `none` |
| `data-wave-validate-on` | When a form shows errors: submit, blur or change. | `blur` |
| `data-wave-dirty-guard` | Whether leaving with unsaved changes warns: on or off. | `on` |

Names (resources, actions, effects, fields) are free text in a path grammar;
reuse the same name for the same thing across screens. `none` is a valid
answer where nothing applies; what Wave refuses is no answer at all.

## What is never asked

Every element inherits, in this order, and anything inherited is not a
question:

1. **Its own HTML** (`data-wave-*`, native attributes).
2. **FEATURE.md**: the fields it writes (`data-wave-field`: rules, options,
   default, shown-when), the data it shows (`data-wave-bind`: type, source,
   empty, format), the action it takes (trigger, effects, destinations,
   confirm, tracking) and the screen''s route, title and access.
3. **Its component** in the catalogue: states, variants, responsive
   behaviour, events; parts inside a component instance belong to it.
4. **DESIGN.md**: copy status and where copy lives, who can see things,
   analytics, flags, form behaviour, empty values, overflow, icons,
   viewports, language.
5. **What Wave knows for certain**: names (slugs), element types, a submit
   button''s trigger, the action name, "none" for a control that only
   navigates.

When answers are applied, what came from FEATURE.md and what Wave is certain
of is written into the HTML; DESIGN.md and the catalogue stay the policy.
');
  perform pg_temp.put_skill(v_designer, v_space, 'Wave Review', 'wave-review', '---
name: Wave Review
description: Analyse a feature''s HTML mockups against DESIGN.md, FEATURE.md and the catalogue, ask only the questions still open (grouped, with proposals), run the Wave dry run for product, check, upload to Post-it, make the clickable prototype and handle review comments.
---

# Wave Review

The screens exist (from Wave Feature, or brought by the designer). Wave now
works out everything it can from the HTML, FEATURE.md, the catalogue and
DESIGN.md, and what is left are the real decisions.

## Steps

1. **Context.** `wave_get_brief` (design and feature) and `get_catalogue`.
   A mockup made without Wave Feature: write FEATURE.md from it first (Wave
   Feature, part 1: read the screens and the prompt, propose the fields,
   data and actions, confirm), because every answer in the brief answers
   every element that uses it.
2. **Ids.** `wave_assign_ids` on each screen, with its screen slug from
   FEATURE.md (it never changes an id). It also gives the test ids
   (`<screen>.<section>.<DS id>.<label>`) that the end-to-end tests and the
   built app use; publishing gives any still missing. Two elements it would
   name the same are the designer''s to name apart.
3. **Analyse.** `wave_dry_run` with the feature and every screen. It saves
   the question sheet ("Wave questions") with only what is open: one entry
   per decision, listing every element it applies to, mandatory first, split
   into questions for product and for the designer, each with Wave''s
   proposal. What was inherited is counted, not listed.
4. **Before asking, look for a better home for the answer.** A question
   about a field, data or an action belongs in FEATURE.md; a question that
   will repeat on every screen (copy, analytics, access) belongs in
   DESIGN.md; a question about a component''s states belongs in its
   specimen. Update the brief (with the designer''s agreement) and run again:
   it answers every element at once.
5. **Ask the designer the rest**, a group at a time, with the proposal:
   "These 3 step buttons are disabled: when can people jump to a step?".
   Write their answers in the sheet (one answer under a grouped question
   covers every element in it) and run `wave_dry_run` again. Product''s
   questions: give the designer the link to "Wave questions" to share; when
   product has answered in it, run again. It marks answers to fix
   ("**Fix:** ..."); tidy plain words into the format asked. Repeat until it
   **passes** (it saves "Wave answers"). "Wave dry run" stops here: nothing
   is uploaded.
6. **Apply.** `wave_apply_answers` with the "Wave answers" sheet on each
   screen: it writes the answers, the brief''s values and the names Wave
   assigned into the HTML.
7. **Assets.** Every local or inline image, SVG file, icon, logo and font:
   `upload_asset` (project id, file name, base64 bytes), then use the
   returned address. Links to other websites stay.
8. **Preflight.** `preflight_html` (target = the feature) on every screen;
   fix everything mandatory. Then **show the designer** each screen, what you
   changed (ids, attributes, asset addresses, tokens), what they confirmed,
   anything waived and the result. **Ask: "Does this match what you
   designed? May I upload it?"** Upload only on a clear yes.
   - Publish each screen into the feature folder with `attach_file` (`<screen-slug>.html`)
     or `create_page` (`content_type: "html"`, `parent_id` = the feature). For a new
     version, `read_page` then `update_page` with its version. Specimens go into
     `design-system/components` the same way.
   - After saving, `check_screen` shows what Wave still finds missing on the uploaded file.
9. **Compare after upload.** Give the designer the Post-it link to each
   uploaded screen (https://<post-it>/review/<page id>) to compare with the original side by
   side; fix any difference (see Fidelity in Wave Feature), preflight and
   upload again.
10. **Prototype** (below), then give the designer the prototype link.
11. **End-to-end tests.** Publishing wrote the feature''s Gherkin
    (`tests/flow-feature`, its happy path by test id). If it is not complete,
    the gaps are FEATURE.md samples: ask, save, and it is written again. Then
    run it with Wave Test (`skills/engineering/wave-test`; Claude Code runs
    it, not Claude Design) against the prototype, or say it has to be run
    there before the feature can be approved.
12. Only then ask for review, on each screen and on `tests/flow-feature`.

A waiver (`waive: <reason>`) is the designer''s call, for something that
really does not apply. Optional questions are hidden; ask for "the optional
questions" only if the designer wants them.

## Prototype: the feature as a working product, on a mock API

A feature plays as one prototype: every screen in one frame with a device bar
(mobile, tablet, desktop), links and actions moving between screens, forms
validating, and the data coming from a **mock API** served by MSW in the
page. The mock API is the feature''s OpenAPI document; the screens connect to
it through the attributes they already have.

1. **Publish the whole flow at once** when there are several screens:
   `wave_publish_flow` (feature id, every screen''s name and HTML, and the
   OpenAPI document and mock files if you have them). It preflights and saves
   every screen, then the API, and returns the review and prototype links.
   The designer''s confirmation (step 8 above) still comes first.
2. **The API.** If the designer or product gave an OpenAPI file, use it.
   Otherwise `wave_generate_api` drafts one from the uploaded screens: one
   GET per data root the screens read, one POST per `api/...` effect, with
   the values the design shows as examples. Show the designer the draft and
   the data requirements it lists, and improve it with them:
   - realistic examples: more list items, long and short values, an empty list;
   - every failure product expects (validation 422, not found 404, server 500),
     as extra responses or named examples: each becomes a choice in the
     prototype''s **Scenarios** menu;
   - `x-wave-delay` on slow calls, so loading states show.
   Save it with `wave_save_api` (JSON or YAML; mock files are response
   bodies by operationId). It rewrites the feature''s **Data requirements** page
   and lists anything the screens read or call that the API does not serve.
3. **How screens meet the API** (keep these exact):
   - `x-wave-provides: order` on a GET: its response is the data root
     `order`, so `data-wave-bind="order/total"`, `data-wave-repeat="order/items[]"`
     and `data-wave-visible-if="order/paymentFailed"` read it.
   - `x-wave-effect: api/orders/place` on an operation: an action with
     `data-wave-effect="api/orders/place"` calls it, shows the loading state
     drawn for the control, then follows `data-wave-to` on success or
     `data-wave-to-failure` on an error response.
   - Form fields (`data-wave-field`) are validated (`data-wave-validate`)
     on submit, showing the error states drawn for them, and sent as the body.
   - Route parameters (`:orderId`) come from the path parameters'' examples.
4. `get_prototype` gives the link and what is still missing. Give the
   designer the link: "Click through it on mobile and desktop, and try the
   failure scenarios." Fix what they find.
5. To show it to somebody without a Post-it account (a client, a stakeholder),
   `share_prototype` makes a link (label it for who it is for; give an
   expiry). Give the designer the link at once: it is not shown again.

Screens that call `fetch` themselves also work: every request to the API''s
base address is answered by the same mock server. Use `fetch`, never
`XMLHttpRequest` or jQuery (preflight warns about both).

An action with `data-wave-confirm="<dialog slug>"` opens that dialog first
in the prototype: its cancel control (`data-wave-to="back"`, or a button
reading Cancel, No or Keep) closes it; its other button confirms and runs the
action. So draw the dialog on the screen, with both buttons.

## Review rounds

1. `list_comments` with the feature''s `flow_id` and `status: "open"`.
2. `read_page` each affected screen, make the changes (keeping ids), preflight, show the
   designer, and `update_page`. Note the version each save returns.
3. For each comment you dealt with, `mark_addressed` with its `comment_id`, the version
   that fixes it and one sentence on what changed.
4. When every screen and the flow are complete, `ask_for_review` on each screen.

Each comment says where it points: an address (`screen.type.slug`) and
`data-wave-id`, quoted words, an area, or an element without an id (give it
one). You cannot resolve comments: a reviewer confirms. If you disagree, say so
to the designer rather than marking it addressed.

## Rules that matter most

1. Every meaningful element has a `data-wave-id` (`n_` + at least 4
   lowercase letters or digits). **Never change or reuse an id**: comments and
   answers are anchored to ids.
2. Every element''s address is `screen.type.slug`; its parent''s address is the
   same for the element it sits in. Slugs are unique on a screen; screen slugs
   are unique in the project.
3. Always read the latest version before editing: reviewers'' confirmed values
   and waivers are saved as new versions of the file.
4. Only the uploader can change a screen in Post-it; everybody else comments.

## What is never asked

Every element inherits, in this order, and anything inherited is not a
question:

1. **Its own HTML** (`data-wave-*`, native attributes).
2. **FEATURE.md**: the fields it writes (`data-wave-field`: rules, options,
   default, shown-when), the data it shows (`data-wave-bind`: type, source,
   empty, format), the action it takes (trigger, effects, destinations,
   confirm, tracking) and the screen''s route, title and access.
3. **Its component** in the catalogue: states, variants, responsive
   behaviour, events; parts inside a component instance belong to it.
4. **DESIGN.md**: copy status and where copy lives, who can see things,
   analytics, flags, form behaviour, empty values, overflow, icons,
   viewports, language.
5. **What Wave knows for certain**: names (slugs), element types, a submit
   button''s trigger, the action name, "none" for a control that only
   navigates.

When answers are applied, what came from FEATURE.md and what Wave is certain
of is written into the HTML; DESIGN.md and the catalogue stay the policy.

## The decision tree: what to ask for every element

Wave detects each element''s type. For each type, ask every **mandatory**
question (and the recommended ones the designer wants to answer). Questions
marked "designer" are about look, components, states and accessibility;
"product" ones are about data, behaviour, rules, navigation, permissions and
tracking (the designer answers these too, having agreed them with product).

### Every element

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Element type | worked out by Wave | | `data-wave-role` to override | Never asked: Wave detects it. |
| Name (slug) | worked out by Wave | | `data-wave-slug` to override | Never asked: named from its field, action, component or text, unique on the screen. |
| Shown when (when it is hidden in the mockup) | mandatory when hidden, else recommended | product | `data-wave-visible-if` | This is hidden in the mockup. When is it shown? |

### The screen

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Screen slug | **mandatory** | product | `wave:screen` | What is this screen called? A slug unique in the project. |
| Title | **mandatory** | product | `wave:title` | The page title? |
| Route | **mandatory** | product | `wave:route` | What URL is it at, with parameters? e.g. /checkout/:orderId/address |
| Feature | **mandatory** | product | `wave:flow` | Which feature (flow) is this part of? |
| Who can open it | **mandatory** | product | `wave:access` | Who can open this: public, signed-in, role:<name>? |
| Designed for widths | **mandatory** | designer | `wave:viewports` | Which widths is it designed for? e.g. 375 768 1440 |
| How people arrive | recommended | product | `wave:entry` | How do people arrive here: link, email, push, another screen? |
| Page-view event | recommended | product | `wave:track` | What is the page-view analytics event, or none? |
| Language | recommended | designer | `lang` | Which language is the page in (html lang)? |
| Viewport tag | **mandatory** | designer | the design | Add <meta name="viewport" content="width=device-width, initial-scale=1">. |
| Screen loading state (if the screen shows data) | **mandatory** | designer | the design | The screen shows data. Draw what it looks like while loading (an element with data-wave-state="loading"). |
| Screen error state (if the screen shows data) | **mandatory** | designer | the design | The screen shows data. Draw what it looks like if loading fails (an element with data-wave-state="error"). |
| Data: each path (bind, repeat, field) | **mandatory** | product | wave-resources | What is it? Its type, where it comes from, and what it means (type; source; description). |

### Structure

#### section

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Who can see it | recommended | product | `data-wave-access` | Can everyone on this screen see it, or only some roles or plans? |
| On small screens | recommended | designer | `data-wave-responsive` | What happens to this on mobile: stack, hide, collapse, scroll? |
| Feature flag | recommended | product | `data-wave-flag` | Is this behind a feature flag? Which one, or none? |

#### card

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |
| Variant | **mandatory** | designer | `data-wave-variant` | Which variant: primary, secondary, tertiary, destructive, or another the system has? |
| Who can see it | recommended | product | `data-wave-access` | Can everyone on this screen see it, or only some roles or plans? |
| On small screens | recommended | designer | `data-wave-responsive` | What happens to this on mobile: stack, hide, collapse, scroll? |

#### list

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| List of | **mandatory** | product | `data-wave-repeat` | What is this a list of? A data path ending in [], e.g. orders[]. |
| Item template | **mandatory** | designer | the design | Mark the one child that is the item template (data-wave-item). Other copies are samples. |
| Order | **mandatory** | product | `data-wave-sort` | In what order: newest, price, alphabetical, as returned? |
| How many | **mandatory** | product | `data-wave-paginate` | All at once, pages, load more, or infinite scroll? all, pages:20, load-more:20, infinite:20. |
| When empty | **mandatory** | designer | `data-wave-empty-state` | What shows when there are none? The empty state''s slug. |
| Filters | recommended | product | `data-wave-filter` | Which controls filter it, and on what? |
| Who can see it | recommended | product | `data-wave-access` | Can everyone on this screen see it, or only some roles or plans? |
| On small screens | recommended | designer | `data-wave-responsive` | What happens to this on mobile: stack, hide, collapse, scroll? |

#### table

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| List of | **mandatory** | product | `data-wave-repeat` | What is this a list of? A data path ending in [], e.g. orders[]. |
| Item template | **mandatory** | designer | the design | Mark the one child that is the item template (data-wave-item). Other copies are samples. |
| Order | **mandatory** | product | `data-wave-sort` | In what order: newest, price, alphabetical, as returned? |
| How many | **mandatory** | product | `data-wave-paginate` | All at once, pages, load more, or infinite scroll? all, pages:20, load-more:20, infinite:20. |
| When empty | **mandatory** | designer | `data-wave-empty-state` | What shows when there are none? The empty state''s slug. |
| Filters | recommended | product | `data-wave-filter` | Which controls filter it, and on what? |
| Who can see it | recommended | product | `data-wave-access` | Can everyone on this screen see it, or only some roles or plans? |
| On small screens | recommended | designer | `data-wave-responsive` | What happens to this on mobile: stack, hide, collapse, scroll? |

#### modal

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Kind | **mandatory** | designer | `data-wave-role` | Modal, drawer, sheet or full screen? |
| Opened by | **mandatory** | product | the design | Nothing opens this. Give the control that opens it data-wave-to="modal:<screen>/<this slug>". |
| Closes by | **mandatory** | product | `data-wave-dismiss` | How does it close: close-button, backdrop, escape, or only by choosing? |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### navigation

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Current item | **mandatory** | product | `data-wave-active-if` | How do we know which item is current? |
| Every item goes somewhere | **mandatory** | product | the design | Every item needs a destination (data-wave-to). |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |
| On small screens | recommended | designer | `data-wave-responsive` | What happens to this on mobile: stack, hide, collapse, scroll? |

#### menu

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Opens on | **mandatory** | product | `data-wave-trigger` | What opens it: click or hover? |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

### Content

#### heading

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is this text fixed, or does it come from data? |
| Copy status (if fixed text) | **mandatory** | product | `data-wave-copy` | Is this the final copy? final, draft or placeholder. |
| Where the copy lives (if fixed text) | recommended | product | `data-wave-copy-source` | Where will this copy live: code, cms, or a translation key (i18n:<key>)? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data does it show? A path such as user/firstName. |
| When empty (if from data) | **mandatory** | product | `data-wave-empty` | What shows if there is no value: hide it, a dash, or some text? |
| Overflow (if from data) | **mandatory** | designer | `data-wave-overflow` | If it is too long: wrap, truncate, or clamp to N lines (clamp:2)? |
| Example value (if from data) | recommended | product | `data-wave-sample` | Is the text shown a realistic example? |
| Max length (if from data) | recommended | product | `data-wave-max` | How long can it get? |

#### text

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is this text fixed, or does it come from data? |
| Copy status (if fixed text) | **mandatory** | product | `data-wave-copy` | Is this the final copy? final, draft or placeholder. |
| Where the copy lives (if fixed text) | recommended | product | `data-wave-copy-source` | Where will this copy live: code, cms, or a translation key (i18n:<key>)? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data does it show? A path such as user/firstName. |
| When empty (if from data) | **mandatory** | product | `data-wave-empty` | What shows if there is no value: hide it, a dash, or some text? |
| Overflow (if from data) | **mandatory** | designer | `data-wave-overflow` | If it is too long: wrap, truncate, or clamp to N lines (clamp:2)? |
| Example value (if from data) | recommended | product | `data-wave-sample` | Is the text shown a realistic example? |
| Max length (if from data) | recommended | product | `data-wave-max` | How long can it get? |

#### label

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is this text fixed, or does it come from data? |
| Copy status (if fixed text) | **mandatory** | product | `data-wave-copy` | Is this the final copy? final, draft or placeholder. |
| Where the copy lives (if fixed text) | recommended | product | `data-wave-copy-source` | Where will this copy live: code, cms, or a translation key (i18n:<key>)? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data does it show? A path such as user/firstName. |
| When empty (if from data) | **mandatory** | product | `data-wave-empty` | What shows if there is no value: hide it, a dash, or some text? |
| Overflow (if from data) | **mandatory** | designer | `data-wave-overflow` | If it is too long: wrap, truncate, or clamp to N lines (clamp:2)? |
| Example value (if from data) | recommended | product | `data-wave-sample` | Is the text shown a realistic example? |
| Max length (if from data) | recommended | product | `data-wave-max` | How long can it get? |

#### inlineValue

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is this text fixed, or does it come from data? |
| Copy status (if fixed text) | **mandatory** | product | `data-wave-copy` | Is this the final copy? final, draft or placeholder. |
| Where the copy lives (if fixed text) | recommended | product | `data-wave-copy-source` | Where will this copy live: code, cms, or a translation key (i18n:<key>)? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data does it show? A path such as user/firstName. |
| When empty (if from data) | **mandatory** | product | `data-wave-empty` | What shows if there is no value: hide it, a dash, or some text? |
| Overflow (if from data) | **mandatory** | designer | `data-wave-overflow` | If it is too long: wrap, truncate, or clamp to N lines (clamp:2)? |
| Example value (if from data) | recommended | product | `data-wave-sample` | Is the text shown a realistic example? |
| Max length (if from data) | recommended | product | `data-wave-max` | How long can it get? |
| Format (for values and dynamic text) | recommended | product | `data-wave-format` | How is it formatted? e.g. currency:GBP, date:relative, number:0dp, percent:1dp. |

#### formattedValue

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is this text fixed, or does it come from data? |
| Copy status (if fixed text) | **mandatory** | product | `data-wave-copy` | Is this the final copy? final, draft or placeholder. |
| Where the copy lives (if fixed text) | recommended | product | `data-wave-copy-source` | Where will this copy live: code, cms, or a translation key (i18n:<key>)? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data does it show? A path such as user/firstName. |
| When empty (if from data) | **mandatory** | product | `data-wave-empty` | What shows if there is no value: hide it, a dash, or some text? |
| Overflow (if from data) | **mandatory** | designer | `data-wave-overflow` | If it is too long: wrap, truncate, or clamp to N lines (clamp:2)? |
| Example value (if from data) | recommended | product | `data-wave-sample` | Is the text shown a realistic example? |
| Max length (if from data) | recommended | product | `data-wave-max` | How long can it get? |
| Format (for values and dynamic text) | **mandatory** | product | `data-wave-format` | How is it formatted? e.g. currency:GBP, date:relative, number:0dp, percent:1dp. |

#### image

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Alt text | **mandatory** | designer | `alt` | Describe it for screen readers, or leave alt empty if it is decorative. |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is it always this image, or from data? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data gives the image? |
| Fallback (if from data) | **mandatory** | designer | `data-wave-empty` | What shows if there is no image or it fails to load? |
| Fit | **mandatory** | designer | `data-wave-fit` | Crop to fill or fit inside, and what ratio? e.g. cover 16:9. |
| Where it lives | recommended | product | `data-wave-asset` | Where will the real image live: cdn, bundled, user-upload? |

#### icon

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Decorative or meaningful | **mandatory** | designer | `aria-label` | Does it mean something on its own? If yes give it an aria-label; if not, aria-hidden="true". |
| Icon name | **mandatory** | designer | `data-wave-icon` | Which icon from the library? e.g. lucide:search. |

#### avatar

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Alt text | **mandatory** | designer | `alt` | Describe it for screen readers, or leave alt empty if it is decorative. |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is it always this image, or from data? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data gives the image? |
| Fallback (if from data) | **mandatory** | designer | `data-wave-empty` | What shows if there is no image or it fails to load? |
| Fit | **mandatory** | designer | `data-wave-fit` | Crop to fill or fit inside, and what ratio? e.g. cover 16:9. |
| Where it lives | recommended | product | `data-wave-asset` | Where will the real image live: cdn, bundled, user-upload? |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### badge

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is this text fixed, or does it come from data? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data does it show? A path such as user/firstName. |
| Values and looks (if from data) | **mandatory** | product | `data-wave-values` | Every value it can take and how each looks, e.g. paid:success pending:warning failed:danger. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |
| Variant | recommended | designer | `data-wave-variant` | Which variant: primary, secondary, tertiary, destructive, or another the system has? |

#### media

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Always this media, or from data? |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data does it show? A path such as user/firstName. |
| Playback | **mandatory** | designer | `data-wave-playback` | Autoplay, muted, loop, controls? |

#### chart

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which data, over what period? |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |
| When empty (if from data) | **mandatory** | product | `data-wave-empty` | What shows with no data? |

#### map

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Data (if from data) | **mandatory** | product | `data-wave-bind` | Which location data and markers does it show? |
| When empty (if from data) | **mandatory** | product | `data-wave-empty` | What shows with no locations? |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |
| Interactions | **mandatory** | product | `data-wave-config` | What can people do on the map: pan, zoom, select a marker (and what that does)? |

### Actions

#### button

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Label | **mandatory** | designer | `aria-label` | An icon-only button needs an aria-label saying what it does. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |
| Variant | **mandatory** | designer | `data-wave-variant` | Which variant: primary, secondary, tertiary, destructive, or another the system has? |
| Action | **mandatory** | product | `data-wave-action` | What is this action called? e.g. action/checkout/add-address. |
| Trigger | **mandatory** | product | `data-wave-trigger` | What triggers it: click, submit, change or load? |
| Side effects | **mandatory** | product | `data-wave-effect` | What happens behind it: API calls, analytics, emails, payments? Space separated, or none. |
| On success | **mandatory** | product | `data-wave-to` | Where does the user end up when it works? screen:, node:, modal:, back, url:, or stay. |
| On failure (if it has side effects) | **mandatory** | product | `data-wave-to-failure` | What happens if it fails? The node that shows the error (node:screen/slug), a screen, or none. |
| States | **mandatory** | designer | `data-wave-states` | Which states does it have? e.g. default hover focus disabled loading error. |
| Loading state drawn (if it has side effects) | **mandatory** | designer | the design | It does work behind the scenes, so draw its loading state (data-wave-state-of here, data-wave-state="loading"). |
| Disabled when (if it can be disabled) | **mandatory** | product | `data-wave-disabled-if` | When can it not be pressed? |
| Asks to confirm (if it looks destructive (delete, remove, cancel…)) | **mandatory** | product | `data-wave-confirm` | This looks destructive. Does it ask "are you sure" first? The dialog''s slug, or none. |
| Success message (if it has side effects) | recommended | product | `data-wave-feedback` | Is there a message when it works? The toast''s slug, or none. |
| Analytics event | recommended | product | `data-wave-track` | Is using this tracked? Event name, or none. |

#### link

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| On success | **mandatory** | product | `data-wave-to` | Where does it go? screen:<slug>, url:https://…, node:, modal:, back. |
| New tab (if it goes to another website) | **mandatory** | product | `target` | It leaves the product. Open in a new tab (_blank) or the same one (_self)? |
| Analytics event | recommended | product | `data-wave-track` | Is using this tracked? Event name, or none. |

### Inputs

#### form

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Submit button | **mandatory** | product | the design | Which button submits it? Give one button data-wave-trigger="submit". |
| Shows errors on | **mandatory** | product | `data-wave-validate-on` | When are errors shown: submit, blur (leaving a field) or change (as they type)? |
| Warn on leaving | recommended | product | `data-wave-dirty-guard` | Warn if they leave with unsaved changes? on or off. |

#### textInput

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Writes to | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Input type | **mandatory** | designer | `type` | Which input type: text, email, password, number, tel, url, search? |
| Label | **mandatory** | designer | the design | It needs a label people and screen readers can read. |
| Required and rules | **mandatory** | product | `data-wave-validate` | Must it be filled in, and what rules apply (format, length, range)? Say optional if none. |
| Error message drawn (if it has validation rules) | **mandatory** | designer | the design | Draw the error message for each rule (an element with data-wave-state-of pointing here and data-wave-state="error"). |
| States | **mandatory** | designer | `data-wave-states` | Which states does it have? e.g. default hover focus disabled loading error. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |
| Input mask (for text and phone inputs) | recommended | product | `data-wave-format` | Is it auto-formatted as they type (phone, card, date)? |
| Autocomplete | recommended | designer | `autocomplete` | Browser autocomplete hint (e.g. email, postal-code, cc-number)? |

#### select

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Writes to | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Label | **mandatory** | designer | the design | It needs a label people and screen readers can read. |
| Options | **mandatory** | product | `data-wave-options` | What are the choices, and where do they come from? A list separated by \|, or a data path. |
| Starting value | **mandatory** | product | `data-wave-default` | What is it set to at the start? A value, or none. |
| Required and rules | **mandatory** | product | `data-wave-validate` | Must a choice be made? required or optional. |
| Error message drawn (if it has validation rules) | **mandatory** | designer | the design | Draw the error message for each rule (an element with data-wave-state-of pointing here and data-wave-state="error"). |
| States | **mandatory** | designer | `data-wave-states` | Which states does it have? e.g. default hover focus disabled loading error. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### checkbox

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Writes to | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Label | **mandatory** | designer | the design | It needs a label people and screen readers can read. |
| Starting value | **mandatory** | product | `data-wave-default` | What is it set to at the start? A value, or none. |
| Required and rules | **mandatory** | product | `data-wave-validate` | Must it be ticked (e.g. terms)? required or optional. |
| Acts | recommended | product | `data-wave-commit` | Does ticking it do something immediately (instant) or only on save (save)? |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### radio

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Label | **mandatory** | designer | the design | Each option needs a label. |

#### radioGroup

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Writes to | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Label | **mandatory** | designer | the design | The group needs a label (a legend or aria-label). |
| Options | **mandatory** | product | `data-wave-options` | What are the choices, and where do they come from? A list separated by \|, or a data path. |
| Starting value | **mandatory** | product | `data-wave-default` | What is it set to at the start? A value, or none. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### switch

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Label | **mandatory** | designer | the design | It needs a label people and screen readers can read. |
| Acts | **mandatory** | product | `data-wave-commit` | Does flipping it take effect immediately (instant) or on save (save)? |
| Writes to (if it acts on save) | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Action (if it acts instantly) | **mandatory** | product | `data-wave-action` | What is this action called? e.g. action/checkout/add-address. |
| Trigger (if it acts instantly) | **mandatory** | product | `data-wave-trigger` | What triggers it: click, submit, change or load? |
| Side effects (if it acts instantly) | **mandatory** | product | `data-wave-effect` | What happens behind it: API calls, analytics, emails, payments? Space separated, or none. |
| On success (if it acts instantly) | **mandatory** | product | `data-wave-to` | Where does the user end up when it works? screen:, node:, modal:, back, url:, or stay. |
| On failure (if it acts instantly and it has side effects) | **mandatory** | product | `data-wave-to-failure` | What happens if it fails? The node that shows the error (node:screen/slug), a screen, or none. |
| Starting value | **mandatory** | product | `data-wave-default` | What is it set to at the start? A value, or none. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### datePicker

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Writes to | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Label | **mandatory** | designer | the design | It needs a label people and screen readers can read. |
| Required and rules | **mandatory** | product | `data-wave-validate` | Must it be filled in, and what rules apply (format, length, range)? Say optional if none. |
| Error message drawn (if it has validation rules) | **mandatory** | designer | the design | Draw the error message for each rule (an element with data-wave-state-of pointing here and data-wave-state="error"). |
| States | **mandatory** | designer | `data-wave-states` | Which states does it have? e.g. default hover focus disabled loading error. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |
| Allowed range | **mandatory** | product | `min` | Earliest and latest allowed? Past dates allowed? (min/max attributes, or rules like future-only) |
| Format (for values and dynamic text) | **mandatory** | product | `data-wave-format` | How is the date shown? e.g. date:medium, time:short (and whose time zone). |

#### slider

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Writes to | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Label | **mandatory** | designer | the design | It needs a label people and screen readers can read. |
| Minimum | **mandatory** | product | `min` | The minimum value? |
| Maximum | **mandatory** | product | `max` | The maximum value? |
| Step | **mandatory** | product | `step` | The step size? |
| Starting value | **mandatory** | product | `data-wave-default` | What is it set to at the start? A value, or none. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### fileUpload

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Writes to | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Label | **mandatory** | designer | the design | It needs a label people and screen readers can read. |
| Accepted types | **mandatory** | product | `accept` | Which file types are accepted? e.g. image/*,.pdf |
| Required and rules | **mandatory** | product | `data-wave-validate` | Maximum size and count? e.g. required; max-size:5MB; max-files:3 |
| Action | **mandatory** | product | `data-wave-action` | What happens to the file: uploaded immediately, or with the form? Name the action. |
| States | **mandatory** | designer | `data-wave-states` | Which states does it have? e.g. default hover focus disabled loading error. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### richTextEditor

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Writes to | **mandatory** | product | `data-wave-field` | Which data does this set? A path such as address/postcode. |
| Label | **mandatory** | designer | the design | It needs a label people and screen readers can read. |
| Allowed formatting | **mandatory** | product | `data-wave-config` | Which formatting is allowed? e.g. formats:bold italic link list |
| Format (for values and dynamic text) | **mandatory** | product | `data-wave-format` | What does it save as: html, markdown or json? |
| Required and rules | **mandatory** | product | `data-wave-validate` | Required? Maximum length? |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

### Feedback

#### errorMessage

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Belongs to | **mandatory** | product | the design | What is this the error of? Point data-wave-state-of at the field, or make an action''s data-wave-to-failure lead here. |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Fixed text, or the message the server returns? |
| Copy status (if fixed text) | recommended | product | `data-wave-copy` | Is this the final copy? final, draft or placeholder. |

#### emptyState

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Shown when | **mandatory** | product | the design | When does it show? Point a list''s data-wave-empty-state here, or give it data-wave-visible-if. |

#### loadingState

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Loading of | **mandatory** | designer | the design | What is this the loading state of? Point data-wave-state-of at it. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### toast

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Shown by | **mandatory** | product | the design | What shows it? Point an action''s data-wave-feedback here, or give it data-wave-visible-if. |
| Variant | **mandatory** | designer | `data-wave-variant` | Severity: info, success, warning or error? |
| Goes away | **mandatory** | product | `data-wave-dismiss` | Does it hide by itself (auto:5) or need closing (close-button)? |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### tooltip

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Opens on | **mandatory** | product | `data-wave-trigger` | Hover, focus or click? |
| Describes | **mandatory** | designer | the design | Which element does it describe? Point data-wave-state-of at it. |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Is this text fixed, or does it come from data? |

### Behaviours

Written in `data-wave-behavior`; each needs its settings in `data-wave-config` (key:value; key:value) and some attributes.

| Behaviour | Settings | Attributes |
| --- | --- | --- |
| carousel | autoplay, loop, controls | none |
| reorderable | keyboard | data-wave-action |
| draggable | drops | data-wave-action |
| drop-target | none | data-wave-action |
| accordion | open, multiple | none |
| collapsible | open | none |
| infinite-scroll | none | data-wave-paginate |
| swipe-actions | none | none |
| sticky | position | none |
| pull-to-refresh | none | data-wave-action |
| copy-to-clipboard | copies | data-wave-feedback |');
  perform pg_temp.put_skill(v_engineering, v_space, 'Wave Figma', 'wave-figma', '---
name: Wave Figma
description: Start here when a design is in Figma. Brings a Figma file into Wave in Post-it through three skill-driven stages (Wave Figma Brief for DESIGN.md, Wave Figma Design System for tokens and specimens, Wave Figma Feature for screens, review and the prototype). Claude runs every command; the engineer answers questions; the designer fixes Figma and approves in Post-it.
---

# Wave Figma

The engineer says something like "Bring this Figma file into Wave:
<link>". You do everything else, stage by stage, asking only questions.

| Stage | Skill | Makes | Waits for |
| --- | --- | --- | --- |
| 1 | `wave-figma-brief` | The project and DESIGN.md | The engineer''s answers |
| 2 | `wave-figma-design-system` | Tokens, one specimen per component, the design-system page | A ready file; the designer''s approval |
| 3 | `wave-figma-feature` | Screens, FEATURE.md, review, the prototype | A ready file; the designer''s review |

## Start

1. **Setup, once per machine, without asking.** Check `node --version` (20 or
   later) and `npx playwright --version` with Chromium. Download the command
   line: `curl -sSfo wave-figma.mjs <post-it>/wave/wave-figma.mjs`, where `<post-it>` is the Post-it connector''s address without `/api/mcp`. Run it as
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
5. Load the stage''s skill with `get_skill` (space `wave`, path
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
  any page that does not match Figma''s own render, any font Wave cannot serve,
  any control that does nothing in the prototype because the look it changes
  to is not drawn (a chosen state, a select''s open menu).
  Never work around one: no value read off a screenshot, no layer redrawn in
  HTML, no font swapped for a similar one, no look or menu made up, no change
  to Wave to fit the file.
- **The designer fixes Figma.** When the file is not ready, write the
  **Figma readiness report** (below), publish it in Post-it, give the engineer
  its link to send to the designer, and stop at "waiting for the designer".
  You may offer to edit the Figma file yourself, but only by asking twice:
  first "Wave could make these corrections in the Figma file itself. That
  changes the designer''s file. Do you want me to edit it?", and only after a
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
`[{name, result}]`, one for each screen''s behaviour check).
Publish it as the article **Figma readiness report** in the project (design
system) or the feature (screens), replacing the last one, and give the link.

## The progress page

Keep the article **Wave Figma progress** in the project folder up to date
after every step: each stage and step with done, waiting (on whom, for what)
or to do; the open questions; the links (readiness report, design-system page,
review, prototype). Any session starts by reading it and carries on from
there; tell the engineer where things stand in one line.
');
  perform pg_temp.put_skill(v_engineering, v_space, 'Wave Figma Brief', 'wave-figma-brief', '---
name: Wave Figma Brief
description: Stage 1 of the Figma flow. Writes the project''s DESIGN.md in Post-it from a Figma file, asking the engineer only what Figma cannot say. Load it from Wave Figma.
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

Show DESIGN.md in full and ask: "Save this as the project''s DESIGN.md?" On a
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
  any page that does not match Figma''s own render, any font Wave cannot serve,
  any control that does nothing in the prototype because the look it changes
  to is not drawn (a chosen state, a select''s open menu).
  Never work around one: no value read off a screenshot, no layer redrawn in
  HTML, no font swapped for a similar one, no look or menu made up, no change
  to Wave to fit the file.
- **The designer fixes Figma.** When the file is not ready, write the
  **Figma readiness report** (below), publish it in Post-it, give the engineer
  its link to send to the designer, and stop at "waiting for the designer".
  You may offer to edit the Figma file yourself, but only by asking twice:
  first "Wave could make these corrections in the Figma file itself. That
  changes the designer''s file. Do you want me to edit it?", and only after a
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
`[{name, result}]`, one for each screen''s behaviour check).
Publish it as the article **Figma readiness report** in the project (design
system) or the feature (screens), replacing the last one, and give the link.

## The progress page

Keep the article **Wave Figma progress** in the project folder up to date
after every step: each stage and step with done, waiting (on whom, for what)
or to do; the open questions; the links (readiness report, design-system page,
review, prototype). Any session starts by reading it and carries on from
there; tell the engineer where things stand in one line.
');
  perform pg_temp.put_skill(v_engineering, v_space, 'Wave Figma Design System', 'wave-figma-design-system', '---
name: Wave Figma Design System
description: Stage 2 of the Figma flow. Checks the Figma design-system page, refuses it with a readiness report for the designer if Wave cannot convert it exactly, otherwise builds the tokens and one specimen per component in Post-it, gets the designer''s approval there, and writes the design-system page. Load it from Wave Figma.
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
   `script EXPORT_SVG --ids <its vectors>`, Figma''s `get_design_context` and
   `get_screenshot`.
2. `wave-figma convert --gate gate.json --component component.json --type <element type>
   --code code.tsx --width <w> --height <h> --tokens tokens.json --bindings bindings.txt
   --effects effects.json --svgs svgs.json --fonts fonts.css -o specimen.html`.
   The element type is Wave''s (button, textInput, checkbox, radio, select,
   navigation, icon, text...). Ask the engineer only when two fit ("Is Option
   card a checkbox or a radio?").
3. `wave-figma align`, then `wave-figma fidelity --component component.json`
   against the screenshot. Record every result for the report.
4. Where Figma drew a picture of a control, an upgrade plan makes the real
   element (`wave-figma upgrade --plan`); the look lock must be clean.
5. `wave-figma ids` (with `--from <published specimen>` when there is one),
   then `wave-figma preflight`, then Post-it''s `preflight_html` (target = the
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

## 5. The designer''s answer

When the engineer comes back:

1. `list_comments` on the specimens. A comment about the conversion (a page
   that differs from Figma): fix it in Wave''s output only if the fix keeps the
   page exactly as Figma draws it, publish the new version and
   `mark_addressed`. A comment that needs a change in Figma: it goes in the
   readiness report for the designer, as in 1.3.
2. `read_page` each specimen: when its review is **approved** (by the
   designer, in Post-it), set its definition''s `"status": "approved"` and publish
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
  any page that does not match Figma''s own render, any font Wave cannot serve,
  any control that does nothing in the prototype because the look it changes
  to is not drawn (a chosen state, a select''s open menu).
  Never work around one: no value read off a screenshot, no layer redrawn in
  HTML, no font swapped for a similar one, no look or menu made up, no change
  to Wave to fit the file.
- **The designer fixes Figma.** When the file is not ready, write the
  **Figma readiness report** (below), publish it in Post-it, give the engineer
  its link to send to the designer, and stop at "waiting for the designer".
  You may offer to edit the Figma file yourself, but only by asking twice:
  first "Wave could make these corrections in the Figma file itself. That
  changes the designer''s file. Do you want me to edit it?", and only after a
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
`[{name, result}]`, one for each screen''s behaviour check).
Publish it as the article **Figma readiness report** in the project (design
system) or the feature (screens), replacing the last one, and give the link.

## The progress page

Keep the article **Wave Figma progress** in the project folder up to date
after every step: each stage and step with done, waiting (on whom, for what)
or to do; the open questions; the links (readiness report, design-system page,
review, prototype). Any session starts by reading it and carries on from
there; tell the engineer where things stand in one line.
');
  perform pg_temp.put_skill(v_engineering, v_space, 'Wave Figma Feature', 'wave-figma-feature', '---
name: Wave Figma Feature
description: Stage 3 of the Figma flow. Checks a feature''s Figma screens, refuses them with a readiness report if Wave cannot convert them exactly, otherwise converts them against the approved catalogue, interviews the engineer for FEATURE.md, runs the dry run, publishes the feature to Post-it for the designer''s review and makes the prototype. Load it from Wave Figma.
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
   --title "<the frame''s name>" -o screen.html`.
   A screen is called what its frame is called, and its slug is that name''s
   (About you, `about-you`): never propose or change a screen''s name; the
   gate refuses a frame that is not named as a screen.
3. `align`, `fidelity` (record every result), `upgrade --plan` (look lock
   clean), `ids --screen <slug>` (`--from` the published screen when there
   is one, which keeps every test id), `preflight`. `ids` gives the test ids
   (`<screen>.<section>.<DS id>.<label>`); a duplicate it reports is the
   design''s to name apart, in Figma.
4. `wave-figma behaviour --page screen.html --specimens <published specimens> -o behaviour.json`:
   it plays the screen with the prototype and clicks every control. A choice
   has to show being chosen, a select has to open the menu its Open variant
   draws, a button has to go where it goes. Record every result for the report.
5. The plan says what Figma cannot draw, in the design''s own words: a heading
   is `h1`, a form is `form`, a group of chips is a `radiogroup` with its
   field, a decorative icon is `aria-hidden`; `data-wave-role` where Wave
   would guess wrong. Ask the engineer only where the design does not decide.

A screen that does not match Figma, or a control that does nothing in the
behaviour check, makes the feature **not ready**: readiness report with the
fidelity and behaviour results, stop. Never change the page to make a control
pass; what is missing is drawn in Figma. A control that does nothing because
of FEATURE.md (an action with nowhere to go) is the engineer''s to answer in the
interview below; run the check again after.

## 3. Interview the engineer for FEATURE.md

`wave_get_brief` (kind feature) gives the template. Figma already says the
screens, the components, where each button goes (prototype links) and each
field''s error message (the Error variant''s text). Draft FEATURE.md from that,
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

1. Preflight every screen with Post-it''s `preflight_html` (target = the feature),
   and run the behaviour check again on the files you will send: both pass.
2. Show the engineer the screens and the report (fidelity per screen, every
   waiver) and ask: "Publish these for the designer''s review?"
3. On a yes: `wave-figma bundle --screen "<frame name>=<file>,..." -o screens.json`,
   `wave_upload_link`, then `wave-figma send --link <link> --tool wave_publish_flow
   --args ''{"feature_id":"<id>"}'' --json-file screens=screens.json`.
4. Make the prototype (the prototype section of Wave Review, `skills/designer/wave-review`): without an
   API, actions simulate loading and the viewer picks success or failure.
5. **The end-to-end tests.** Publishing wrote the feature''s Gherkin
   (`tests/flow-feature`, the happy path by test id). If it says it is not
   complete, the gaps are FEATURE.md samples: ask the engineer, save, and it
   is written again. Then run them with the Wave Test skill
   (`skills/engineering/wave-test`) against the prototype. A failure that
   needs Figma goes in the readiness report; the feature is not ready.
6. `ask_for_review` on each screen and on `tests/flow-feature` (the designer
   reads the scenario next to the prototype). Give the engineer the review
   links, the prototype link and the E2E report for the designer. Record
   "waiting for the designer". The feature can be approved only with the
   Gherkin approved and a passing run on the versions being approved.

## 5. The designer''s answer

As in stage 2: comments about the conversion are fixed in Wave''s output only
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
  any page that does not match Figma''s own render, any font Wave cannot serve,
  any control that does nothing in the prototype because the look it changes
  to is not drawn (a chosen state, a select''s open menu).
  Never work around one: no value read off a screenshot, no layer redrawn in
  HTML, no font swapped for a similar one, no look or menu made up, no change
  to Wave to fit the file.
- **The designer fixes Figma.** When the file is not ready, write the
  **Figma readiness report** (below), publish it in Post-it, give the engineer
  its link to send to the designer, and stop at "waiting for the designer".
  You may offer to edit the Figma file yourself, but only by asking twice:
  first "Wave could make these corrections in the Figma file itself. That
  changes the designer''s file. Do you want me to edit it?", and only after a
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
`[{name, result}]`, one for each screen''s behaviour check).
Publish it as the article **Figma readiness report** in the project (design
system) or the feature (screens), replacing the last one, and give the link.

## The progress page

Keep the article **Wave Figma progress** in the project folder up to date
after every step: each stage and step with done, waiting (on whom, for what)
or to do; the open questions; the links (readiness report, design-system page,
review, prototype). Any session starts by reading it and carries on from
there; tell the engineer where things stand in one line.
');
  perform pg_temp.put_skill(v_engineering, v_space, 'Wave Build', 'wave-build', '---
name: Wave Build
description: Build an approved flow of Wave mockups from its handover in Post-it. Use when asked to implement screens that were designed and approved with Wave.
---

# Wave Build

An approved Wave flow is a complete, frozen spec: HTML screens whose
`data-wave-*` attributes say what every element is, says and does, the
project''s DTCG tokens, the catalogue specimens of every component used, the
assets, the answer sheet, and the decisions made in review.

1. Call `get_handover` with the flow''s id. If it refuses, it lists what is
   blocking approval: stop and report that, do not build from unapproved
   screens.
2. Read HANDOVER.md from the answer end to end: routes, the flow graph, the data
   dictionary, the action catalog with side effects and destinations, component
   states, and the review decisions and accepted gaps.
3. Build components first, from `components/*.html` (the catalogue
   specimens): one code component per specimen, with every variant and state
   drawn there. Map tokens by name (`var(--color-brand-500)` is
   `color.brand.500`), never by value.
4. Fetch each screen with `get_handover_screen` as you build it. Every element
   with `data-wave-component` is an instance of a catalogue component.
5. Bind every `data-wave-bind` to the resource named, render `data-wave-empty`
   when it is empty, apply `data-wave-format` and `data-wave-overflow`. Build
   every state listed in `data-wave-states`, using the depicted states
   (`data-wave-state-of`) as the design for each.
6. Wire each `data-wave-action` with its `data-wave-effect`s, navigate to
   `data-wave-to` on success and `data-wave-to-failure` on failure, honour
   `data-wave-confirm`, `data-wave-disabled-if`, `data-wave-visible-if`,
   `data-wave-access` and `data-wave-flag`.
7. Copy the files in `assets/` into the codebase (the manifest maps each
   hosted address to its file).
8. `api/openapi.json` (and `api/mocks/`, `api/data-requirements.md`) is
   the mock API the prototype ran on: the contract the screens were designed
   against. Build the data layer to it (`x-wave-provides` names the data
   root a GET returns; `x-wave-effect` names the action that calls an
   operation), and serve its examples with MSW in development and tests until
   the real API exists. Where the real API differs, say so.
9. Where the handover lists an accepted gap or a waived field, follow its note;
   where something is neither specified nor waived, ask rather than guess.
10. **Test ids.** Put each element''s `data-testid` from the screen on the
    element that builds it, exactly (`tests/<screen>-components.json` lists
    them as a tree): the screen''s root, each section, each component. The
    feature''s end-to-end tests (`tests/flow.feature`) find elements by it,
    on the prototype and on the app alike. Never rename one.
11. **Before you call it done**, with the Wave Test skill
    (`skills/engineering/wave-test`): the handover check (`wave-test ids
    --target <the app''s address>`, every test id on its screen) and the
    feature''s Gherkin against the app (`wave-test run --target <address>`).
    Get the command line with `curl -sSfo wave-test.mjs <post-it>/wave/wave-test.mjs`, where `<post-it>` is the Post-it connector''s address without `/api/mcp`.
    Both pass, or say what is missing; never change a test id or a step to
    pass.
12. **CI.** The same run in the app''s pipeline: `node wave-test.mjs run
    --feature <feature id> --target <address>` with `POSTIT_MCP_URL` (the
    connector''s address) and `POSTIT_TOKEN` (an MCP token pinned to the
    feature''s space, from Post-it''s settings, kept as a CI secret).
');
  perform pg_temp.put_skill(v_engineering, v_space, 'Wave Test', 'wave-test', '---
name: Wave Test
description: Run a feature''s end-to-end tests (its Gherkin, tests/flow-feature) against its prototype or the built app, publish the E2E report in Post-it, and explain each failure. A feature is approved only after a run against its prototype passes on the versions being approved. Use when someone asks to test a feature, its prototype or the app, or before asking a designer to approve a feature.
---

# Wave Test

A feature''s Gherkin names every element by its test id
(`<screen>.<section>.<DS id>.<label>`, the `data-testid` on the element), so
the same scenarios run the prototype and the built app. Wave writes the happy
path when the feature is published; people may add scenarios after its marker
line. Nobody writes test code: the Gherkin runs on Wave''s step library.

## Rules

- **Nobody runs a command but you.** You run `wave-test` and Post-it''s tools,
  read the JSON they print, and explain the result in plain words.
- **Never make a test pass by changing what it tests.** Do not edit a screen,
  a step, FEATURE.md or a test id to get green. A failure is a finding: say
  what it is and whose it is.
- **If anything cannot be reached** (Post-it, the app, the command line), stop and
  say exactly what failed. Never take another route.
- **Keep it safe.** The upload link from `wave_upload_link` goes only into
  `wave-test --link`, never into a file, a page or a message.

## 1. What to run

Ask which feature (propose it from Post-it''s tree) and against what: its
**prototype** (the default; what approval waits for) or the **app** at an
address (a built app, a staging deploy). Read `tests/flow-feature` in the
feature: if Wave says the Gherkin is not complete, it lists the gaps (a field
without a sample): those are answered in FEATURE.md (`wave_save_brief`, which
writes the Gherkin again), with the engineer, before running.

## 2. Run it

1. Get the command line once: `curl -sSfo wave-test.mjs <post-it>/wave/wave-test.mjs`, where `<post-it>` is the Post-it connector''s address without `/api/mcp`.
   It needs Node 20+ and Playwright with Chromium (`npx playwright install
   chromium` if it is missing; ask before installing).
2. `wave_upload_link` for the feature''s space.
3. `node wave-test.mjs run --link <link> --feature <feature id> --target prototype
   --record --screenshots e2e/ --report e2e/report.md`. For the app, `--target
   <address>` (each screen opens at its FEATURE.md route).

`--record` publishes the report as `tests/e2e-report` (`tests/e2e-report-app`
for the app) and records the run with the versions it played. A run reported
after the feature changed is refused: run again.

## 3. Read the result

The JSON lists each failed step with its line, test id and error, and the
screenshot. For each, say what happened and whose it is:

| What failed | Whose | What to do |
| --- | --- | --- |
| No element with a test id on the screen | The design, or the build | Prototype: the screen changed since the Gherkin was written; publish again so Wave writes it again. App: the build is missing the `data-testid` from the handover |
| A choice does not show as chosen, a select does not open | Figma (a look not drawn) or the build | Prototype: the readiness report for the designer. App: the build |
| Stays on a screen instead of moving on | FEATURE.md (an answer it refuses) or the action | Check the sample and the field''s rules; check the action''s destination |
| Not one of Wave''s steps | The person who added the scenario | Rewrite it with Wave''s steps (`wave-test steps` lists them) |

Give the report''s link. When the prototype run passes, say the feature can go
to the designer for approval (the Gherkin is approved with the screens).

## Steps

| Step | Does |
| --- | --- |
| `Given I open the "<screen>" screen` | Prototype: plays that screen. App: opens its route |
| `When I click "<test id>"` | Clicks it |
| `When I fill "<test id>" with "<text>"` | Types into the field inside it |
| `When I choose "<test id>"` | Picks a chip, radio, checkbox, card or segment |
| `When I pick "<option>" in "<test id>"` | Opens a select and picks the option |
| `Then I am on the "<screen>" screen` | The screen''s root is on the page |
| `Then "<test id>" shows "<text>"` | Its text contains the words |
| `Then "<test id>" is chosen` | A choice is selected |
| `Then "<test id>" is visible` / `is hidden` | |
');
  perform pg_temp.put_skill(v_gates, v_space, 'Wave Figma Gate', 'wave-figma-gate', '---
name: Wave Figma Gate
description: Runs Wave''s Figma entry gate on a Figma file, read-only, for a project in Post-it, and lists what to fix in Figma (blocking) and what is optional (advice), with a link to each layer. For the designer, from a chat with the Figma and Post-it connectors and no command line. Use when someone says "run the gate", "check my Figma file for Wave" or "is <project> ready for Wave".
---

# Wave Figma Gate

Wave takes a Figma file only when it passes the entry gate: the gate reads the
file and lists what Wave cannot take exactly as drawn. **Blocking** findings
are fixed in Figma; **advice** is optional. This skill lets the designer run
the gate as often as they like while fixing the file. It is a self-check: when
it passes, the engineer runs the official gate (Wave Figma) on that version.

## Rules

- **Read only.** Never change the Figma file and never offer to; the designer
  fixes it in Figma.
- **The script as published.** Run the gate script below exactly, changing
  only its three placeholders. Never edit, shorten, rewrite or re-create it.
- **The gate is the gate.** Report every finding as the gate gives it. Never
  call a blocking finding fine, and never suggest changing Wave to fit the file.
- **If anything cannot be reached** (the Figma connector, the file, a page,
  Post-it) or a script throws, stop and say exactly what failed. Never take
  another route to the same result.
- Load the Figma connector''s `figma-use` skill before the first
  `use_figma`, as that connector requires.

## What you need from the designer

1. The **project** name in Post-it (for example "keel").
2. The **Figma links**: the design-system page and the screens page (each
   link with its `node-id`). A frame link works too: the gate checks that
   frame. Several screen pages or frames are fine.

Ask only for what is missing. If the project has a **Wave Figma progress**
article that lists the links, propose those.

## 1. Find the project

   - Find it with `list_spaces` and `list_tree` (projects are marked), by the name given.
   - Do not create anything. If there is no such project, say so and stop.
   - Read the project''s **Figma entry gate** article if it exists: it is the
     last official result, to compare with.

## 2. Locate the nodes

Take the file key from the links (`figma.com/design/<file key>/...`) and each
`node-id` (`28-129` in a link is the node `28:129`). All links must be the
same file. Run this with `use_figma`, with `{{IDS}}` replaced by the ids as
a JSON array, for example `["28:129","1:86"]`:

```js
const ids = {{IDS}};
const out = [];
for (const id of ids) {
  const n = await figma.getNodeByIdAsync(id);
  if (!n) { out.push({ id, missing: true }); continue; }
  let p = n; while (p && p.type !== "PAGE") p = p.parent;
  out.push({ id, type: n.type, name: n.name, page: p ? p.id : null, pageName: p ? p.name : null });
}
return { file: figma.fileKey || null, nodes: out };
```

A node that is `missing` means a wrong link or no access: stop and say so.
The **design-system page** is the `page` of the design-system link.

## 3. Run the gate

Replace exactly these three placeholders, and nothing else:

- `{{IDS}}`: the ids from the links, as a JSON array, design system first.
- `{{PAGE}}`: the design-system page id from step 2.
- `{{PART}}`: `0`.

Run it with `use_figma` on the file key, description "Wave entry gate
(read-only)". It returns `checksum`, `length`, `parts`, `part` and
`data`. When `parts` is more than 1, run it again with `{{PART}}` as 1, 2
and so on, and join the `data` pieces in order: together they are one JSON
report of `length` characters.

```js

const checksum = (s) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h; };
const ids = {{IDS}};
const ds = "{{PAGE}}" || null;
const pageOf = (n) => { let x = n; while (x && x.type !== "PAGE") x = x.parent; return x ? x.id : null; };
const roots = [];
for (const id of ids) {
  const n = await figma.getNodeByIdAsync(id);
  if (!n) throw new Error("No node " + id);
  const p = n.type === "PAGE" ? n : await figma.getNodeByIdAsync(pageOf(n));
  await p.loadAsync();
  roots.push(n);
}
const vars = {}, defaultModes = {};
for (const c of await figma.variables.getLocalVariableCollectionsAsync()) defaultModes[c.id] = c.defaultModeId;
for (const v of await figma.variables.getLocalVariablesAsync()) vars[v.id] = { name: v.name, type: v.resolvedType, scopes: v.scopes, collection: v.variableCollectionId, values: v.valuesByMode };
const textStyles = (await figma.getLocalTextStylesAsync()).length;
const mains = {}, componentNames = [];
const bindings = (n) => { const b = n.boundVariables || {}; const ids = (x) => !x || typeof x !== "object" ? [] : Array.isArray(x) ? x.map(ids) : typeof x.id === "string" ? x.id : Object.keys(x).sort().map((k) => [k, ids(x[k])]); return JSON.stringify(Object.keys(b).filter((k) => k !== "componentProperties").sort().map((k) => [k, ids(b[k])])); };
for (const r of roots) {
  for (const i of r.findAllWithCriteria({ types: ["INSTANCE"] })) {
    const m = await i.getMainComponentAsync();
    if (!m) continue;
    const set = m.parent && m.parent.type === "COMPONENT_SET" ? m.parent : null;
    const hug = (axis) => m.layoutMode && m.layoutMode !== "NONE" && ((m.layoutMode === "HORIZONTAL") === (axis === "w") ? m.primaryAxisSizingMode : m.counterAxisSizingMode) === "AUTO";
    const bools = {};
    for (const [k, d] of Object.entries((set || m).componentPropertyDefinitions || {})) if (d.type === "BOOLEAN") bools[k] = d.defaultValue;
    const defs = (set || m).componentPropertyDefinitions || {};
    const stateKey = Object.keys(defs).find((k) => /^state$/i.test(k) && defs[k].type === "VARIANT");
    const propertyBindings = [];
    for (const o of i.overrides || []) {
      if ((o.overriddenFields || []).indexOf("boundVariables") < 0) continue;
      const own = o.id === i.id ? i : await figma.getNodeByIdAsync(o.id);
      const its = o.id === i.id ? m : await figma.getNodeByIdAsync(o.id.split(";").pop());
      if (own && its && bindings(own) === bindings(its)) propertyBindings.push(o.id);
    }
    mains[i.id] = { name: (set || m).name, remote: !!m.remote, page: m.remote ? null : pageOf(m), width: m.width, height: m.height, hugW: !!hug("w"), hugH: !!hug("h"), bools, states: stateKey ? defs[stateKey].variantOptions || [] : [], propertyBindings };
  }
  for (const c of r.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
    if (c.type === "COMPONENT" && c.parent && c.parent.type === "COMPONENT_SET") continue;
    componentNames.push(c.name);
  }
}
const inspect = function inspectNodes(roots, facts) {
  const hits = [];
  const fonts = [];
  const covers = [];
  const areas = {};
  let top = "";
  const hit = (rule, n, detail) => hits.push({ rule, node: n.id, name: n.name, detail: detail || "", in: top });
  const vars = facts.vars;
  const all = Object.keys(vars).map((k) => vars[k]);
  const has = (type, scope) => all.some((v) => v.type === type && (v.scopes.indexOf(scope) >= 0 || v.scopes.indexOf("ALL_SCOPES") >= 0));
  const colorVars = all.some((v) => v.type === "COLOR");
  const scoped = { size: has("FLOAT", "WIDTH_HEIGHT"), gap: has("FLOAT", "GAP"), radius: has("FLOAT", "CORNER_RADIUS"), stroke: has("FLOAT", "STROKE_FLOAT"), opacity: has("FLOAT", "OPACITY"), effect: has("FLOAT", "EFFECT_FLOAT"), fontSize: has("FLOAT", "FONT_SIZE") };
  const names = facts.componentNames.map((s) => s.toLowerCase());
  const GRAPHIC = ["VECTOR", "BOOLEAN_OPERATION", "ELLIPSE", "RECTANGLE", "LINE", "STAR", "POLYGON"];
  const STYLE_FIELDS = ["fills", "strokes", "strokeWeight", "strokeAlign", "effects", "cornerRadius", "topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius", "opacity", "fontSize", "fontName", "lineHeight", "letterSpacing", "textCase", "textDecoration", "textStyleId", "fillStyleId", "strokeStyleId", "effectStyleId", "itemSpacing", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom", "layoutMode", "boundVariables"];
  const DEFAULT_NAME = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Component|Instance|Auto layout|Section)( \d+)?$/;
  const mixed = (v) => typeof v === "symbol";
  const hex = (c) => "#" + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  const frac = (x) => typeof x === "number" && Math.abs(x - Math.round(x)) > 0.01;
  const resolve = (id, n, depth) => {
    const v = vars[id];
    if (!v || depth > 8) return null;
    const modes = n && n.resolvedVariableModes || {};
    const mode = modes[v.collection] || facts.defaultModes[v.collection];
    const val = mode in v.values ? v.values[mode] : v.values[Object.keys(v.values)[0]];
    return val && val.type === "VARIABLE_ALIAS" ? resolve(val.id, n, depth + 1) : val;
  };
  const paints = (n, key) => {
    const list = n[key];
    if (mixed(list) || !Array.isArray(list)) return;
    for (const p of list) {
      if (p.visible === false || p.opacity === 0) continue;
      if (p.type !== "SOLID") {
        if (/^GRADIENT/.test(p.type)) hit("color.gradient", n, key);
        continue;
      };
      const b = p.boundVariables && p.boundVariables.color;
      if (!b) {
        if (colorVars) hit("color.unbound", n, `${key === "fills" ? "fill" : "stroke"} ${hex(p.color)}${p.opacity !== void 0 && p.opacity < 1 ? ` at ${Math.round(p.opacity * 100)}%` : ""}`);
        continue;
      };
      if (!vars[b.id]) {
        hit("variable.remote", n, `${key === "fills" ? "fill" : "stroke"} ${hex(p.color)}`);
        continue;
      };
      const val = resolve(b.id, n, 0);
      if (val && typeof val === "object" && "r" in val) {
        const off = Math.max(Math.abs(val.r - p.color.r), Math.abs(val.g - p.color.g), Math.abs(val.b - p.color.b), Math.abs((val.a === void 0 ? 1 : val.a) - (p.opacity === void 0 ? 1 : p.opacity)));
        if (off > 1.5 / 255) hit("color.stale", n, `${key === "fills" ? "fill" : "stroke"} draws ${hex(p.color)}, its variable ${vars[b.id].name} is ${hex(val)}`);
      }
    }
  };
  const number = (n, key, on, rule, label, idle) => {
    if (!on) return;
    const v = n[key];
    if (typeof v !== "number" || v === idle) return;
    const b = n.boundVariables && n.boundVariables[key];
    if (!b) hit(rule, n, `${label} ${+v.toFixed(2)}`);
    else if (!vars[b.id]) hit("variable.remote", n, label);
  };
  const CORNERS = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
  const SIDES = ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"];
  const perSide = (n, keys, whole, on, rule, label) => {
    if (!on) return;
    const b = n.boundVariables || {};
    const loose = [];
    for (const k of keys) {
      const v = mixed(n[whole]) || n[whole] === void 0 ? n[k] : n[whole];
      if (typeof v !== "number" || v === 0) continue;
      const bk = b[k] || b[whole];
      if (!bk) loose.push(String(+v.toFixed(2)));
      else if (!vars[bk.id]) hit("variable.remote", n, label);
    };
    if (loose.length) hit(rule, n, `${label} ${[...new Set(loose)].join("/")}`);
  };
  const find = (n, id) => {
    if (n.id === id) return n;
    for (const c of n.children || []) {
      const f = find(c, id);
      if (f) return f;
    };
    return null;
  };
  const boundPaints = (n) => !!n && ["fills", "strokes"].every((k) => !Array.isArray(n[k]) || n[k].every((p) => p.visible === false || p.type !== "SOLID" || p.boundVariables && p.boundVariables.color));
  const effects = (n) => {
    const list = n.effects;
    if (!Array.isArray(list) || !list.some((e) => e.visible !== false)) return;
    if (typeof n.effectStyleId === "string" && n.effectStyleId) return;
    for (const e of list) {
      if (e.visible === false) continue;
      const b = e.boundVariables || {};
      const loose = [];
      if (e.color && colorVars && !b.color) loose.push(`color ${hex(e.color)}`);
      if (scoped.effect) for (const k of ["radius", "spread", "offsetX", "offsetY"]) {
        const v = k === "offsetX" ? e.offset && e.offset.x : k === "offsetY" ? e.offset && e.offset.y : e[k];
        if (typeof v === "number" && v !== 0 && !b[k]) loose.push(`${k} ${v}`);
      };
      if (loose.length) hit("effect.unbound", n, `${e.type.toLowerCase().replace("_", " ")}: ${loose.join(", ")}`);
    }
  };
  const absolute = (n, parent) => {
    if (!parent || !parent.layoutMode || parent.layoutMode === "NONE" || n.layoutPositioning !== "ABSOLUTE") return;
    if (Math.abs(n.x) > 0.01 || Math.abs(n.y) > 0.01) hit("layout.absolute", n, `at ${+n.x.toFixed(2)}, ${+n.y.toFixed(2)}`);
  };
  const fixedSize = (n, parent, where) => {
    if (!scoped.size || !parent && where === "screen" || n.type === "COMPONENT_SET") return;
    const b = n.boundVariables || {};
    const loose = [];
    const text = n.type === "TEXT";
    for (const [axis, sizing, size] of [["width", n.layoutSizingHorizontal, n.width], ["height", n.layoutSizingVertical, n.height]]) {
      if (sizing === "HUG" || sizing === "FILL" || !(size > 0)) continue;
      if (text && (n.textAutoResize === "WIDTH_AND_HEIGHT" || axis === "height" && n.textAutoResize === "HEIGHT")) continue;
      if (b[axis]) continue;
      loose.push(`${axis} ${+size.toFixed(2)}`);
    };
    if (loose.length) hit(text ? "text.fixed" : "size.fixed", n, loose.join(", "));
  };
  const shownByVariant = (n) => {
    const path = [];
    let v = n;
    while (v && !(v.type === "COMPONENT" && v.parent && v.parent.type === "COMPONENT_SET")) {
      path.unshift(v.name);
      v = v.parent;
    };
    if (!v) return false;
    return (v.parent.children || []).some((other) => {
      if (other === v) return false;
      let at = other;
      for (const name of path) {
        at = (at.children || []).find((c) => c.name === name);
        if (!at) return false;
      };
      return at.visible !== false;
    });
  };
  const ON = /^(selected|checked|on|active|current)$/i;
  const OFF = /^(default|unchecked|unselected|off|inactive)$/i;
  const SELECT = /(^|[^a-z])(select|dropdown|drop-down|combo ?box|picker)([^a-z]|$)/i;
  const CHOICE = /(^|[^a-z])(radio|checkbox|check box|chip|segment item|toggle|switch|tab|option|option card|menu item)([^a-z]|$)/i;
  const CONTAINER = /(^|[^a-z])(group|bar|list|control|menu|tabs)$/i;
  const MENU = /^(menu|listbox|options)$/i;
  const ROW = /(^|[^a-z])(option|item)([^a-z]|$)/i;
  const isSelect = (name) => SELECT.test(name) && !ROW.test(name);
  const stateOptions = (n) => {
    const defs = n.componentPropertyDefinitions || {};
    const key = Object.keys(defs).find((k) => /^state$/i.test(k) && defs[k].type === "VARIANT") || null;
    return { key, options: key ? (defs[key].variantOptions || []).map(String) : [] };
  };
  const findMenu = (n) => {
    for (const c of n.children || []) {
      if (c.visible === false) continue;
      if (MENU.test(String(c.name).trim())) return c;
      if (c.type !== "INSTANCE") {
        const f = findMenu(c);
        if (f) return f;
      }
    };
    return null;
  };
  const playable = (n) => {
    const name = String(n.name);
    const { key, options } = stateOptions(n);
    if (CHOICE.test(name) && !CONTAINER.test(name) && !isSelect(name)) {
      const on = options.filter((o) => ON.test(o));
      const off = options.filter((o) => OFF.test(o));
      if (!on.length || !off.length) hit("choice.state", n, `${name}: State is ${options.length ? options.join(", ") : "missing"}; needs one chosen (Selected, Checked or On) and one not chosen (Default, Unchecked or Off)`);
    };
    if (!isSelect(name)) return;
    const open = options.find((o) => /^(open|expanded)$/i.test(o));
    if (!open) {
      hit("select.open", n, `${name}: State is ${options.length ? options.join(", ") : "missing"}`);
      return;
    };
    const variant = (n.children || []).find((v) => v.variantProperties && v.variantProperties[key] === open);
    const menu = variant ? findMenu(variant) : null;
    if (!menu) {
      hit("select.menu", variant || n, `${name}: its ${open} variant has no layer named Menu`);
      return;
    };
    const rows = (menu.children || []).filter((c) => c.visible !== false);
    const bad = rows.filter((c) => {
      const m = c.type === "INSTANCE" ? facts.mains[c.id] : null;
      const st = m && m.states || [];
      return !m || !st.some((s) => ON.test(s)) || !st.some((s) => OFF.test(s));
    });
    if (rows.length < 2 || bad.length) hit("select.menu", menu, `${name}: Menu has ${rows.length} row${rows.length === 1 ? "" : "s"}${bad.length ? `, ${bad.length} not an instance of an option component with Selected and Default states` : ""}`);
  };
  const visit = (n, where, parent, owners) => {
    const t = n.type;
    if (t === "SECTION") {
      for (const c of n.children || []) visit(c, where, null, owners);
      return;
    };
    if (n.visible === false) {
      if (!(n.componentPropertyReferences && n.componentPropertyReferences.visible) && !shownByVariant(n)) hit("layer.hidden", n);
      return;
    };
    if (t === "INSTANCE") {
      const m = facts.mains[n.id];
      if (m && m.remote) hit("instance.remote", n, m.name);
      else if (m && facts.dsPage && m.page && m.page !== facts.dsPage) hit("instance.outside", n, m.name);
      const styled = [];
      let recolor = true;
      for (const o of n.overrides || []) for (const f of o.overriddenFields || []) {
        if (STYLE_FIELDS.indexOf(f) < 0) continue;
        if (f === "boundVariables" && m && m.propertyBindings && m.propertyBindings.indexOf(o.id) >= 0) continue;
        if (styled.indexOf(f) < 0) styled.push(f);
        if (!((f === "fills" || f === "strokes") && boundPaints(find(n, o.id)))) recolor = false;
      };
      if (styled.length) hit(recolor ? "instance.recolor" : "instance.override", n, `${m ? m.name : "instance"}: ${styled.join(", ")}`);
      if (where === "screen" && m && /button|link|cta/i.test(m.name) && !(n.reactions && n.reactions.length)) hit("proto.unlinked", n, m.name);
      if (where === "screen" && m && m.states) {
        if (isSelect(m.name) && !m.states.some((o) => /^(open|expanded)$/i.test(o))) hit("select.open", n, `${m.name}: State is ${m.states.join(", ") || "missing"}`);
        else if (CHOICE.test(m.name) && !CONTAINER.test(m.name) && !isSelect(m.name) && !(m.states.some((o) => ON.test(o)) && m.states.some((o) => OFF.test(o)))) hit("choice.state", n, `${m.name}: State is ${m.states.join(", ") || "missing"}`);
      };
      if (m && m.bools) {
        const off = [];
        for (const k of Object.keys(m.bools)) {
          const p = n.componentProperties && n.componentProperties[k];
          if (p && p.value !== m.bools[k]) off.push(`${k.replace(/#.*$/, "")} ${p.value ? "on" : "off"}`);
        };
        if (off.length) hit("instance.boolean", n, `${m.name}: ${off.join(", ")}`);
      };
      if (m && m.width !== void 0) {
        const off = [];
        for (const [axis, hug, size, own2, sizing] of [["width", m.hugW, m.width, n.width, n.layoutSizingHorizontal], ["height", m.hugH, m.height, n.height, n.layoutSizingVertical]]) {
          if (sizing === "FILL") off.push(`${axis} fills its parent`);
          else if (hug && sizing === "FIXED") off.push(`${axis} fixed at ${+own2.toFixed(2)}, component hugs`);
          else if (!hug && Math.abs(own2 - size) > 0.5) off.push(`${axis} ${+own2.toFixed(2)}, component ${+size.toFixed(2)}`);
        };
        if (off.length) hit("instance.resized", n, `${m.name}: ${off.join("; ")}`);
      };
      absolute(n, parent);
      return;
    };
    const own = String(n.name).toLowerCase();
    if (t === "FRAME" && names.indexOf(own) >= 0 && owners.indexOf(own) < 0) hit("instance.detached", n, n.name);
    if ((t === "COMPONENT_SET" || t === "COMPONENT" && (!parent || parent.type !== "COMPONENT_SET")) && !String(n.description || "").trim()) hit("component.description", n);
    if (t === "COMPONENT_SET" || t === "COMPONENT" && (!parent || parent.type !== "COMPONENT_SET")) playable(n);
    if (t !== "TEXT" && t !== "COMPONENT_SET" && DEFAULT_NAME.test(n.name) && !(parent && parent.type === "COMPONENT_SET")) hit("layer.name", n);
    if (t !== "COMPONENT_SET") {
      paints(n, "fills");
      paints(n, "strokes");
      const stroked = Array.isArray(n.strokes) && n.strokes.some((p) => p.visible !== false);
      if (stroked) perSide(n, SIDES, "strokeWeight", scoped.stroke, "stroke.unbound", "stroke width");
      if (t !== "TEXT" && GRAPHIC.indexOf(t) < 0 || t === "RECTANGLE") perSide(n, CORNERS, "cornerRadius", scoped.radius, "radius.unbound", "radius");
      number(n, "opacity", scoped.opacity, "opacity.unbound", "opacity", 1);
      effects(n);
      if (stroked && n.strokeAlign === "INSIDE" && Array.isArray(n.effects) && n.effects.some((e) => e.visible !== false && e.type === "INNER_SHADOW")) hit("effect.under-stroke", n);
    };
    if (t === "TEXT") {
      const families = typeof n.getRangeAllFontNames === "function" && typeof n.characters === "string" ? n.getRangeAllFontNames(0, n.characters.length).map((f) => f.family) : n.fontName && !mixed(n.fontName) ? [n.fontName.family] : [];
      for (const f of families) if (fonts.indexOf(f) < 0) fonts.push(f);
      if (mixed(n.textStyleId) || mixed(n.fontName) || mixed(n.fontSize)) hit("text.mixed", n);
      else if (facts.textStyles > 0 ? !n.textStyleId : scoped.fontSize && !(n.boundVariables && n.boundVariables.fontSize)) hit("text.style", n, `${n.fontName ? n.fontName.family + " " + n.fontName.style : ""} ${n.fontSize}`.trim());
    };
    if (n.layoutMode && n.layoutMode !== "NONE") {
      number(n, "itemSpacing", scoped.gap, "spacing.unbound", "gap", 0);
      if (n.layoutWrap === "WRAP") number(n, "counterAxisSpacing", scoped.gap, "spacing.unbound", "row gap", 0);
      for (const k of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) number(n, k, scoped.gap, "spacing.unbound", k.replace("padding", "padding ").toLowerCase(), 0);
    };
    const kids = (n.children || []).filter((c) => c.visible !== false);
    const graphic = kids.length > 0 && kids.every((c) => GRAPHIC.indexOf(c.type) >= 0) && kids.some((c) => c.type !== "RECTANGLE" && c.type !== "ELLIPSE");
    const placed = kids.length > 1 || kids.length === 1 && (Math.abs(kids[0].x) > 0.01 || Math.abs(kids[0].y) > 0.01);
    if (!graphic && placed) {
      if ((t === "FRAME" || t === "COMPONENT") && (!n.layoutMode || n.layoutMode === "NONE")) hit("layout.none", n, kids.length > 1 ? `${kids.length} layers placed by hand` : `${kids[0].name} placed by hand at ${+kids[0].x.toFixed(2)}, ${+kids[0].y.toFixed(2)}`);
      if (t === "GROUP") hit("layout.group", n, `${kids.length} layers`);
    };
    absolute(n, parent);
    if (t === "COMPONENT_SET" && (n.children || []).length > 1 && (!n.layoutMode || n.layoutMode === "NONE")) hit("set.layout", n, `${n.children.length} variants placed by hand`);
    fixedSize(n, parent, where);
    if (where === "screen" && t !== "TEXT") {
      const manual = !parent || !parent.layoutMode || parent.layoutMode === "NONE" || n.layoutPositioning === "ABSOLUTE";
      const fixedW = n.layoutSizingHorizontal === void 0 || n.layoutSizingHorizontal === "FIXED";
      const fixedH = n.layoutSizingVertical === void 0 || n.layoutSizingVertical === "FIXED";
      const off = [manual && frac(n.x) ? `x ${+n.x.toFixed(2)}` : "", manual && frac(n.y) ? `y ${+n.y.toFixed(2)}` : "", fixedW && frac(n.width) ? `width ${+n.width.toFixed(2)}` : "", fixedH && frac(n.height) ? `height ${+n.height.toFixed(2)}` : ""].filter(Boolean);
      if (off.length && parent) hit("geometry.subpixel", n, off.join(", "));
    };
    if (graphic) return;
    const inside = t === "COMPONENT_SET" || t === "COMPONENT" ? owners.concat(own) : owners;
    for (const c of n.children || []) visit(c, where, n, inside);
  };
  const components = (n) => n.type === "COMPONENT_SET" || n.type === "COMPONENT" ? [n] : n.type === "INSTANCE" ? [] : [].concat(...(n.children || []).map(components));
  const SCREEN_NAME = /^[\p{L}][\p{L}\p{N}''’&+ -]*$/u;
  const screenSlugs = {};
  const checkScreenName = (n) => {
    const name = String(n.name).trim();
    const words = name.split(/\s+/).filter(Boolean);
    if (!SCREEN_NAME.test(name) || name.length > 40 || words.length > 6 || /\d{3,}$/.test(name)) {
      hit("screen.name", n, `"${name}"`);
      return;
    };
    const slug = name.toLowerCase().replace(/[’'']/g, "").replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
    if (screenSlugs[slug]) hit("screen.name", n, `"${name}" and "${screenSlugs[slug]}" are the same screen name`);
    else screenSlugs[slug] = name;
  };
  for (const r of roots) {
    const ds = !!facts.dsPage && pageOf(r) === facts.dsPage;
    const tops = ds ? components(r) : r.type === "PAGE" || r.type === "SECTION" ? (r.children || []).filter((c) => c.type === "FRAME" || c.type === "SECTION" || c.type === "COMPONENT_SET" || c.type === "COMPONENT") : [r];
    for (const c of tops) {
      if (c.type !== "SECTION") covers.push(c.id);
      else for (const k of c.children || []) covers.push(k.id);
      top = c.name;
      areas[c.name] = c.id;
      if (!ds && c.type === "FRAME") checkScreenName(c);
      if (!ds && c.type === "SECTION") {
        for (const k of c.children || []) if (k.type === "FRAME") checkScreenName(k);
      };
      visit(c, ds ? "ds" : "screen", null, []);
    }
  };
  return { hits, fonts: fonts.sort(), covers, areas };
  function pageOf(n) {
    let x = n;
    while (x && x.type !== "PAGE") x = x.parent;
    return x ? x.id : null;
  }
};
const { hits, fonts, covers, areas } = inspect(roots, { vars, defaultModes, textStyles, mains, componentNames, dsPage: ds });
const grouped = {};
for (const h of hits) {
  const g = grouped[h.rule] || (grouped[h.rule] = { count: 0, nodes: [] });
  g.count++;
  if (g.nodes.length < 200) g.nodes.push([h.node, h.name, h.detail, h.in]);
}
const s = JSON.stringify({ file: figma.fileKey || null, pages: [...new Set(roots.map(pageOf))], covers, areas, fonts, total: hits.length, hits: grouped });
const part = {{PART}};
const size = 15000;
return { checksum: checksum(s), length: s.length, parts: Math.ceil(s.length / size), part, data: s.slice(part * size, (part + 1) * size) };
```

## 4. Grade it

The report''s `hits` maps each rule to its `count` and its `nodes`, each
`[node id, layer name, detail, area]` (the area is the component or screen it
is in). Give each rule its severity from this table. A rule not in it is
blocking. The gate **passes** only when no blocking rule has findings.

| Rule | Severity | What it is | How to fix it in Figma |
| --- | --- | --- | --- |
| `color.unbound` | blocking | Colour without a variable | Bind the fill or stroke to a colour variable. Wave only takes colours from tokens. |
| `color.stale` | blocking | Colour does not match its variable | The paint is bound to a variable but draws another colour. Re-apply the variable (detach and bind again) so the drawing and the token agree. |
| `variable.remote` | blocking | Variable from another file | The value is bound to a library variable this file does not define. Make the variable local, or publish the tokens from this file. |
| `spacing.unbound` | blocking | Spacing without a variable | Bind the gap or padding to a spacing variable. |
| `radius.unbound` | blocking | Corner radius without a variable | Bind the radius to a radius variable. |
| `stroke.unbound` | blocking | Stroke width without a variable | Bind the stroke width to a border-width variable. |
| `opacity.unbound` | blocking | Layer opacity without a variable | Bind the opacity to an opacity variable, or put the transparency in the colour variable. |
| `effect.unbound` | blocking | Shadow or blur without tokens | Use an effect style, or bind the effect''s colour and sizes to variables. |
| `effect.under-stroke` | blocking | Inner shadow under an inside stroke | Figma draws the stroke over the inner shadow, a browser draws the shadow inside the border, so the two differ. Remove the inner shadow (when the stroke covers it, it shows nothing), or remove the stroke and let the shadow be the ring. |
| `text.style` | blocking | Text without a text style | Apply one of the file''s text styles. |
| `layout.none` | blocking | Layers placed by hand | Use auto layout. Hand-placed layers become absolutely positioned HTML that does not reflow and does not match its component. |
| `layout.group` | blocking | Group | Replace the group with an auto layout frame. Groups place their layers absolutely. |
| `layout.absolute` | blocking | Absolute position with an offset | A layer placed at an offset becomes a pixel position. Let auto layout place it (alignment, padding bound to spacing variables); an overlay at 0,0 is fine. |
| `size.fixed` | blocking | Fixed size without a variable | Set the layer to Hug or Fill, or bind its width or height to a size variable. |
| `text.fixed` | blocking | Text with a fixed width | Set the text to Hug (auto width) or Fill its container. |
| `instance.boolean` | blocking | Boolean property away from its default | Wave''s catalogue draws a component''s variants, so an instance that shows or hides a layer with a boolean has a shape none of them is. Make the property a variant property and draw the variant. |
| `instance.resized` | blocking | Instance at another size than its component | Keep the instance at its component''s size (Hug where the component hugs). For another size, give the component a variant or a size variable for it. |
| `set.layout` | blocking | Component set without auto layout | Give the component set auto layout with gap and padding bound to spacing variables. It becomes the specimen page''s canvas. |
| `instance.detached` | blocking | Detached instance | A frame carries a component''s name but is not an instance. Replace it with an instance of the component. |
| `instance.remote` | blocking | Component from another library | Wave''s catalogue is this file''s design-system page. Bring the component into it, or use the local one. |
| `instance.override` | blocking | Instance restyled | The instance overrides how the component looks. Make the look a variant of the component and use that variant; only text, visibility, swaps and component properties may change per instance (a variant property bound to a variable is a component property). |
| `component.description` | blocking | Component without a description | Write what the component is for in its description. It becomes the catalogue entry. |
| `choice.state` | blocking | Choice without a chosen look | A radio, checkbox, chip, segment, toggle, tab or option needs a State variant property with a chosen value (Selected, Checked or On) and a not-chosen value (Default, Unchecked or Off), each drawn. The prototype shows the chosen look when it is picked; Wave does not invent it. |
| `select.open` | blocking | Select without an open state | Add a State value Open to the select''s component set and draw it: the field as it looks open, with its menu. Without it the prototype has nothing to open, and Wave does not invent a menu. |
| `select.menu` | blocking | Select''s open state without a usable menu | In the Open variant, put the options in a layer named Menu: at least two rows, each an instance of one option component whose State has Selected and Default. The prototype opens this menu and shows the chosen option with its Selected look. |
| `screen.name` | blocking | Screen frame not named as the screen | Name each screen''s frame as the screen is called, in plain words (About you, Budget and timing): no numbers, sizes or separators like · — \| /. The name becomes the screen''s id, and every test id on the screen starts with it. |
| `color.gradient` | advice | Gradient | Gradients cannot be tokens yet; they are copied as drawn. Use a solid colour variable if the gradient is not essential. |
| `text.mixed` | advice | Mixed text styles in one layer | Split the layer, or check that each run uses a text style; mixed runs become spans. |
| `instance.outside` | advice | Component outside the design-system page | Move the main component to the design-system page so it becomes a catalogue specimen. |
| `instance.recolor` | advice | Instance recoloured with variables | Fine for an icon taking its parent''s colour. If the colour is a state of the component, make it a variant instead. |
| `geometry.subpixel` | advice | Fractional position or size | Snap to whole pixels. Browsers round fractions differently from Figma, which shows as a pixel difference. |
| `layer.hidden` | advice | Hidden layer | Hidden layers are dropped. Delete it, or make the hidden look a variant. |
| `layer.name` | advice | Default layer name | Name the layer for what it is; names become element names and help the semantic pass. |
| `proto.unlinked` | advice | Button without a prototype link | Add a prototype interaction so the prototype knows where it goes. |

## 5. Report

1. **PASS** or **FAIL**, then the blocking and advice counts, and what was
   checked: the report''s `areas` (components and screens) and `fonts`.
2. **Changed since the last official gate**, when the project has one: what is
   fixed, what is still open, what is new (match layers by name; node ids can
   change between files).
3. **Blocking**, by rule: the rule''s fix, then a table of area, layer, detail
   and a link `https://www.figma.com/design/<file key>/?node-id=<node id with : as ->`.
4. **Advice**: one line per rule with its count.

When the designer has fixed something and asks again, run step 3 again.

## When it passes

Tell the designer to send the engineer the Figma design link, the prototype
link and this result (PASS, 0 blocking, the `checksum`), so the engineer runs
the official gate on the same version.
');

  -- Wave's skills no longer live in the Post-it space's shared Skills folder.
  select id into v_postit from public.spaces where slug = 'postit';
  if v_postit is not null then
    delete from public.nodes
     where space_id = v_postit and kind = 'file'
       and parent_id = (select id from public.nodes where space_id = v_postit and kind = 'folder' and slug = 'skills' and parent_id is null)
       and slug = any (array['wave-design', 'wave-brief', 'wave-design-system', 'wave-feature', 'wave-review', 'wave-figma', 'wave-figma-brief', 'wave-figma-design-system', 'wave-figma-feature', 'wave-build', 'wave-test', 'wave-figma-gate', 'design-for-post-it']);
  end if;
end $$;
