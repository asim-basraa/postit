-- Publishes Wave's skills into the Post-it space's Skills folder, where
-- Claude Design and Claude Code find them with list_skills and get_skill.
--
-- The same text as the documentation page, from content/skills.ts (whose
-- vocabulary comes from packages/wave-skills). The Design for Post-it page, if
-- there is one, becomes Wave Design in place, so links to it keep working.
-- Safe to run again: an existing page is brought up to date.

create or replace function pg_temp.put_skill(p_folder uuid, p_space uuid, p_slugs text[], p_title text, p_slug text, p_body text)
returns void
language plpgsql
as $fn$
declare
  v_node uuid;
begin
  select id into v_node from public.nodes
   where parent_id = p_folder and slug = any (p_slugs)
   order by slug = p_slug desc
   limit 1;
  if v_node is null then
    v_node := gen_random_uuid();
    insert into public.nodes (id, space_id, parent_id, kind, name, slug, content, content_type)
    values (v_node, p_space, p_folder, 'file', p_title, p_slug, p_body, 'skill');
    insert into public.grants (node_id, grantee_type, grantee_id, role)
    values (v_node, 'authenticated', null, 'viewer');
  else
    update public.nodes
       -- path is set by a trigger on insert only, so a new slug brings its path along here.
       set name = p_title, slug = p_slug, content = p_body,
           path = regexp_replace(path, '[^/]+$', p_slug),
           content_version = content_version + 1, updated_at = now()
     where id = v_node and (name, slug, content, path) is distinct from (p_title, p_slug, p_body, regexp_replace(path, '[^/]+$', p_slug));
  end if;
end;
$fn$;

do $$
declare
  v_space uuid;
  v_folder uuid;
