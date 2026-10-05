# Hosting Wave

Wave is not an app. It has no users, no login and no database of its own: a
**host** product imports its packages and supplies identity, permissions,
storage and comments. Post-it is the first host; Lighter is planned as the
second. This page is for the engineers who host it.

## Three levels, each useful on its own

| Level | Packages | What the host gets | What the host keeps |
| --- | --- | --- | --- |
| 1. The spec | `@wave/spec` | Validation of `data-wave-*` HTML, flow graph, data dictionary, completeness checks, a handover | Everything: its own review, comments, approval |
| 2. The inspector | `+ @wave/inspector` (and `useFrame` from `@wave/react`) | Clicking in the page to anchor comments on elements, words or regions; comment pins on the page | Its own comments table, approvals and sign-off |
| 3. A full host | `+ @wave/server`, `@wave/db`, `@wave/react`, optionally `@wave/mcp`, `@wave/prototype`, `@wave/skills` | The review screen, attribute editing written back into the HTML, versions and compare, flow overview, approval, prototype, catalogue, the Claude Code handover | Identity, permissions, storage, comments |

**Level 1.** Write Wave's vocabulary onto the HTML the host already renders:
a **stable** `data-wave-id` per element (never a position, or every comment
after an inserted element moves), `data-wave-component` and `-variant`, and
`data-wave-content`, `-bind`, `-action`, `-to` where known. Then
`parseMockup(html)`, `completenessChecks`, `flowGraph`, `dataDictionary` and
`buildHandover` work with no other Wave package.

**Level 2.** Serve each screen from a host route with
`content-security-policy: sandbox allow-scripts allow-popups; frame-ancestors 'self'`,
passed through `injectInspector(html, "/wave/inspector.js")`, and serve
`INSPECTOR_SOURCE` at that address. Frame it, listen with `readMessage` (or
`useFrame`), store `wave:select`, `wave:range` or `wave:region` as the
comment's `CommentAnchor`, and send `wave:pins` back. See
[[runtime|Runtime]] for every message.

**Level 3** is the rest of this page.

## The host contract

A host implements `WaveHost` (in `@wave/server/host`), made once per request
for the person asking:

```ts
type WaveHost = {
  viewer: { id: string; label: string | null } | null;
  resources: {
    screen(id), readCurrent(screen), save(id, html, baseVersion),
    flowOf(screenId), flow(id), setFlow(id, isFlow), members(flowId),
    canEdit(id), isAuthor(screenId), extras?(screen), put?(folderId, name, html),
  };
  comments: { list(screenId), statuses(screenIds), setStatus?(id, status, note, version) };
  blobs: { putSnapshot(screenId, version, html), read(key), remove(key) };
  store: WaveStore;                 // Wave's own tables; supabaseWaveStore(db) on Supabase
  projects?, assets?,
  documents?: { read(folderId, name, subfolder?), write(folderId, name, content, contentType?, subfolder?) }, // DESIGN.md, FEATURE.md, question sheets, the design-system page and its JSON, a feature's tests/
  api?: { read(folderId), write(folderId, { openapi?, mocks?, requirements? }) },
  links?: { screen(id), prototype(flowId) },
};
```

| Part | Answers | Post-it's answer |
| --- | --- | --- |
| `viewer` | Who is asking | The Supabase session user |
| `resources` | Screens and flows: read, save, membership, who may edit, who is the author | Pages and folders in a space |
| `comments` | The host's comments, and status changes | Post-it's comments table |
| `blobs` | Immutable snapshots of each version's bytes | The private `artifacts` bucket |
| `store` | Wave's own index tables (`WaveStore`) | `supabaseWaveStore(db)` |
| `documents` | DESIGN.md (`design-md`), FEATURE.md (`feature-md`), question sheets, the design-system page (`design-system`, Markdown) and `design-system-ids` (JSON); in a feature's `catalogue` subfolder each screen's test ids as a tree (`<screen>`, JSON); in its `tests` subfolder the Gherkin (`flow-feature`, content type `feature`), the testing instructions (`testing`), the run reports (`e2e-report`, `e2e-report-app`) and the Figma match log (`fidelity-report`) | Pages in the project and feature folders, and the feature's `catalogue/` and `tests/` folders |
| `projects.designSystemFolder` | Where the design-system page and its JSON go, and the address pages open at | The project's `design-system` folder; `/s/<space>/` |
| `api` | A feature's mock API files | Files in the feature's `api/` folder |
| `links` | Links agents hand out | Post-it page and prototype URLs |

**Rules the host is trusted with.** Wave never decides these itself:

1. Answer only what `viewer` may see. A screen they cannot read is `null`.
2. `save` refuses when `baseVersion` is not current, and calls
   `recordScreenVersion` after saving, as every other save path does.
3. `members(flowId)[i].approved_current` is true only when the member is
   approved at the version it is at now, by the host's own review.
4. `comments.setStatus` enforces that the author marks a comment addressed
   (with a note and version) and somebody else resolves or reopens it.

## Storage

On Postgres, `@wave/db` brings Wave's tables (`sql/schema.sql`) and asks the
host database eight questions (`sql/host-contract.sql`). Row level security on
Wave's tables and `wave_approve_flow` use them:

