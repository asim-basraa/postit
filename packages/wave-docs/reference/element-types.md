# Element types and questions

_Generated from the code by `@wave/docs`. Do not edit by hand: change the code and generate again._

Wave detects each element's type (`data-wave-role` overrides it) and asks, for each type, the questions below. A question answered by the element's HTML, FEATURE.md, its catalogue component, DESIGN.md or what Wave knows for certain is never asked.

## Types

- **structure**: Section (`section`), Container (`container`), Card (`card`), List (`list`), Table (`table`), Modal / dialog (`modal`), Navigation (`navigation`), Menu (`menu`)
- **content**: Heading (`heading`), Text (`text`), Label (`label`), Inline value (`inlineValue`), Formatted value (`formattedValue`), Image (`image`), Icon (`icon`), Avatar / logo (`avatar`), Badge / status (`badge`), Media (`media`), Chart (`chart`), Map (`map`)
- **actions**: Button (`button`), Link (`link`)
- **inputs**: Form (`form`), Text input (`textInput`), Select (`select`), Checkbox (`checkbox`), Radio option (`radio`), Radio group (`radioGroup`), Switch (`switch`), Date / time picker (`datePicker`), Slider / stepper (`slider`), File upload (`fileUpload`), Rich text editor (`richTextEditor`)
- **feedback**: Error message (`errorMessage`), Empty state (`emptyState`), Loading state (`loadingState`), Toast / banner (`toast`), Tooltip / popover (`tooltip`), State depiction (`stateDepiction`)

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
| When empty | **mandatory** | designer | `data-wave-empty-state` | What shows when there are none? The empty state's slug. |
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
| When empty | **mandatory** | designer | `data-wave-empty-state` | What shows when there are none? The empty state's slug. |
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
| Asks to confirm (if it looks destructive (delete, remove, cancel…)) | **mandatory** | product | `data-wave-confirm` | This looks destructive. Does it ask "are you sure" first? The dialog's slug, or none. |
| Success message (if it has side effects) | recommended | product | `data-wave-feedback` | Is there a message when it works? The toast's slug, or none. |
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
| Belongs to | **mandatory** | product | the design | What is this the error of? Point data-wave-state-of at the field, or make an action's data-wave-to-failure lead here. |
| Fixed or from data | **mandatory** | product | `data-wave-content` | Fixed text, or the message the server returns? |
| Copy status (if fixed text) | recommended | product | `data-wave-copy` | Is this the final copy? final, draft or placeholder. |

#### emptyState

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Shown when | **mandatory** | product | the design | When does it show? Point a list's data-wave-empty-state here, or give it data-wave-visible-if. |

#### loadingState

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Loading of | **mandatory** | designer | the design | What is this the loading state of? Point data-wave-state-of at it. |
| Component | **mandatory** | designer | `data-wave-component` | Which design-system component is this? |

#### toast

| Field | Level | Asked of | Written as | Question |
| --- | --- | --- | --- | --- |
| Shown by | **mandatory** | product | the design | What shows it? Point an action's data-wave-feedback here, or give it data-wave-visible-if. |
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
