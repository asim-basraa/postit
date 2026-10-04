/**
 * Wave's HTTP API as an OpenAPI 3.1 document: the endpoints createWaveHandlers
 * serves (mounted by Post-it at /api/wave), the public asset and share routes,
 * and the Post-it endpoints Wave's review UI uses (page review, comments,
 * prototype links). Written from packages/wave-server/src/handlers.ts and the
 * types it returns; keep it in step with them.
 */

type Schema = Record<string, unknown>;
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const str: Schema = { type: "string" };
const num: Schema = { type: "number" };
const int: Schema = { type: "integer" };
const bool: Schema = { type: "boolean" };
const nullable = (s: Schema): Schema => ({ anyOf: [s, { type: "null" }] });
const arr = (s: Schema): Schema => ({ type: "array", items: s });
const obj = (properties: Record<string, Schema>, required: string[] = [], extra: Schema = {}): Schema => ({ type: "object", properties, ...(required.length ? { required } : {}), ...extra });
const map = (s: Schema): Schema => ({ type: "object", additionalProperties: s });
const enm = (...values: string[]): Schema => ({ type: "string", enum: values });

const json = (schema: Schema, description = "OK") => ({ description, content: { "application/json": { schema } } });
const err = (description: string) => json(ref("Error"), description);
const html = (description: string) => ({ description, content: { "text/html": { schema: str } }, headers: { "content-security-policy": { schema: str, description: "sandbox allow-scripts allow-popups; frame-ancestors 'self'" } } });
const body = (schema: Schema, required = true) => ({ required, content: { "application/json": { schema } } });
const idParam = (name = "id", description = "A page or folder id (uuid).") => ({ name, in: "path", required: true, schema: str, description });
const vParam = { name: "v", in: "query", required: false, schema: int, description: "A version number; the current version when left out." };
const ok = json(obj({ ok: { const: true } }, ["ok"]));
const notFound = err("Not found, not a screen or feature, or nobody signed in (Wave never says which).");

const cookie = [{ session: [] }];
const op = (summary: string, extra: Record<string, unknown>) => ({ summary, ...extra });

