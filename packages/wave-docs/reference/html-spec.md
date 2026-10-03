# Wave HTML spec

_Generated from the code by `@wave/docs`. Do not edit by hand: change the code and generate again._

Spec version **1**. Every attribute is `data-wave-<key>`; pages written before the rename used `data-pi-<key>`, which Wave still reads.

An id matches `^n_[a-z0-9]{4,}$` (`n_` and at least four lowercase letters or digits). Ids are never changed or reused: comments, answers and usage are anchored to them.

## Identity

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
| `data-wave-access` | Who can see it, when it differs from the screen: public, signed-in, role:<name>, plan:<name>. | `role:admin` |
| `data-wave-flag` | Feature flag it is behind. | `flags/new-checkout` |
| `data-wave-responsive` | What happens on small screens: stack, hide, collapse, scroll, or a note. | `stack` |
| `data-wave-behavior` | Behaviours on top of the element type, space separated: carousel, reorderable, draggable, drop-target, accordion, collapsible, infinite-scroll, swipe-actions, sticky, pull-to-refresh, copy-to-clipboard. | `carousel` |
| `data-wave-config` | Settings a behaviour needs, key:value separated by semicolons. | `autoplay:off; loop:on; controls:arrows dots` |
| `data-wave-icon` | Icon name from the icon library. | `lucide:search` |
| `data-wave-waived` | Answers the designer decided not to give, as JSON {field: reason}. | `{"to-failure":"Navigation only, cannot fail"}` |

## Content

| Attribute | Meaning | Example |
| --- | --- | --- |
| `data-wave-content` | static or dynamic. | `dynamic` |
| `data-wave-bind` | Resource path the content comes from. Free text, path grammar. | `user/firstName` |
| `data-wave-sample` | Example value. Defaults to the rendered text. | `Asim` |
| `data-wave-empty` | What to show when the value is missing. | `there` |
| `data-wave-format` | How the value is formatted. Free text. | `currency:GBP` |
| `data-wave-max` | Maximum length before truncation. | `40` |
| `data-wave-repeat` | This element repeats over a list resource. | `orders[]` |
| `data-wave-item` | Marks the child that is the repeated item template (no value). |  |
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

## Behavior

| Attribute | Meaning | Example |
| --- | --- | --- |
| `data-wave-action` | Action name. Free text, path grammar. | `action/signup/add-address` |
| `data-wave-trigger` | click, submit, change or load. Defaults to click. | `click` |
| `data-wave-effect` | Named side effects, space separated. Free text. | `api/address/create` |
| `data-wave-to` | Destination on success: screen:, node:, modal:, back, url:. | `screen:checkout-review` |
| `data-wave-to-failure` | Destination or node revealed on failure. | `node:checkout-address/form-error` |
| `data-wave-disabled-if` | When the control cannot be used. | `form/invalid` |
| `data-wave-confirm` | The dialog that asks for confirmation first, by id or slug, or none. | `confirm-delete` |
| `data-wave-feedback` | The toast or banner shown on success, by id or slug, or none. | `saved-toast` |
| `data-wave-shortcut` | Keyboard shortcut. | `mod+s` |
| `data-wave-dismiss` | How a dialog, toast or banner goes away: close-button, backdrop, escape, auto:<seconds>, choice. | `close-button escape` |
| `data-wave-active-if` | When a navigation item is the current one. | `route/section == orders` |
| `data-wave-controls` | The panel a tab shows, by id or slug. | `orders-panel` |
| `data-wave-commit` | Whether a switch or checkbox acts immediately or on save: instant or save. | `instant` |
| `data-wave-track` | Analytics event sent. | `checkout_address_saved` |

## Inputs

| Attribute | Meaning | Example |
| --- | --- | --- |
| `data-wave-field` | The field this control writes. Free text, path grammar. | `address/postcode` |
| `data-wave-validate` | Validation rules, separated by semicolons. | `required; pattern:uk-postcode; max:8` |
| `data-wave-options` | Choices: a list separated by \|, or a resource path. | `catalog/sizes[]` |
| `data-wave-default` | The starting value, or none. | `none` |
| `data-wave-validate-on` | When a form shows errors: submit, blur or change. | `blur` |
| `data-wave-dirty-guard` | Whether leaving with unsaved changes warns: on or off. | `on` |

## States

| Attribute | Meaning | Example |
| --- | --- | --- |
| `data-wave-states` | States this node supports, space separated. | `default hover disabled loading error` |
| `data-wave-state` | Which state this element depicts. | `error` |
| `data-wave-state-of` | This element depicts another node (by id) in the state named by data-wave-state. | `n_7f3a2c` |
| `data-wave-visible-if` | Visibility condition over resource paths. Free text. | `user/isLoggedIn` |

## Screen meta tags

In the page's `<head>`, as `<meta name="..." content="...">`.

| Meta | Key |
| --- | --- |
| `wave:spec` | spec |
| `wave:screen` | screen |
| `wave:flow` | flow |
| `wave:route` | route |
| `wave:title` | title |
| `wave:tokens` | tokens |
| `wave:access` | access |
| `wave:entry` | entry |
| `wave:viewports` | viewports |
| `wave:track` | track |
| `wave:waived` | waived |
| `wave:component` | component |
| `wave:project` | project |

## Triggers

`click`, `submit`, `change`, `load`.

## Behaviours

Written in `data-wave-behavior`, with their settings in `data-wave-config` (`key:value; key:value`): `carousel`, `reorderable`, `draggable`, `drop-target`, `accordion`, `collapsible`, `infinite-scroll`, `swipe-actions`, `sticky`, `pull-to-refresh`, `copy-to-clipboard`.

## Destinations

Where `data-wave-to` and `data-wave-to-failure` lead:

| Form | Means |
| --- | --- |
| `screen:<slug>` | Another screen of the project, by its slug |
| `node:<screen>/<slug>` | An element on a screen (an error summary, a section) |
| `modal:<screen>/<slug>` | Opens a dialog drawn on a screen |
| `url:<https address or data path>` | Leaves the product |
| `back` | The previous screen |
| `stay` | Stays where it is |
