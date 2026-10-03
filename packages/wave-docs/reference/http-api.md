# HTTP API

_Generated from the code by `@wave/docs`. Do not edit by hand: change the code and generate again._

The HTTP API of Wave's engine (`@wave/server` `createWaveHandlers`), as Post-it mounts it at `/api/wave`, plus the public asset and share routes and the Post-it endpoints Wave's review UI uses.

**Authentication.** `/api/wave/*` and `/api/v1/*` use the host's browser session (in Post-it, the Supabase session cookie). Nobody signed in gets 404, never 401. Agents use the MCP server (`/api/mcp`, bearer MCP token) and its tools instead; see MCP tools. The two scripts, the asset route and the share routes are public.

**Errors.** JSON errors are `{ "error": string }` (the handover adds `blockers`); HTML and file routes answer `Not found.` as plain text. Permissions come from the host's row-level security: refused is 403, a stale version or a rule is 409.

**Versions.** Screens are versioned; edits send the version they were made against and get 409 when it is no longer current.

The full OpenAPI 3.1 document is the [[wave/reference/openapi|openapi]] page (JSON); import it into any OpenAPI tool. Base URL on staging: `https://web-staging-347f.up.railway.app`.

## Scripts

The inspector and prototype runtimes, served to sandboxed frames.

### `GET /api/wave/inspector.js`

The review-frame inspector script. **Public.**

Parameters: `b` (query): Build id; busts caches..

Responses: **200** The script.

### `GET /api/wave/prototype.js`

The prototype runtime (MSW mock server and bindings). **Public.**

Parameters: `b` (query).

Responses: **200** The script.

## Screens

One screen: what the review shows, its frames, and edits.

### `GET /api/wave/screens/{id}`

Everything the review screen shows.

Parameters: `id` (path, required): The screen's page id.; `v` (query): A version number; the current version when left out..

Responses: **200** OK; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `GET /api/wave/screens/{id}/frame`

The screen's HTML with the inspector added.

Parameters: `id` (path, required): A page or folder id (uuid).; `v` (query): A version number; the current version when left out..

Responses: **200** Sandboxed review frame; **404** Not found..

### `GET /api/wave/screens/{id}/prototype`

The screen's HTML with the prototype runtime added.

Parameters: `id` (path, required): A page or folder id (uuid).; `v` (query): A version number; the current version when left out..

Responses: **200** Sandboxed prototype frame; **404** Not found..

### `POST /api/wave/screens/{id}/edit`

Write a change into the screen's HTML, as a new version. Only the screen's uploader, at its current version. Changes are byte-exact: one start tag or one text run.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `EditRequest`.

Responses: **200** OK; **400** Invalid request; **403** Only the uploader can change a screen; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** The version is no longer current; **502** The file could not be read.

## Features

A feature (flow): overview, approval, waivers, dry run, prototype, mock API, publish, handover.

### `GET /api/wave/flows/{id}`

A feature at a glance.

Parameters: `id` (path, required): The feature folder's id..

Responses: **200** OK; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `PATCH /api/wave/flows/{id}`

Mark or unmark a folder as a feature.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ is_flow }`.

Responses: **200** OK; **400** is_flow must be true or false; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `POST /api/wave/flows/{id}/approve`

Approve the feature and lock it at these versions. Refused unless every screen is approved at its current version, no comment is open or addressed, nothing mandatory is open, and the caller is not the feature's creator. Pins every screen's version and snapshot, the tokens and the waivers.

Parameters: `id` (path, required): A page or folder id (uuid)..

Responses: **200** OK; **403** Refused; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** Mandatory fields are still missing, or a rule is not met.

### `POST /api/wave/flows/{id}/reopen`

Unlock an approved feature.

Parameters: `id` (path, required): A page or folder id (uuid)..

Responses: **200** OK; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** This feature is not approved and locked; **501** The host cannot reopen.

### `POST /api/wave/flows/{id}/waivers`

Waive a completeness check.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ key, note, message }`.

Responses: **201** OK; **400** key and note are required; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `DELETE /api/wave/flows/{id}/waivers`

Withdraw a waiver.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ key }`.

Responses: **204** Removed; **400** key is required; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `POST /api/wave/flows/{id}/dry-run`

Question sheet for draft screens (nothing uploaded). Saves the sheet as the feature's 'Wave questions' page, and 'Wave answers' once everything mandatory is answered or waived.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ screens, sheet }`.

Responses: **200** OK; **400** screens: [{name, html}] is required; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `GET /api/wave/flows/{id}/prototype`

What the prototype plays: screens, start screen, mock API.

Parameters: `id` (path, required): A page or folder id (uuid)..

Responses: **200** OK; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `POST /api/wave/flows/{id}/api`

Draft the feature's mock API from its screens.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ generate, save, overwrite }`.

Responses: **200** OK; **400** Send { generate: true }; **403** You cannot change this feature; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** No screens, locked, or a document exists and overwrite is not set; **501** The host keeps no API files.

### `PUT /api/wave/flows/{id}/api`

Save the feature's OpenAPI document and mock files. Rewrites the feature's Data requirements page. A mock given as null is removed.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ openapi, mocks }`.

Responses: **200** OK; **400** Invalid document or mock; **403** You cannot change this feature; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** The feature is locked; **501** The host keeps no API files.

### `POST /api/wave/flows/{id}/publish`

Publish a whole feature: every screen, then its API. Each screen is a new screen, or a new version of the one with the same name (a screen the feature uses from another feature is saved where it lives). A failure on one screen is reported in its row.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ screens, openapi, mocks }`.

