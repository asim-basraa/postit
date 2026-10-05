# MCP tools

_Generated from the code by `@wave/docs`. Do not edit by hand: change the code and generate again._

Wave's tools, served by the host's MCP server (in Post-it, `/api/mcp` with an MCP token from Settings). An agent acts as the person whose token it holds. 27 tools:

`check_screen`, `get_catalogue`, `get_handover`, `get_handover_screen`, `get_prototype`, `mark_addressed`, `preflight_html`, `set_flow`, `set_project`, `upload_asset`, `wave_apply_answers`, `wave_assign_ids`, `wave_design_system_page`, `wave_dry_run`, `wave_extract_component`, `wave_flow_feature`, `wave_generate_api`, `wave_get_brief`, `wave_publish_flow`, `wave_record_test_run`, `wave_reopen_flow`, `wave_save_api`, `wave_save_brief`, `wave_screen_usage`, `wave_test_bundle`, `wave_upgrade_prefix`, `wave_use_screen`.

## `check_screen`

What Wave reads out of one uploaded HTML screen at its current version: its screen meta, every mandatory field still missing (with question ids and proposals), and every validation finding. Use after saving a screen to see what is left to fix.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `screen_id` | string | yes |  |

## `get_catalogue`

The project's design system: every component with its variants, states, status and specimen page (read it with read_page to copy its markup exactly), the token file's summary and problems, uploaded assets, and which screens use what. Use it before designing, so screens reuse catalogue components exactly.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `project_id` | string | yes | The project, or any feature or screen in it. |

## `get_handover`

Everything needed to build an approved flow of mockups: screens with routes, the flow graph (Mermaid), data dictionary, action catalog with side effects and destinations, component states, decisions from review and accepted gaps, as Markdown. Each screen's HTML is the source of truth for its markup and data-wave-* attributes: fetch it with get_handover_screen, or pass include_html to have them all appended. Refuses, listing what is blocking, if the flow is not approved.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `flow_id` | string | yes | The flow's id. |
| `include_html` | boolean |  | Append every screen's HTML and the token JSON. Can be long. |

## `get_handover_screen`

One screen's HTML exactly as approved (or tokens.json), from an approved flow's handover. The data-wave-* attributes on its elements are the spec (older files may use data-pi-*, which mean the same).

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `flow_id` | string | yes |  |
| `screen` | string | yes | The screen slug, as listed by get_handover, or 'tokens'. |

## `get_prototype`

