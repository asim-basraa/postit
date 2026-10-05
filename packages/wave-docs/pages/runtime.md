# Runtime: inspector and prototype

Two scripts run inside a screen, in a sandboxed frame. The **inspector** turns a
mockup into something you can review: hover, select, comment, read styles. The
**prototype runtime** turns a feature's screens into a working product on a mock
API. Both talk to the page around them only by `postMessage`.

## The frame

Every screen is served on its own, in an iframe with
`sandbox="allow-scripts allow-popups"` and the response header
`content-security-policy: sandbox allow-scripts allow-popups; frame-ancestors 'self'`.
Without `allow-same-origin` the frame has an opaque origin: no cookies, no
storage, no access to the host page. Messages from it arrive from origin `null`
and are treated as untrusted: their shape is checked, they are never rendered as
HTML, and they can only do what a click could.

| Frame | Served at | Script added |
| --- | --- | --- |
| Review | `/api/wave/screens/{id}/frame?v=` | `/api/wave/inspector.js`, before `</body>` |
| Prototype | `/api/wave/screens/{id}/prototype?v=` | `/api/wave/prototype.js`, first in `<head>` (so it patches `fetch` before the page's own scripts) |
| Shared prototype | `/play/{token}/screens/{id}/prototype` | the same runtime |

## The inspector (`@wave/inspector`)

Injected only for signed-in reviewers, never on a public link. It edits nothing:
it selects, highlights and reports. Changes go through the server (`POST
/api/wave/screens/{id}/edit`), which makes byte-exact edits to the HTML.

**What it does**

- Draws its own overlay (a shadow-rooted `<wave-overlay>`): hover (dashed when the
  element has no id), selection, highlights from the layers panel, regions,
  version diffs, comment pins coloured by status, and the box model.
- Hover resolves the nearest `[data-wave-id]`; a bare control without an id is a
  target of its own, so it can be given one.
- **Inspect mode** (default): clicks select; Alt- or Shift-drag selects a region;
  selecting text reports a range inside the nearest element; arrow keys and
  Escape go to the host; Cmd/Ctrl+I switches mode.
- **Interact mode**: the page behaves normally; a click on `data-wave-to`
  (`screen:`, `node:`, `modal:`, `back`) becomes a navigation request.
- Reads computed styles in seven groups (typography, colour, spacing, size,
  border, shadow, layout), with the authored declaration, the `var()`s it uses and
  whether the value is a default, plus every custom property on `:root`.
- Previews a depicted state (`data-wave-state-of` + `data-wave-state`) in place of
  the element, and can hide conditional parts (`data-wave-visible-if`).

**Messages** (`PROTOCOL_VERSION = 1`; every message carries `protocol`)

| Frame to page | Fields |
| --- | --- |
| `wave:hello` | ready |
| `wave:hover` | `id`, `label` |
| `wave:select` | `id`, `element?` (selector and fingerprint), `ancestors?`, `fromUser?` |
| `wave:range` | `pid`, `start`, `end`, `quote`, `ancestors?` |
| `wave:region` | `rect`, `viewport`, `covered` (ids more than half covered) |
| `wave:styles` | `id`, `styles` |
| `wave:pin-click` | `commentId` |
| `wave:unresolved` | `commentIds` whose anchors cannot be found |
| `wave:navigate` | `to`, `from` |
| `wave:key` | `key` |
| `wave:scroll` | `x`, `y` |
| `wave:state-previewed` | `id`, `state` |

| Page to frame | Fields |
| --- | --- |
| `wave:mode` | `mode`: `inspect` or `interact` |
| `wave:select` | `id`, `element?`, `scroll?` |
| `wave:highlight` | `id` |
| `wave:pins` | `pins` (comment id, number, status, title, anchor), `active` |
| `wave:show-anchor` | `anchor`, `commentId` |
| `wave:clear-transient` | |
| `wave:get-styles` | `id` |
| `wave:box` | `layer` |
| `wave:preview-state` | `id`, `state` |
| `wave:hide-conditional` | `on` |
| `wave:diff` | `diff` (added, changed, removed ids) |
| `wave:scroll-to` | `x`, `y` |

## The prototype runtime (`@wave/prototype`)

The runtime is `runtime.ts` and MSW, bundled into one script. A service worker
cannot register in an opaque origin, so the runtime replaces `window.fetch` and
answers it in the page with MSW's handlers.

**Start-up.** The page is hidden until the runtime starts. It posts
`wave-proto:ready`, receives `wave-proto:init` (the screen, the API, the state
carried from earlier screens, the scenario choices, speed and outcome), builds a
handler per operation and shows the page. Without an init in 3 seconds it starts
anyway.

**What it does with the attributes**

| Attribute | In the prototype |
| --- | --- |
| `data-wave-bind`, `data-wave-format`, `data-wave-empty` | Fills text, image sources and input values from the data; formats currency, numbers, percentages, dates and times; shows the empty text or hides |
| `data-wave-repeat`, `data-wave-item`, `data-wave-empty-state` | Clones the item template once per item and removes the samples; shows the empty state when the list is empty |
| `data-wave-visible-if` | Evaluates `and`, `or`, `not`, comparisons and `.length`; re-runs on every input |
| `data-wave-field`, `data-wave-validate` | Writes into the carried state; validates on submit (`required`, `email`, `min`, `max`, `pattern:` email, uk-postcode, phone, numeric, number, url, domain), shows the error states drawn for each field, sets `aria-invalid`, focuses the first invalid field |
| `data-wave-action`, `data-wave-effect`, `data-wave-trigger` | Calls the operation whose `x-wave-effect` matches, with the form's fields as the body; on `click`, `submit` or `change` |
| `data-wave-state="loading"` | Shown while the screen's data or an action is loading |
| `data-wave-state="error"` | Shown when loading fails; a notice when none is drawn |
| `data-wave-to`, `data-wave-to-failure` | Where to go on success and on failure |
| `data-wave-confirm` | Opens the confirm dialog first; its cancel control closes it |
| `data-wave-feedback`, `data-wave-dismiss` | Flashes the success message; `auto:N` hides it after N seconds |

**Choices and selects.** A component holding a radio or checkbox takes its
chosen or not-chosen variant (from `variants`) whenever its choice changes,
including a choice inside another component (a segment in a segmented control).
A select (`data-wave-role="select"` or `aria-haspopup="listbox"`) opens the
Menu its component's Open variant draws, placed where Figma places it, with one
row per option (the field's `data-wave-options`, else the rows as drawn); the
chosen option takes its Selected look, and the field takes its Filled look and
the option's words. Without an Open variant the select does not open and the
viewer gets a notice.

**State.** Fields write into `state.data`; every navigation carries a snapshot,
which the viewer passes back in the next screen's init. So what you type on step
one shows on step three.

**Without an API** (a Figma feature before its API exists), actions wait 700 ms
times the speed and then follow the viewer's chosen outcome: success or failure.

**Messages**

| Direction | Message | Fields |
| --- | --- | --- |
| Viewer to frame | `wave-proto:init` | `screen`, `api`, `state`, `choices` (operation to response name), `speed` (0, 1, 3), `reveal`, `outcome?`, `variants?`, `variantCss?` |
| Viewer to frame | `wave-proto:settings` | `choices`, `speed`, `outcome?` |
| Frame to viewer | `wave-proto:ready` | |
| Frame to viewer | `wave-proto:navigate` | `to` (`screen` with `reveal`, or `back`), `state` |
| Frame to viewer | `wave-proto:state` | `state` |
| Frame to viewer | `wave-proto:request` | `method`, `url`, `operation`, `status`, `ms` |
| Frame to viewer | `wave-proto:notice` | `message` |

## The mock API

A feature's mock API is an OpenAPI 3 document (JSON or YAML) in its `api/`
folder, with optional mock files (response bodies by operationId). Wave reads
four extensions on each operation:

| Extension | Means |
| --- | --- |
| `x-wave-provides: <root>` | The response body is the data root `<root>`: `data-wave-bind="order/total"` reads `order` |
| `x-wave-effect: api/...` | An action naming that effect calls this operation |
| `x-wave-delay: <ms>` | How long it takes (0 to 10000), so loading states show |
| `x-wave-mock: <name>` | Another mock file name |

Every response, and every named example, becomes a **scenario**: the viewer's
Scenarios menu picks which one each operation answers, so failures can be played
on purpose. A mock file replaces the first success example. `wave_generate_api`
drafts the document from the screens: one GET per data root they read (with the
values the design shows as examples) and one POST per `api/...` effect, each
with success, 422 and 500 responses; and it writes the **Data requirements**
page: what each screen shows, collects and calls, and any gap.

## The viewer

`PrototypeApp` (in `@wave/react`) plays the feature: a device bar (mobile
390x844, tablet 834x1194, desktop 1440x900, fit, rotate), back, a screen
picker, restart, network speed (instant, normal, slow), the outcome picker when
there is no API, and three panels: Scenarios, Requests (the last 100 calls) and
Notes (API problems and the data requirements link).

**Sharing.** `share_prototype` (or `POST /api/v1/flows/{id}/prototype-links`)
makes a link for somebody without an account. The token is shown once, stored
only as a hash, expires in 1 to 365 days and can be revoked. The shared viewer
plays only that feature's screens, at the versions it plays.