export const OPENAPI = {
  openapi: "3.1.0",
  info: {
    title: "Wave HTTP API",
    version: "1.0.0",
    summary: "Review, flows, projects, prototypes and handover for Wave mockups.",
    description: [
      "The HTTP API of Wave's engine (`@wave/server` `createWaveHandlers`), as Post-it mounts it at `/api/wave`, plus the public asset and share routes and the Post-it endpoints Wave's review UI uses.",
      "",
      "**Authentication.** `/api/wave/*` and `/api/v1/*` use the host's browser session (in Post-it, the Supabase session cookie). Nobody signed in gets 404, never 401. Agents use the MCP server (`/api/mcp`, bearer MCP token) and its tools instead; see MCP tools. The two scripts, the asset route and the share routes are public.",
      "",
      "**Errors.** JSON errors are `{ \"error\": string }` (the handover adds `blockers`); HTML and file routes answer `Not found.` as plain text. Permissions come from the host's row-level security: refused is 403, a stale version or a rule is 409.",
      "",
      "**Versions.** Screens are versioned; edits send the version they were made against and get 409 when it is no longer current.",
    ].join("\n"),
  },
  servers: [{ url: "https://post.maqsoodlabs.com", description: "Post-it" }, { url: "https://post.staging.maqsoodlabs.com", description: "Post-it staging" }],
  tags: [
    { name: "Scripts", description: "The inspector and prototype runtimes, served to sandboxed frames." },
    { name: "Screens", description: "One screen: what the review shows, its frames, and edits." },
    { name: "Features", description: "A feature (flow): overview, approval, waivers, dry run, prototype, mock API, publish, handover." },
    { name: "Projects", description: "A project's catalogue and asset store." },
    { name: "Tools", description: "Authoring helpers over draft HTML; nothing is saved." },
    { name: "Sharing", description: "Prototype share links and the public routes they open." },
    { name: "Review", description: "Post-it's page review and comments, which Wave's review UI uses." },
  ],
  paths: {
    "/api/wave/inspector.js": {
      get: op("The review-frame inspector script", { tags: ["Scripts"], security: [], parameters: [{ name: "b", in: "query", schema: str, description: "Build id; busts caches." }], responses: { 200: { description: "The script", content: { "text/javascript": { schema: str } } } } }),
    },
    "/api/wave/prototype.js": {
      get: op("The prototype runtime (MSW mock server and bindings)", { tags: ["Scripts"], security: [], parameters: [{ name: "b", in: "query", schema: str }], responses: { 200: { description: "The script", content: { "text/javascript": { schema: str } } } } }),
    },
    "/api/wave/screens/{id}": {
      get: op("Everything the review screen shows", { tags: ["Screens"], parameters: [idParam("id", "The screen's page id."), vParam], responses: { 200: json(ref("ScreenView")), 404: notFound } }),
    },
    "/api/wave/screens/{id}/frame": {
      get: op("The screen's HTML with the inspector added", { tags: ["Screens"], parameters: [idParam(), vParam], responses: { 200: html("Sandboxed review frame"), 404: { description: "Not found." } } }),
    },
    "/api/wave/screens/{id}/prototype": {
      get: op("The screen's HTML with the prototype runtime added", { tags: ["Screens"], parameters: [idParam(), vParam], responses: { 200: html("Sandboxed prototype frame"), 404: { description: "Not found." } } }),
    },
    "/api/wave/screens/{id}/edit": {
      post: op("Write a change into the screen's HTML, as a new version", {
        tags: ["Screens"],
        description: "Only the screen's uploader, at its current version. Changes are byte-exact: one start tag or one text run.",
        parameters: [idParam()],
        requestBody: body(ref("EditRequest")),
        responses: { 200: json(obj({ ok: { const: true }, version: int, id: str, changed: int }, ["ok", "version"])), 400: err("Invalid request"), 403: err("Only the uploader can change a screen"), 404: notFound, 409: json(obj({ ok: { const: false }, error: str, status: int, version: int }), "The version is no longer current"), 502: err("The file could not be read") },
      }),
    },
    "/api/wave/flows/{id}": {
      get: op("A feature at a glance", { tags: ["Features"], parameters: [idParam("id", "The feature folder's id.")], responses: { 200: json(ref("FlowOverview")), 404: notFound } }),
      patch: op("Mark or unmark a folder as a feature", { tags: ["Features"], parameters: [idParam()], requestBody: body(obj({ is_flow: bool }, ["is_flow"])), responses: { 200: ok, 400: err("is_flow must be true or false"), 404: notFound } }),
    },
    "/api/wave/flows/{id}/approve": {
      post: op("Approve the feature and lock it at these versions", { tags: ["Features"], description: "Refused unless every screen is approved at its current version, no comment is open or addressed, nothing mandatory is open, and the caller is not the feature's creator. Pins every screen's version and snapshot, the tokens and the waivers.", parameters: [idParam()], responses: { 200: ok, 403: err("Refused"), 404: notFound, 409: err("Mandatory fields are still missing, or a rule is not met") } }),
    },
    "/api/wave/flows/{id}/reopen": {
      post: op("Unlock an approved feature", { tags: ["Features"], parameters: [idParam()], responses: { 200: ok, 404: notFound, 409: err("This feature is not approved and locked"), 501: err("The host cannot reopen") } }),
    },
    "/api/wave/flows/{id}/waivers": {
      post: op("Waive a completeness check", { tags: ["Features"], parameters: [idParam()], requestBody: body(obj({ key: str, note: { type: "string", description: "Why this is acceptable. Required, not blank." }, message: str }, ["key", "note"])), responses: { 201: ok, 400: err("key and note are required"), 404: notFound } }),
      delete: op("Withdraw a waiver", { tags: ["Features"], parameters: [idParam()], requestBody: body(obj({ key: str }, ["key"])), responses: { 204: { description: "Removed" }, 400: err("key is required"), 404: notFound } }),
    },
    "/api/wave/flows/{id}/dry-run": {
      post: op("Question sheet for draft screens (nothing uploaded)", { tags: ["Features"], description: "Saves the sheet as the feature's 'Wave questions' page, and 'Wave answers' once everything mandatory is answered or waived.", parameters: [idParam()], requestBody: body(obj({ screens: arr(ref("DraftScreen")), sheet: { type: "string", description: "A previous sheet with answers filled in." } }, ["screens"])), responses: { 200: json(ref("DryRunOutcome")), 400: err("screens: [{name, html}] is required"), 404: notFound } }),
    },
    "/api/wave/flows/{id}/prototype": {
      get: op("What the prototype plays: screens, start screen, mock API", { tags: ["Features"], parameters: [idParam()], responses: { 200: json(ref("PrototypeView")), 404: notFound } }),
    },
    "/api/wave/flows/{id}/api": {
      post: op("Draft the feature's mock API from its screens", { tags: ["Features"], parameters: [idParam()], requestBody: body(obj({ generate: { const: true }, save: bool, overwrite: bool }, ["generate"])), responses: { 200: json(obj({ openapi: { type: "object", description: "An OpenAPI 3.1 document." }, requirements: { type: "string", description: "The Data requirements page (Markdown)." }, saved: nullable(arr(str)) })), 400: err("Send { generate: true }"), 403: err("You cannot change this feature"), 404: notFound, 409: err("No screens, locked, or a document exists and overwrite is not set"), 501: err("The host keeps no API files") } }),
      put: op("Save the feature's OpenAPI document and mock files", { tags: ["Features"], description: "Rewrites the feature's Data requirements page. A mock given as null is removed.", parameters: [idParam()], requestBody: body(obj({ openapi: { anyOf: [str, { type: "object" }], description: "JSON or YAML text, or the object." }, mocks: map({ anyOf: [str, { type: "object" }, { type: "null" }] }) })), responses: { 200: json(obj({ written: arr(str), problems: arr(ref("ApiProblem")) })), 400: err("Invalid document or mock"), 403: err("You cannot change this feature"), 404: notFound, 409: err("The feature is locked"), 501: err("The host keeps no API files") } }),
    },
    "/api/wave/flows/{id}/publish": {
      post: op("Publish a whole feature: every screen, then its API", { tags: ["Features"], description: "Each screen is a new screen, or a new version of the one with the same name (a screen the feature uses from another feature is saved where it lives). A failure on one screen is reported in its row.", parameters: [idParam()], requestBody: body(obj({ screens: arr(ref("DraftScreen")), openapi: { anyOf: [str, { type: "object" }] }, mocks: { type: "object" } }, ["screens"])), responses: { 200: json(obj({ screens: arr(ref("PublishedScreen")), api: nullable(obj({ written: arr(str), problems: arr(ref("ApiProblem")) })) })), 400: err("Every screen needs a unique name and html"), 403: err("You cannot change this feature"), 404: notFound, 409: err("Not a feature, or locked") } }),
    },
    "/api/wave/flows/{id}/handover": {
      get: op("The approved feature's handover", { tags: ["Features"], parameters: [idParam(), { name: "format", in: "query", schema: enm("zip", "md", "json"), description: "zip when left out." }], responses: { 200: { description: "The handover", content: { "application/zip": { schema: { type: "string", format: "binary" } }, "text/markdown": { schema: str }, "application/json": { schema: ref("Handover") } } }, 404: notFound, 409: json(obj({ error: str, blockers: arr(str) }, ["error", "blockers"]), "Not approved, or the approval is no longer current") } }),
    },
    "/api/wave/projects/{id}": {
      patch: op("Mark or unmark a folder as a project", { tags: ["Projects"], description: "Marking creates design-system/ and design-system/components.", parameters: [idParam()], requestBody: body(obj({ is_project: bool }, ["is_project"])), responses: { 200: ok, 400: err("A feature cannot also be a project"), 404: notFound } }),
    },
    "/api/wave/projects/{id}/catalogue": {
      get: op("The project's design system: components, usage, tokens, assets, screens", { tags: ["Projects"], parameters: [idParam()], responses: { 200: json(ref("CatalogueOverview")), 404: notFound } }),
    },
    "/api/wave/projects/{id}/assets": {
      post: op("Upload an image or font to the project's asset store", { tags: ["Projects"], description: "Content-addressed by SHA-256: the same file is stored once (200, existing). Images: PNG, JPEG, GIF, WebP, AVIF, SVG, ICO. Fonts: WOFF2, WOFF, TTF, OTF. Up to 10 MB.", parameters: [idParam()], requestBody: body(obj({ data: { type: "string", description: "Base64, with or without a data: prefix." }, name: str }, ["data"])), responses: { 200: json(obj({ asset: ref("Asset"), existing: { const: true } }), "Already stored"), 201: json(obj({ asset: ref("Asset"), existing: { const: false } }), "Stored"), 400: err("data is not valid base64"), 403: err("Only an editor of the project can upload"), 404: notFound, 413: err("Over 10 MB"), 415: err("Not an image or font") } }),
    },
    "/api/wave/tools/assign-ids": {
      post: op("Give every element that needs one a data-wave-id", { tags: ["Tools"], requestBody: body(ref("ToolRequest")), responses: { 200: json(obj({ html: str, added: int })), 400: err("html is required") } }),
    },
    "/api/wave/tools/preflight": {
      post: op("The last check before a screen is saved", { tags: ["Tools"], requestBody: body(ref("ToolRequest")), responses: { 200: json(ref("PreflightReport")), 400: err("html is required") } }),
    },
    "/api/wave/tools/apply-answers": {
      post: op("Write answers into a draft's HTML", { tags: ["Tools"], requestBody: body({ allOf: [ref("ToolRequest"), obj({ sheet: { type: "string", description: "A Markdown answer sheet; wins over answers." }, answers: map(str) })] }), responses: { 200: json(obj({ html: str, applied: arr(str), skipped: arr(obj({ qid: str, reason: str })), counts: ref("Counts") })), 400: err("html is required") } }),
    },
    "/a/{project}/{file}": {
      get: op("A project asset, public and immutable", { tags: ["Projects"], security: [], parameters: [{ name: "project", in: "path", required: true, schema: { type: "string", format: "uuid" } }, { name: "file", in: "path", required: true, schema: { type: "string", pattern: "^[0-9a-f]{64}\\.[a-z0-9]{2,5}$" }, description: "<sha256>.<ext>" }], responses: { 200: { description: "The bytes, with the stored type. Cached for a year; CORS open; locked-down CSP.", content: { "*/*": { schema: { type: "string", format: "binary" } } } }, 404: { description: "Not found." } } }),
    },
    "/api/v1/flows/{id}/prototype-links": {
      get: op("A feature's share links", { tags: ["Sharing"], parameters: [idParam()], responses: { 200: json(obj({ links: arr(ref("PrototypeLink")) })), 404: notFound } }),
      post: op("Create a share link (its URL is shown only here)", { tags: ["Sharing"], parameters: [idParam()], requestBody: body(obj({ label: str, expires_in_days: nullable({ type: "integer", minimum: 1, maximum: 365 }) }), false), responses: { 201: json(obj({ link: ref("PrototypeLink"), url: { type: "string", description: "https://<host>/play/<token>" } })), 400: err("expires_in_days must be between 1 and 365"), 403: err("You cannot share this feature"), 404: notFound, 409: err("Only a feature has a prototype") } }),
    },
    "/api/v1/prototype-links/{id}": {
      delete: op("Revoke a share link", { tags: ["Sharing"], parameters: [idParam()], responses: { 204: { description: "Revoked" }, 404: err("Not found, or already revoked") } }),
    },
    "/play/{token}/screens/{id}/prototype": {
      get: op("A shared prototype's frame (public, by token)", { tags: ["Sharing"], security: [], description: "Only a screen of the linked feature, at the version it plays. The viewer page is /play/{token}.", parameters: [{ name: "token", in: "path", required: true, schema: { type: "string", pattern: "^[A-Za-z0-9_-]{20,64}$" } }, idParam()], responses: { 200: html("Sandboxed prototype frame"), 404: { description: "Not found." } } }),
    },
    "/api/v1/nodes/{id}/review": {
      post: op("Ask for review, approve, or clear a page's review", { tags: ["Review"], description: "A screen approved at its current version is what a feature's approval checks.", parameters: [idParam()], requestBody: body(obj({ status: nullable(enm("in_review", "approved")) }, ["status"])), responses: { 200: json(obj({ status: nullable(enm("in_review", "approved")) })), 400: err("status must be in_review, approved, or null"), 404: notFound, 409: err("Refused") } }),
    },
    "/api/v1/nodes/{id}/comments": {
      get: op("A page's comments, anchored to elements", { tags: ["Review"], parameters: [idParam()], responses: { 200: json(obj({ comments: arr(ref("Comment")) })), 404: notFound } }),
      post: op("Add a comment or a reply", { tags: ["Review"], parameters: [idParam()], requestBody: body(obj({ body: str, parent_id: str, anchor: nullable(ref("CommentAnchor")), content_version: int }, ["body"])), responses: { 201: json(obj({ comments: arr(ref("Comment")) })), 400: err("A comment is required"), 404: notFound } }),
    },
    "/api/v1/comments/{id}": {
      patch: op("Change a comment's status, or move its anchor", { tags: ["Review"], description: "Only the screen's author marks a comment addressed (with a note and the version that fixes it); somebody else resolves or reopens it.", parameters: [idParam()], requestBody: body({ oneOf: [obj({ status: ref("CommentStatus"), note: str, version: int }, ["status"]), obj({ anchor: ref("CommentAnchor"), version: int }, ["anchor"])] }), responses: { 200: ok, 400: err("Nothing to change"), 404: notFound } }),
      delete: op("Delete a comment", { tags: ["Review"], parameters: [idParam()], responses: { 204: { description: "Deleted" }, 404: notFound } }),
    },
  },
  components: {
    securitySchemes: { session: { type: "apiKey", in: "cookie", name: "sb-<project-ref>-auth-token", description: "The host's browser session. In Post-it, the Supabase auth cookie set at sign-in." } },
    schemas: {
      Error: obj({ error: str }, ["error"]),
      Counts: obj({ mandatoryOpen: int, recommendedOpen: int, waived: int, answered: int, proposed: int }),
      DraftScreen: obj({ name: str, html: str }, ["html"]),
      ToolRequest: obj({ html: str, name: { type: "string", default: "screen" }, target: { type: "string", description: "A feature, folder or screen id that gives the project's tokens, catalogue and briefs." } }, ["html"]),
      EditRequest: {
        description: "One change, made against `version`.",
        oneOf: [
          obj({ op: { const: "set" }, version: int, pid: str, set: map(nullable({ type: "string", maxLength: 2000 })) }, ["op", "version", "pid", "set"]),
          obj({ op: { const: "wrap" }, version: int, pid: str, start: int, end: int, attrs: map(str) }, ["op", "version", "pid", "start", "end", "attrs"]),
          obj({ op: { const: "unwrap" }, version: int, pid: str }, ["op", "version", "pid"]),
          obj({ op: { const: "upgrade" }, version: int }, ["op", "version"]),
          obj({ op: { const: "answers" }, version: int, answers: { ...map({ type: "string", maxLength: 4000 }), description: "qid to answer; 'waive: <reason>' waives." } }, ["op", "version", "answers"]),
          obj({ op: { const: "unwaive" }, version: int, field: str, pid: nullable(str) }, ["op", "version", "field"]),
        ],
      },
      Finding: obj({ code: str, severity: enm("error", "warn", "info"), message: str, pid: str }, ["code", "severity", "message"]),
      ScreenMeta: obj({ spec: nullable(str), screen: nullable(str), flow: nullable(str), route: nullable(str), title: nullable(str), tokens: nullable(str), access: nullable(str), entry: nullable(str), viewports: nullable(str), track: nullable(str), waived: nullable(str), component: nullable(str), project: nullable(str), lang: nullable(str), hasViewportMeta: bool, resources: map(obj({ type: str, source: str, description: str })), documentTitle: nullable(str), prefix: nullable(enm("wave", "pi")) }),
      SpecNode: obj({ id: str, slug: nullable(str), tag: str, parent: nullable(str), ancestors: arr(str), text: str, attrs: map(str), html: map(str), classes: arr(str), label: nullable(str), hidden: bool, options: arr(str), iconHints: arr(str), repeatedChildren: int, childCount: int, formControl: bool, interactive: bool, order: int }),
      Requirement: obj({ qid: { type: "string", description: "screen/pid/field" }, screen: str, pid: nullable(str), address: nullable(str), type: str, field: str, label: str, question: str, tab: enm("identity", "styles", "content", "behavior", "inputs", "states"), owner: enm("design", "product"), level: enm("mandatory", "recommended"), status: enm("answered", "waived", "proposed", "missing"), value: nullable(str), proposal: nullable(obj({ value: str, tier: enm("set", "proposed"), reason: str })), waivedReason: nullable(str), choices: arr(str), source: enm("html", "design", "component", "feature", "auto") }),
      ElementInfo: obj({ pid: str, type: str, certain: bool, reason: str, slug: nullable(str), address: str, parent: nullable(str), parentAddress: nullable(str), component: nullable(str), variant: nullable(str), behaviours: arr(str) }),
      ScreenView: obj({
        node: obj({ id: str, name: str, path: str, content_version: int }),
        version: int,
        current: bool,
        screen: ref("ScreenMeta"),
        nodes: arr(ref("SpecNode")),
        findings: arr(ref("Finding")),
        versions: arr(obj({ content_version: int, created_at: str, updated_at: str })),
        comments: arr(ref("Comment")),
        canEdit: bool,
        viewerId: nullable(str),
        isAuthor: bool,
        flow: nullable(obj({ id: str, name: str, path: str, is_flow: bool, screens: arr(obj({ pageId: str, name: str, path: str, slug: str, route: nullable(str) })) })),
        vocabulary: map(arr(obj({ name: str, count: int }))),
        tokens: obj({ page: nullable(obj({ id: str, name: str, path: str })), list: arr(obj({ path: str, value: str, cssVar: str, type: nullable(str), normalised: nullable(str) })) }),
        host: { type: "object", description: "Anything the host adds; in Post-it, { review }." },
        report: nullable(obj({ elements: arr(ref("ElementInfo")), requirements: arr(ref("Requirement")), counts: ref("Counts") })),
        project: nullable(obj({ id: str, name: str, path: str })),
        assets: arr(obj({ url: str, kind: str, pid: str, status: enm("hosted", "external", "inline", "local", "other-project") })),
      }),
      Waiver: obj({ id: str, check_key: str, message: str, note: str, by_email: nullable(str), created_at: str }),
      Approval: obj({ id: str, approved_by_email: nullable(str), approved_at: str, members: arr(obj({ screen_id: str, name: str, path: str, content_version: int, snapshot_key: nullable(str) })), tokens: arr(obj({ resource_id: str, name: str, content_version: int, content: nullable(str) })), waivers: arr(obj({ key: str, message: str, note: str, by: nullable(str) })), reopened_at: nullable(str), reopened_by_email: nullable(str), current: bool, locked: bool }),
      FlowOverview: obj({
        flow: obj({ id: str, name: str, path: str, is_flow: bool }),
        screens: arr(obj({ pageId: str, name: str, path: str, slug: str, title: nullable(str), route: nullable(str), version: int, reviewStatus: nullable(enm("in_review", "approved")), approvedCurrent: bool, open: int, addressed: int, findings: int, errors: int, checks: int, mandatoryOpen: int, recommendedOpen: int })),
        tokens: nullable(obj({ id: str, name: str, path: str, version: int, approvedCurrent: bool, count: int })),
        unresolvedTokenRefs: arr(str),
        dictionary: arr(obj({ path: str, type: nullable(str), source: nullable(str), description: nullable(str), usages: arr(obj({ pageId: str, screen: str, pid: str, slug: nullable(str), kind: enm("bind", "repeat", "field", "condition") })) })),
        actions: arr(obj({ name: str, triggers: arr(str), effects: arr(str), to: arr(str), toFailure: arr(str) })),
        graph: obj({ mermaid: str, edges: arr(obj({ from: str, to: str, label: str, failure: bool })), deadEnds: arr(str), unreachable: arr(str) }),
        states: arr(obj({ component: str, states: arr(str) })),
        checks: arr(obj({ key: str, code: enm("no-action", "unbound-dynamic", "input-no-field", "unresolved-destination", "no-states", "off-token", "unidentified-control"), pageId: str, screen: str, pid: str, message: str, waiver: nullable(ref("Waiver")) })),
        waivers: arr(ref("Waiver")),
        approval: nullable(ref("Approval")),
        blockers: arr(str),
      }),
      DryRunOutcome: obj({ pass: bool, run: int, sheet: { type: "string", description: "The question sheet (Markdown)." }, answerSheet: nullable(str), counts: obj({ mandatoryOpen: int, recommendedOpen: int, answeredInSheet: int, invalid: int, waived: int }), written: obj({ questions: nullable(str), answers: nullable(str) }) }),
      ApiProblem: obj({ level: enm("error", "warning"), message: str }),
      PrototypeView: obj({
        flow: obj({ id: str, name: str }),
        screens: arr(obj({ pageId: str, version: int, slug: str, name: str, title: str, route: nullable(str), viewports: arr(int) })),
        start: nullable(str),
        api: nullable(obj({ title: str, base: str, operations: arr(obj({ id: str, method: enm("get", "post", "put", "patch", "delete"), path: str, summary: str, provides: arr(str), effects: arr(str), delay: nullable(int), params: arr(obj({ name: str, example: str })), responses: arr(obj({ status: int, name: str, description: str, body: {} })) })) })),
        sources: obj({ feature: bool, project: bool }),
        problems: arr(ref("ApiProblem")),
        requirementsId: nullable(str),
      }),
      PublishedScreen: obj({ name: str, id: nullable(str), version: nullable(int), created: bool, error: nullable(str), mandatoryOpen: int, issues: arr(str), usage: arr(str) }),
      Handover: obj({ flow: obj({ name: str, path: str, approvedBy: nullable(str), approvedAt: str }), specVersion: str, screens: arr(obj({ slug: str, name: str, title: nullable(str), route: nullable(str), version: int, file: str, nodes: arr(ref("SpecNode")) })), tokens: nullable(obj({ name: str, version: int, file: str })), dataDictionary: arr({}), actions: arr({}), flowGraph: obj({ mermaid: str, edges: arr({}) }), states: arr({}), decisions: arr(obj({ status: enm("resolved", "wont_fix"), screen: str, anchor: {}, body: str, note: nullable(str), author: nullable(str) })), waivers: arr(obj({ key: str, message: str, note: str, by: nullable(str) })), outstandingChecks: arr({}) }),
      Asset: obj({ hash: { type: "string", pattern: "^[0-9a-f]{64}$" }, ext: str, mime: str, bytes: int, name: str, url: str, created_at: str }),
      CatalogueOverview: obj({
        project: obj({ id: str, name: str, path: str }),
        tokens: obj({ pageId: nullable(str), count: int, typeCounts: map(int), problems: arr(obj({ path: str, message: str })) }),
        components: arr(obj({ name: str, id: str, type: nullable(str), description: nullable(str), variants: arr(str), states: arr(str), status: enm("proposed", "approved", "deprecated"), pageId: str, pagePath: str, version: int, problems: arr(str), usage: arr(obj({ screenId: str, screen: str, pid: str, address: str, component: str, variant: str, status: enm("match", "new-component", "new-variant", "drift", "unapproved") })) })),
        unknown: arr(obj({ component: str, usage: arr({}) })),
        assets: arr({ allOf: [ref("Asset"), obj({ usedBy: arr(obj({ screenId: str, screen: str })) })] }),
        screens: arr(obj({ id: str, name: str, slug: str, flow_id: nullable(str), mandatoryOpen: int })),
      }),
      PreflightReport: obj({ pass: bool, screen: str, issues: arr(obj({ code: str, level: enm("mandatory", "recommended"), message: str })), counts: obj({ mandatoryOpen: int, recommendedOpen: int, proposed: int, waived: int }), open: arr(ref("Requirement")) }),
      PrototypeLink: obj({ id: str, label: str, created_at: str, expires_at: nullable(str), revoked_at: nullable(str) }),
      CommentStatus: enm("open", "addressed", "resolved", "wont_fix"),
      CommentAnchor: {
        oneOf: [
          obj({ kind: { const: "node" }, pid: str, slug: str, text: str }, ["kind", "pid"]),
          obj({ kind: { const: "range" }, pid: str, start: int, end: int, quote: str, slug: str }, ["kind", "pid", "start", "end", "quote"]),
          obj({ kind: { const: "region" }, rect: obj({ x: num, y: num, w: num, h: num }), viewport: obj({ w: num, h: num }), covered: arr(str) }, ["kind", "rect", "viewport"]),
          obj({ kind: { const: "element" }, selector: str, fingerprint: obj({ tag: str, classes: arr(str), text: str, ancestor: nullable(str) }) }, ["kind", "selector", "fingerprint"]),
        ],
      },
      Comment: obj({ id: str, parent_id: nullable(str), author_id: str, author_email: str, body: str, created_at: str, deleted: bool, anchor: nullable(ref("CommentAnchor")), content_version: int, status: nullable(ref("CommentStatus")), status_note: nullable(str), status_version: nullable(int), status_by_email: nullable(str), status_at: nullable(str) }),
    },
  },
  security: cookie,
};