The link to play a feature as a working prototype (every screen together, on the feature's mock API, with a device bar), its start screen, the operations its mock server answers, and anything the API does not yet serve. Give the link to the designer to try it before asking for review. Given a project id instead, it is the master prototype: every feature's screens at their latest approved versions. A feature that is approved and locked plays the versions it approved.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes | The feature (flow) folder, or a project for its master prototype. |

## `mark_addressed`

Mark a comment on your screen as addressed, after publishing the version that fixes it. Give the version number the save returned and one or two sentences on what changed. Only the screen's author can do this; a reviewer then confirms it resolved or reopens it.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `comment_id` | string | yes |  |
| `version` | number | yes | The screen version that addresses it. |
| `note` | string | yes | What changed, briefly. |

## `preflight_html`

The last check before uploading a screen: things that make it look or behave differently in Wave (scripts using storage, pages built by scripts, local files), assets not hosted in the project, style values that are not tokens, components that differ from the catalogue, and every mandatory field still open. Upload only when it passes, and show the designer the result.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `target` | string |  | The feature (flow) or project id the screen belongs to, so it is checked against the project's tokens, catalogue and assets. |
| `name` | string | yes | The screen's name, e.g. 'Delivery address'. |
| `html` | string | yes | The screen's complete HTML. |

## `set_flow`

Mark an existing folder as a flow (or stop it being one). A flow's HTML screens are one journey, reviewed and approved together and handed over with get_handover.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | The folder. |
| `flow` | boolean | yes |  |

## `set_project`

Marks a folder as a project (or stops it being one). A project holds its design system (design-system/tokens and design-system/components, created for you) and its features, which are flows inside it. Screen slugs must be unique within a project.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes |  |
| `project` | boolean | yes |  |

## `upload_asset`

Uploads an image (PNG, JPEG, GIF, WebP, AVIF, SVG, ICO) or font (WOFF2, WOFF, TTF, OTF) to the project's public asset store, up to 10 MB. Identical files are stored once. Returns the public address to use in the HTML. No video. Links to other websites can stay as they are. Give the bytes as data_base64, or a url for the server to fetch (https, from fonts.gstatic.com, figma.com, cdn.jsdelivr.net, raw.githubusercontent.com or unpkg.com): prefer url for anything large, so the bytes are never copied by hand.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `project_id` | string | yes | The project, or any feature or screen in it. |
| `name` | string | yes | The file's name, e.g. logo.svg. |
| `data_base64` | string |  | The file's bytes, base64 (a data: URL works too). Or give url. |
| `url` | string |  | Instead of data_base64: a public https address on an allowed host for the server to fetch. |

## `wave_apply_answers`

Writes answers into a draft screen's HTML as data-wave-* attributes, meta tags, native attributes (alt, type, aria-label) and the resources block, byte-exact. Answers come from an answer or question sheet (sheet) or a map of question id to answer (answers); 'waive: <reason>' records a waiver. Returns the new HTML, what was applied and skipped, and what is still open.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `target` | string |  | The feature (flow) or project id the screen belongs to, so it is checked against the project's tokens, catalogue and assets. |
| `name` | string | yes | The screen's name, e.g. 'Delivery address'. |
| `html` | string | yes | The screen's complete HTML. |
| `sheet` | string |  | An answer or question sheet. |
| `answers` | object |  | Question id to answer. |

## `wave_assign_ids`

Gives every element of a draft screen that needs an identity a data-wave-id (headings, text, controls, images, sections, lists, and the first item of each list), and, with screen, a data-testid to the screen's root, each section and each design-system component (<screen>.<sections>.<DS id>.<label>). Existing ids are kept. Run it before the first dry run so every question and answer stays attached to the same element. Returns the new HTML.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `html` | string | yes | The screen's complete HTML. |
| `screen` | string |  | Optional: the screen's slug (about-you). Without it, the screen's wave:screen meta; without either, no test ids. |

## `wave_design_system_page`

Writes the project's design-system page from its published specimens: a table of every component with its design-system id, its variants' ids and its type (with Figma and review links when known), and the same table as JSON (design-system-ids) next to it, linked under the table. The page's opening and its Notes section are kept. Run it after publishing, changing or approving specimens.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `project_id` | string | yes | The project, or any feature or screen in it. |

## `wave_dry_run`

Runs Wave over draft screens for a feature without uploading anything, and returns the question sheet: every mandatory and recommended question per element, what Wave already worked out (to confirm), and which answers are missing or invalid. The sheet is saved in the feature folder as 'Wave questions' so product can fill it in; pass it back (or leave sheet empty to use the saved one) to run again. When everything mandatory is answered or waived, it also saves 'Wave answers', which wave_apply_answers applies.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes | The feature (flow) folder the screens are for. |
| `screens` | object[] | yes |  |
| `sheet` | string |  | Optional: the question sheet with answers filled in. Defaults to the one saved in the feature. |

## `wave_extract_component`

Makes a catalogue specimen page for a new component from an element on a screen (its markup, its CSS rules and the token variables they use), after the designer has confirmed it is new. Upload the returned HTML into the project's design-system/components folder (the folder id is given). Then draw its other variants and states on the specimen.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `target` | string |  | The feature (flow) or project id the screen belongs to, so it is checked against the project's tokens, catalogue and assets. |
| `html` | string | yes | The screen's complete HTML. |
| `pid` | string | yes | The data-wave-id of the element. |
| `name` | string | yes | The component's name, e.g. Button. |
| `type` | string | yes | The element type, e.g. button, textInput, card. |
| `variant` | string |  |  |
| `description` | string | yes |  |
| `states` | string[] |  |  |

## `wave_flow_feature`

Writes the feature's Gherkin again (tests/flow-feature) from its screens and FEATURE.md, and returns it: the happy path from the screen nothing leads to, every required field filled with its FEATURE.md sample, each forward action, each screen arrived at. Steps name elements by test id. Scenarios people added after the marker line are kept. Publishing and saving FEATURE.md also write it; lists what keeps it from being complete (a field without a sample, an action without a test id).

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes | The feature (flow) folder. |

## `wave_generate_api`

Drafts the feature's mock API from its uploaded screens: an OpenAPI 3.1 document with one GET per data root the screens read (x-wave-provides) and one POST per api/... effect an action names (x-wave-effect), each with examples taken from the values the design shows, plus success and failure responses. Also returns the data requirements page. Show both to the designer; improve the examples with them (realistic values, more list items, the error cases product expects), then save with wave_save_api. save: true saves the draft as it is (never over an existing document unless overwrite: true).

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes | The feature (flow) folder's id. |
| `save` | boolean |  |  |
| `overwrite` | boolean |  |  |

## `wave_get_brief`

Reads a project's DESIGN.md (kind design; id is the project or anything in it) or a feature's FEATURE.md (kind feature; id is the feature folder). When there is none yet it returns a template to fill in. Lists what is wrong or missing in it. Every element inherits DESIGN.md's defaults and the fields, data and actions FEATURE.md names, so a good brief means few questions later.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `kind` | "design" \| "feature" | yes | design: the project's DESIGN.md. feature: a feature's FEATURE.md. |
| `id` | string | yes |  |

## `wave_publish_flow`

Publishes a whole feature in one call, after the designer has confirmed it: every screen (a new screen, or a new version of the screen with the same name in the feature), then the feature's OpenAPI document and mock files if given. Each screen is preflighted and the result reported. A screen converted from Figma is uploaded only when it carries a measurement of that page (wave-figma fidelity --stamp) matching its Figma frame at 99% or better; every Figma screen's match is logged in the feature's tests/fidelity-report. Returns the review link for each screen and the prototype link. Use it for a multi-screen flow instead of uploading screens one by one.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes | The feature (flow) folder's id. |
| `screens` | object[] | yes |  |
| `openapi` | string |  | Optional: the feature's OpenAPI document, JSON or YAML. |
| `mocks` | object |  | Optional: { operationId: response body } |

## `wave_record_test_run`

Records a run of the feature's end-to-end tests (wave-test does this through an upload link when given --record): publishes its report as tests/e2e-report (tests/e2e-report-app for a run against the app) and records whether it passed, at the versions it ran. A run against the prototype is what approving the feature waits for: approval is refused unless the latest one passed on the versions being approved. Refused when the feature changed while the tests ran.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes |  |
| `target` | string | yes | 'prototype', or the app's address. |
| `passed` | boolean | yes |  |
| `steps` | integer | yes |  |
| `failed` | integer | yes |  |
| `report` | string | yes | The run's report, Markdown. |
| `ran` | object |  | The versions the run played: { screens: { <page id>: <version> }, feature: <Gherkin page version> }. |

## `wave_reopen_flow`

Unlocks an approved feature so its screens show their latest versions again (and screens can be added or removed). It needs approving again afterwards. Only when the engineer or designer asks to change an approved feature itself; a new feature that changes a shared screen does not need it.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes |  |

## `wave_save_api`

Saves the feature's mock API: an OpenAPI 3 document (JSON or YAML; stored as JSON) and/or mock files (response bodies by operationId, which replace that operation's first success example). Wave checks the document, then rewrites the feature's Data requirements page and reports what the screens read or call that the API does not serve. Operations connect to screens through x-wave-provides (the data root a GET returns, e.g. order for data-wave-bind="order/total") and x-wave-effect (the data-wave-effect an action names, e.g. api/orders/place). Give several responses (or named examples) to let the prototype's Scenarios menu play errors. A mock given as null removes it.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes | The feature (flow) folder's id. |
| `openapi` | string |  | The OpenAPI document as JSON or YAML text. |
| `mocks` | object |  | { operationId: response body (JSON value or JSON text) } |