begin
  select id into v_space from public.spaces where slug = 'postit';
  if v_space is null then
    raise notice 'no Post-it space here; skipping';
    return;
  end if;

  select id into v_folder from public.nodes
   where space_id = v_space and kind = 'folder' and slug = 'skills' and parent_id is null;
  if v_folder is null then
    raise notice 'no Skills folder in the Post-it space; skipping';
    return;
  end if;

  perform pg_temp.put_skill(v_folder, v_space, array['wave-design', 'design-for-post-it'], 'Wave Design', 'wave-design', '---
name: Wave Design
description: Build a project''s design system catalogue, run a Wave dry run for product, and design, check and upload HTML mockups whose data-wave-* attributes are the complete spec, for review in Post-it and handover to Claude Code. Use before creating, changing or uploading any HTML mockup or component.
---

# Wave Design

Wave is how Post-it reviews HTML mockups and hands them to Claude Code. **The HTML
is the spec**: what every element is, says and does lives on it as
`data-wave-*` attributes, checked against the project''s design system (DTCG
tokens and a catalogue of components). Wave''s tools check every rule below;
this skill tells you how to satisfy them without missing anything.

Older files use `data-pi-*` and `pi:`. They are read, but upload only
`data-wave-*` (`wave_upgrade_prefix` converts a file).

## Always start here

1. Ask the designer **which project** and **which feature** this is for.
   - Find it with `list_spaces` and `list_tree` (projects and features are marked).
   - No project yet: `create_folder` with `project: true` (it creates design-system/ and
     design-system/components). No feature yet: `create_folder` inside the project with
     `flow: true`.
2. Call `get_catalogue` for the project. If it has **no approved catalogue**
   (no components, or no valid token file), run **catalogue setup** first.
   Nothing else is uploaded until the designer has approved the catalogue.
3. Decide the mode:
   - The designer said "Wave dry run", or wants questions to share with
     product before anything is uploaded: **dry run**.
   - Otherwise: **full run**.

## Mode 1: catalogue setup (a project''s first run)

The design system comes first, approved by the designer.

1. **Tokens.** Collect every colour, size, spacing, radius, border width,
   shadow, font family, font weight, line height, letter spacing, duration,
   easing, opacity and z-index the designs use. Write them as one W3C DTCG
   JSON file: every token has `$type` (own or inherited), dimensions are
   `{"value": 1, "unit": "rem"}` (never px; 1px is 0.0625rem), aliases
   point at real tokens. Show the designer the list grouped by type and ask:
   "Are these the right names and values? Anything missing or duplicated?"
   Publish it as the JSON page `design-system/tokens`.
2. **Components.** List every distinct component in the designs (buttons,
   inputs, cards, badges, navigation, dialogs, toasts, list items…). For each,
   interview the designer, grouped:
   - Name and element type (button, textInput, card…). Are these two similar
     things the same component (with variants) or different components?
   - Variants (primary, secondary, destructive…), and states (default,
     hover, focus, disabled, loading, error…).
   - Anatomy (label, icon, helper text…), and accessibility notes.
3. **Specimens.** For each component make one HTML specimen page: head with
   `<meta name="wave:spec" content="1">`, `<meta name="wave:component" content="Button">`
   and a `<script type="application/wave-component+json" id="wave-component">`
   holding `{"type","description","variants","states","anatomy","a11y","status"}`;
   body drawing **every variant and every state**, each example marked
   `data-wave-component`, `data-wave-variant` and, for states,
   `data-wave-state`. Styles use only token variables. `wave_extract_component`
   makes a first specimen from an element on a screen.
4. Run `preflight_html` on each specimen (target = the project) and fix
   everything it reports.
5. **Designer approval.** Show the catalogue: tokens, and every component with
   its variants and states. Ask the designer to approve it. When they do, set
   `"status": "approved"` in each definition and publish the specimens into
   `design-system/components`. Confirm with `get_catalogue`.

## Mode 2: dry run (questions for product, nothing uploaded)

1. Produce the draft screens'' HTML (see "Fidelity" below).
2. `wave_assign_ids` on each draft, so every element has its permanent id
   before any question is asked. Keep these ids from now on.
3. `wave_dry_run` with the feature id and the drafts. It saves the **question
   sheet** in the feature as "Wave questions": every question per element,
   mandatory first, what Wave already worked out (to confirm), and who should
   answer (designer or product).
4. Answer the designer''s questions with them now. Give the designer the link
   to "Wave questions" to share with product, who write their answers in it
   (plain words are fine; you will turn them into the exact format).
5. When they say it is filled in, run `wave_dry_run` again (it reads the saved
   sheet). It marks answers that are missing or invalid ("**Fix:** …"). Tidy
   plain-word answers into the format asked, confirm changes with the
   designer, and repeat until it **passes**. A passing run saves
   "Wave answers".
6. Tell the designer the dry run passed and the full run can begin.

## Mode 3: full run (design, check, confirm, upload)

1. **Reuse the catalogue exactly.** Read each component''s specimen
   (`read_page`) and copy its markup and classes; never restyle a component.
   If the design needs something the catalogue lacks, **ask the designer: "Is
   this a new component (or a new variant of X)?"** Yes: add it to the
   catalogue first (Mode 1 steps 3 to 5, for that component). No: rebuild it
   from an existing component.
2. **Ids.** `wave_assign_ids` on each screen (it never changes existing ids).
3. **Answers.** If the feature has "Wave answers", apply it with
   `wave_apply_answers` (sheet = its content). Then interview the designer for
   whatever is still open, using the decision tree below: group questions by
   component and type ("these 6 primary buttons…"), show what Wave proposed
   and ask the designer to confirm or change it (never write a guess without
   showing it), and ask every mandatory question until it is answered or the
   designer waives it with a reason (`waive: <reason>`). Write answers with
   `wave_apply_answers` (answers = {question id: answer}).
4. **Assets.** Every image, SVG file, icon, logo and font that is a local file
   or an inline `data:` file is uploaded with `upload_asset` (project id, file
   name, base64 bytes) and the HTML is changed to use the returned address.
   Links to other websites (stock photos, Google Fonts) stay as they are.
   No video.
5. **Tokens.** Every value DTCG can express must be `var(--token)` from the
   project''s token file: colours, every px/rem/em size (use rem tokens),
   font families and weights, shadows, durations, easing, opacity and
   z-index. `0`, `auto`, percentages, `fr`, viewport units and keywords are
   fine. If a value has no token, ask the designer: add a token (catalogue
   change), or use the nearest existing one.
6. **Preflight.** `preflight_html` (target = the feature) on every screen.
   Fix everything mandatory. Then **show the designer**: the screen, what you
   changed from their design (ids, attributes, asset addresses, tokens), what
   Wave proposed and they confirmed, anything waived, and the preflight
   result. **Ask: "Does this match what you designed? May I upload it?"**
   Upload only on a clear yes.
   - Publish each screen into the feature folder with `attach_file` (`<screen-slug>.html`)
     or `create_page` (`content_type: "html"`, `parent_id` = the feature). For a new
     version, `read_page` then `update_page` with its version. Specimens go into
     `design-system/components` the same way.
   - After saving, `check_screen` shows what Wave still finds missing on the uploaded file.
7. **Compare after upload.** Give the designer the Post-it link to the uploaded
   screen (https://<post-it>/review/<page id>) and ask them to compare it with the original
   side by side. If anything looks different, use "Fidelity" below, fix,
   preflight and upload again.
8. Only then ask for review.

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

## The decision tree: what to ask for every element

Wave detects each element''s type. For each type, ask every **mandatory**
question (and the recommended ones the designer wants to answer). Questions
marked "designer" are about look, components, states and accessibility;
"product" ones are about data, behaviour, rules, navigation, permissions and
tracking (the designer answers these too, having agreed them with product).

### Every element

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Element type (only when Wave had to guess the type) | **mandatory** | designer | `data-wave-role` | What kind of element is this? |
| Name (slug) | **mandatory** | designer | `data-wave-slug` | What do we call this? A short name, unique on the screen. |
| Name (slug) is recommended, not mandatory, for fixed text, decorative icons, containers and state pictures. | | | | |
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
| copy-to-clipboard | copies | data-wave-feedback |
');
  perform pg_temp.put_skill(v_folder, v_space, array['wave-build'], 'Wave Build', 'wave-build', '---
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
8. Where the handover lists an accepted gap or a waived field, follow its note;
   where something is neither specified nor waived, ask rather than guess.
');
end $$;
