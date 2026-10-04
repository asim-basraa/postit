---
name: Wave Feature
description: Turn the designer's prompt for a feature into FEATURE.md (screens, fields, data, actions) in Post-it, then generate the feature's HTML screens with every data-wave-* attribute already in place, reusing the catalogue exactly. Use for each new feature, after the design system is approved.
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
     tracking or disabled-if when they apply. A screen's submit action
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
   - each action's control `data-wave-action="action/<id>"`, and
     `data-wave-trigger`, `data-wave-effect`, `data-wave-to`,
     `data-wave-to-failure` as the brief says;
   - the screen's meta: `wave:screen`, `wave:flow`, `wave:route`,
     `wave:title`.
4. **Draw every state the brief implies**: an error message for each rule
   (`data-wave-state-of` the field, `data-wave-state="error"`), a warning
   where the brief has one, the loading state of every action with effects,
   the screen's loading and error states when it shows data, and every
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
of is written into the HTML; DESIGN.md and the catalogue stay the policy.