## `wave_save_brief`

Saves a project's DESIGN.md (kind design, at the project root) or a feature's FEATURE.md (kind feature, in the feature folder). The front matter must be valid YAML between --- lines; anything else wrong is saved and listed so you can fix it. Show the designer the file and get their agreement before saving.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `kind` | "design" \| "feature" | yes | design: the project's DESIGN.md. feature: a feature's FEATURE.md. |
| `id` | string | yes |  |
| `markdown` | string | yes | The whole file. |

## `wave_screen_usage`

Which features show a screen (where it lives, which use it) and which of them are approved and locked at which version. Call it before changing a screen: say to the engineer what the change does to each feature, then make the change on top of the latest version.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `screen_id` | string | yes |  |

## `wave_test_bundle`

For wave-test (Wave's test runner) through an upload link, not for reading in a conversation: everything a run of the feature's end-to-end tests needs, as JSON. The Gherkin (tests/flow-feature) and its version, every screen's HTML, slug, route and version, the start screen, the mock API, and the design system's variants.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes | The feature (flow) folder. |

## `wave_upgrade_prefix`

Rewrites a file's older data-pi-* / pi: names to data-wave-* / wave:, changing nothing else. Returns the new HTML.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `html` | string | yes | The screen's complete HTML. |

## `wave_use_screen`

Adds a screen that lives in another feature of the same project to this feature, so both show the same screen (one identity, one address, one version history). Changing it later makes a new version: features approved and locked at an older version keep theirs, open ones show the new one. Refused while this feature is locked.

| Input | Type | Required | Meaning |
| --- | --- | --- | --- |
| `feature_id` | string | yes |  |
| `screen_id` | string | yes |  |
| `remove` | boolean |  | true to stop using it. |