| Function | Answers |
| --- | --- |
| `wave_current_user()` | The signed-in user's id |
| `wave_can_read(resource)` | May they read this screen or flow |
| `wave_can_edit(resource)` | May they change it |
| `wave_user_label(user)` | A display name |
| `wave_flow_members(flow)` | The screens (and token file) in a flow, with `approved_current` |
| `wave_approval_refusal(flow)` | Why a flow cannot be approved yet, or null |
| `wave_open_comment_count(flow)` | Open or addressed comments on its screens |
| `wave_flow_test_page(flow)` | The flow's Gherkin page, its version and whether it is approved at it (for `test-runs.sql`) |

`sql/test-runs.sql` adds the test runs (`wave_test_runs`, `wave_record_test_run`,
`wave_latest_test_run`) and the approval that waits for a passing run; the
store's `recordTestRun` and `latestTestRun` call them.

Post-it's answers are in `supabase/migrations/20260928100000_wave.sql` (and
`wave_flow_test_page` in `20261005100000_wave_test_runs.sql`). On
another database (Lighter uses SQLite), create the same tables with JSON
as text and move `wave_approve_flow`'s rules into the store's `approve` in
TypeScript: every member approved at its current version, no open or addressed
comment, a snapshot for every screen, the Gherkin approved and the latest
prototype run passed on the current versions, then insert. The full table list is in
[[architecture|Architecture]].

A complete in-memory host in about 150 lines is
`packages/wave-server/test/memory-host.ts`. Start a new host from it.

## Mounting the API

`createWaveHandlers` is a plain `Request` to `Response` function, so it mounts in
any framework:

```ts
import { createWaveHandlers } from "@wave/server";
const wave = createWaveHandlers({ host: (req) => myHost(req), basePath: "/api/wave", build: GIT_SHA });

// Next (app/api/wave/[...path]/route.ts): export every method the handlers use
async function handle(req, { params }) { return wave(req, (await params).path); }
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE };

// Hono
app.all("/api/wave/*", (c) => wave(c.req.raw, c.req.path.replace(/^\/api\/wave\//, "").split("/")));
```

Keep the frame same-origin with the page that frames it (proxy `/api/wave/*`
if the API is a separate service). Every endpoint is in the
[[reference/http-api|HTTP API]] reference and the
[[reference/openapi|OpenAPI document]].

## Mounting the UI

```tsx
import "@wave/react/wave.css";
import { WaveProvider, ReviewApp } from "@wave/react";

<WaveProvider ui={{ api: "/api/wave", Link, navigate, back, refresh, hrefs, comments }}>
  <ReviewApp initial={view} initialNode={null} />
</WaveProvider>
```

`ui` gives Wave the host's router (`Link`, `navigate`, `back`, `refresh`), its
URLs (`hrefs`) and its comment endpoints (`comments`). The other screens are
`Compare`, `FlowOverview`, `FlowToggle`, `FlowApproval`, `ProjectToggle`,
`TokenInventory`, `CatalogueView` and `PrototypeApp`.

**Theme.** Map these to the host's own variables:

| Variable | Used for |
| --- | --- |
| `--wave-bg` | Page background |
| `--wave-panel` | Panels |
| `--wave-text` | Text |
| `--wave-muted` | Secondary text |
| `--wave-border` | Borders |
| `--wave-accent` | Selection, primary actions |
| `--wave-link` | Links |
| `--wave-ok`, `--wave-warn`, `--wave-bad` | Status |
| `--wave-font-sans` | Type |

`FlowOverview` writes the flow graph as `<pre class="mermaid">`; draw it with
mermaid if the host has it.

## Agents

Register `createWaveTools()` from `@wave/mcp` on the host's MCP server and run
each tool with the host for the agent's session. The full list is in
[[reference/mcp-tools|MCP tools]]. `@wave/skills` gives the skills with the
host's own steps passed in, for example
`waveDesignSkill({ host: "Lighter", publish, review })`. Post-it serves them
from its skills table, so `get_skill` returns them to Claude Design.


**For the Figma flow**, the host also needs a way for the `wave-figma` command
line on the engineer's machine to send files. Post-it's is `wave_upload_link`:
a short-lived token for the same person, pinned to one space, minted by the
connected session, used as `wave-figma send --link`. Serve the bundled command
line (`packages/wave-figma/scripts/build.mjs`) at an address the skills can
download it from, and set `figmaCli` in the host steps given to `@wave/skills`.
## Getting the packages

Wave ships as TypeScript source, with no build step. In order of preference:

1. **Publish** `@wave/*` to a package registry and depend on versions.
2. **Workspace link** during development: add `packages/wave-*` to the host's
   `pnpm-workspace.yaml`, or `pnpm link`.
3. Copy, as a last resort.

Add the `@wave/*` packages to Next's `transpilePackages`. Wave compiles under
`strict`; anything a stricter host typecheck finds is a Wave fix.

## The older vocabulary

Files written before the rename use `data-pi-*`, `pi:` meta and `pi-resources`.
They are read as exact aliases, edits keep the file's own prefix, and
`upgradePrefix(html)` (or `POST screens/{id}/edit {"op":"upgrade"}`) rewrites a
file to the current names byte for byte.

## Testing a host

```
npx vitest run packages/wave-*   # engine on an in-memory host, spec, inspector, tools
./scripts/db-test.sh              # Wave's SQL and the host functions, under RLS
```

Post-it's adapter, as a worked example: `lib/wave-host.ts` (server),
`lib/wave-ui.tsx` (browser), `lib/wave.ts` (handlers),
`app/api/wave/[...path]/route.ts` (mount).