Responses: **200** OK; **400** Every screen needs a unique name and html; **403** You cannot change this feature; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** Not a feature, or locked.

### `GET /api/wave/flows/{id}/handover`

The approved feature's handover.

Parameters: `id` (path, required): A page or folder id (uuid).; `format` (query): zip when left out..

Responses: **200** The handover; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** Not approved, or the approval is no longer current.

## Projects

A project's catalogue and asset store.

### `PATCH /api/wave/projects/{id}`

Mark or unmark a folder as a project. Marking creates design-system/ and design-system/components.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ is_project }`.

Responses: **200** OK; **400** A feature cannot also be a project; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `GET /api/wave/projects/{id}/catalogue`

The project's design system: components, usage, tokens, assets, screens.

Parameters: `id` (path, required): A page or folder id (uuid)..

Responses: **200** OK; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `POST /api/wave/projects/{id}/assets`

Upload an image or font to the project's asset store. Content-addressed by SHA-256: the same file is stored once (200, existing). Images: PNG, JPEG, GIF, WebP, AVIF, SVG, ICO. Fonts: WOFF2, WOFF, TTF, OTF. Up to 10 MB.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ data, name }`.

Responses: **200** Already stored; **201** Stored; **400** data is not valid base64; **403** Only an editor of the project can upload; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **413** Over 10 MB; **415** Not an image or font.

### `GET /a/{project}/{file}`

A project asset, public and immutable. **Public.**

Parameters: `project` (path, required); `file` (path, required): <sha256>.<ext>.

Responses: **200** The bytes, with the stored type. Cached for a year; CORS open; locked-down CSP.; **404** Not found..

## Tools

Authoring helpers over draft HTML; nothing is saved.

### `POST /api/wave/tools/assign-ids`

Give every element that needs one a data-wave-id.

Body: `ToolRequest`.

Responses: **200** OK; **400** html is required.

### `POST /api/wave/tools/preflight`

The last check before a screen is saved.

Body: `ToolRequest`.

Responses: **200** OK; **400** html is required.

### `POST /api/wave/tools/apply-answers`

Write answers into a draft's HTML.

Body: `ToolRequest + { sheet, answers }`.

Responses: **200** OK; **400** html is required.

## Sharing

Prototype share links and the public routes they open.

### `GET /api/v1/flows/{id}/prototype-links`

A feature's share links.

Parameters: `id` (path, required): A page or folder id (uuid)..

Responses: **200** OK; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `POST /api/v1/flows/{id}/prototype-links`

Create a share link (its URL is shown only here).

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ label, expires_in_days }`.

Responses: **201** OK; **400** expires_in_days must be between 1 and 365; **403** You cannot share this feature; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** Only a feature has a prototype.

### `DELETE /api/v1/prototype-links/{id}`

Revoke a share link.

Parameters: `id` (path, required): A page or folder id (uuid)..

Responses: **204** Revoked; **404** Not found, or already revoked.

### `GET /play/{token}/screens/{id}/prototype`

A shared prototype's frame (public, by token). Only a screen of the linked feature, at the version it plays. The viewer page is /play/{token}. **Public.**

Parameters: `token` (path, required); `id` (path, required): A page or folder id (uuid)..

Responses: **200** Sandboxed prototype frame; **404** Not found..

## Review

Post-it's page review and comments, which Wave's review UI uses.

### `POST /api/v1/nodes/{id}/review`

Ask for review, approve, or clear a page's review. A screen approved at its current version is what a feature's approval checks.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ status }`.

Responses: **200** OK; **400** status must be in_review, approved, or null; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which).; **409** Refused.

### `GET /api/v1/nodes/{id}/comments`

A page's comments, anchored to elements.

Parameters: `id` (path, required): A page or folder id (uuid)..

Responses: **200** OK; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `POST /api/v1/nodes/{id}/comments`

Add a comment or a reply.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ body, parent_id, anchor, content_version }`.

Responses: **201** OK; **400** A comment is required; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `PATCH /api/v1/comments/{id}`

Change a comment's status, or move its anchor. Only the screen's author marks a comment addressed (with a note and the version that fixes it); somebody else resolves or reopens it.

Parameters: `id` (path, required): A page or folder id (uuid)..

Body: `{ status, note, version } or { anchor, version }`.

Responses: **200** OK; **400** Nothing to change; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

### `DELETE /api/v1/comments/{id}`

Delete a comment.

Parameters: `id` (path, required): A page or folder id (uuid)..

Responses: **204** Deleted; **404** Not found, not a screen or feature, or nobody signed in (Wave never says which)..

## Schemas

`Error`, `Counts`, `DraftScreen`, `ToolRequest`, `EditRequest`, `Finding`, `ScreenMeta`, `SpecNode`, `Requirement`, `ElementInfo`, `ScreenView`, `Waiver`, `Approval`, `FlowOverview`, `DryRunOutcome`, `ApiProblem`, `PrototypeView`, `PublishedScreen`, `Handover`, `Asset`, `CatalogueOverview`, `PreflightReport`, `PrototypeLink`, `CommentStatus`, `CommentAnchor`, `Comment`. Their fields are in the OpenAPI document; the TypeScript they come from is in [[wave/reference/types|Types]].
