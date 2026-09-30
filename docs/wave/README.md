# Wave SDK

New to Wave? Start with the [user manual](MANUAL.md).

Wave is the HTML mockup review engine: a devtools-like inspector over a
mockup, element-anchored comments, spec attributes written into the HTML
(`data-wave-*`), flow approval, and a handover package for Claude Code.

Wave is not an app. It has no users, no login and no database of its own. It
is a set of packages a product imports, and that product (the **host**)
supplies identity, permissions, storage and comments. Post-it is the first
host. Lighter can be the second: see [lighter.md](lighter.md).

## Packages

All live in the Post-it monorepo under `packages/wave-*`, shipped as
TypeScript source (no build step), like `@postit/renderer`.

| Package | What it is | Runs in |
| --- | --- | --- |
| `@wave/spec` | The vocabulary (`data-wave-*`, `wave:` meta, `wave-resources`), the parser and validator, byte-exact HTML edits, DTCG tokens, off-token CSS, flow analysis (graph, data dictionary, actions, states, checks), handover and zip. `@wave/spec/client` is the browser-safe subset. | Anywhere |
| `@wave/inspector` | The script injected into the sandboxed review frame, and the typed `wave:*` postMessage protocol (`readMessage`, `PROTOCOL_VERSION`). `injectInspector(html, src)`. | Frame + host |
| `@wave/server` | The engine: `recordScreenVersion`, `loadScreenView`, `editScreen`, `flowOverview`, `approveFlow`, `flowHandover`, and `createWaveHandlers`, a Request to Response HTTP API. Written against the `WaveHost` interface. | Server |
| `@wave/db` | Wave's tables and functions for Postgres (`sql/schema.sql`), the host contract they call (`sql/host-contract.sql`), and `supabaseWaveStore(db)`. | Postgres / Supabase |
| `@wave/react` | The review UI: `ReviewApp`, `Compare`, `FlowOverview`, `FlowToggle`, `FlowApproval`, `TokenInventory`, `WaveProvider`, and `wave.css`. | Browser (React 18+) |
| `@wave/mcp` | Agent tools: `mark_addressed`, `set_flow`, `check_screen`, `get_handover`, `get_handover_screen`. Plain definitions a host adds to its MCP server. | Server |
| `@wave/prototype` | Prototypes: reads an OpenAPI 3 document (JSON or YAML) and mock files into what the prototype serves (`readApi`), drafts one from screens (`generateApi`), checks coverage and writes the data requirements page, and the runtime added to each screen (`PROTOTYPE_SOURCE`, `injectPrototype`): an MSW mock server running in the sandboxed frame, plus the bindings that turn `data-wave-*` into a working screen. The frame/viewer messages are in `@wave/prototype/protocol`. | Server + frame |
| `@wave/skills` | The Claude Design skills (Wave Design, the router; Wave Brief; Wave Design System; Wave Feature; Wave Review) and Wave Build (Claude Code), with host-specific steps passed in. | Anywhere |

## How it fits together

```
  Claude Design ──MCP──▶ host tools (publish HTML)  +  @wave/mcp (mark_addressed, check_screen)
                                   │
                                   ▼
  host storage ◀── WaveHost ──▶ @wave/server ──▶ createWaveHandlers ──HTTP──▶ @wave/react
  (files, users,     adapter        │                                         (ReviewApp in the
   permissions,                     ▼                                          host's page)
   comments)                  WaveStore (@wave/db)                                 │
                                                                     sandboxed iframe + @wave/inspector
  Claude Code ──MCP──▶ @wave/mcp get_handover ◀── approved flow
```

- A **screen** is one HTML mockup the host stores, with a version number.
- A **flow** is a container of screens (a folder in Post-it) reviewed and
  approved together. It may also hold a DTCG token file.
- Every save of a screen, through any door, ends in `recordScreenVersion`,
  which keeps a copy of those bytes and an index of what the spec says.
- Comments belong to the host. Wave reads them, anchors them (`CommentAnchor`)
  and shows them; the host stores them and enforces who may change status.

## The host contract

A host implements `WaveHost` (in `@wave/server/host`), made once per request
for the person asking:

```ts
type WaveHost = {
  viewer: { id: string; label: string | null } | null;
  resources: {
    screen(id), readCurrent(screen), save(id, html, baseVersion),
    flowOf(screenId), flow(id), setFlow(id, isFlow), members(flowId),
    canEdit(id), isAuthor(screenId), extras?(screen),
  };
  comments: { list(screenId), statuses(screenIds), setStatus?(id, status, note, version) };
  blobs: { putSnapshot(screenId, version, html), read(key), remove(key) };
  store: WaveStore; // Wave's own tables; supabaseWaveStore(db) on Supabase
  // Optional:
  projects?, assets?,
  documents?: { read(folderId, name), write(folderId, name, markdown) }, // question sheets, DESIGN.md ("design-md"), FEATURE.md ("feature-md")
  api?: { read(folderId), write(folderId, { openapi?, mocks?, requirements? }) }, // a feature's mock API files
  links?: { screen(id), prototype(flowId) },                                     // links agents hand out
  // and resources.put?(folderId, name, html) to publish a whole flow at once
};
```

Rules the host is trusted with, because Wave never decides them itself:

1. Answer only what `viewer` may see. A screen they cannot read is `null`.
2. `save` refuses when `baseVersion` is not current, and calls
   `recordScreenVersion` after saving (as every other save path does).
3. `members(flowId)[i].approved_current` is true only when the member is
   approved at the version it is at now, by the host's own review.
4. `comments.setStatus` enforces: the author marks addressed (with a note and
   version); somebody else resolves or reopens.

On Postgres, `@wave/db` also asks the host database seven questions
(`wave_current_user`, `wave_can_read`, `wave_can_edit`, `wave_user_label`,
`wave_flow_members`, `wave_approval_refusal`, `wave_open_comment_count`); RLS
on Wave's tables and `wave_approve_flow` use them. Post-it's answers are in
`supabase/migrations/20260928100000_wave.sql`.

A complete host in about 150 lines, in memory, is
`packages/wave-server/test/memory-host.ts`. It is the best starting point for a
new one.

## Briefs: DESIGN.md and FEATURE.md

Most of what Wave asks about an element is the same for the whole project, or
for every element that writes the same field, shows the same data or takes
the same action. Two Markdown files with YAML front matter hold those
answers, and every element inherits them (`@wave/spec` `briefs.ts`,
`evaluateScreen`'s `design` and `feature` options):

- **DESIGN.md**, at the project root (`documents` name `design-md`): copy
  status and where copy lives, default access, analytics, flags, form
  behaviour, empty and overflow, icons, viewports, language; and the design
  language as prose.
- **FEATURE.md**, in the feature folder (`feature-md`): screens (route,
  title, access), fields (rules, options, default, visible-if), data (type,
  source, empty, format) and actions (trigger, effects, destinations,
  confirm, tracking).

An element's answer comes from, in order: its HTML, FEATURE.md, its catalogue
component (states, variants, events, responsive), DESIGN.md, and what Wave
is certain of (slugs, types, submit triggers). Each requirement records its
`source`. Applying answers writes FEATURE.md values and Wave's certain ones
into the HTML; DESIGN.md and components stay the policy, and both files go
into the handover. `wave_get_brief` and `wave_save_brief` read and save them.

## Prototypes

A flow plays as one prototype. The viewer (`PrototypeApp` in `@wave/react`)
loads `flows/:id/prototype` (screens, start screen, mock API, gaps) and frames
each screen from `screens/:id/prototype`, which is the screen with
`prototype.js` added first in its head and the same sandbox as review
(`sandbox allow-scripts allow-popups`, no `allow-same-origin`).

A service worker cannot register in an opaque origin, so the runtime does not
use `setupWorker`: it builds MSW request handlers from the OpenAPI operations
and answers the page's `fetch` through MSW's `getResponse`. The bundle
replaces MSW's cookie store (which reads `localStorage` when it loads, and
that throws in the sandbox) and sends MSW each request with
`credentials: "omit"` (MSW reads `document.cookie` otherwise). It never
touches storage.

The API connects to the screens through two extensions: `x-wave-provides`
(the data root a response fills, read by `data-wave-bind`, `-repeat`,
`-visible-if`) and `x-wave-effect` (the `data-wave-effect` that calls the
operation). `x-wave-delay` sets a response's delay. Responses with several
statuses or named examples become the viewer's scenarios.

## Mounting it

Server (any framework with standard Request and Response):

```ts
import { createWaveHandlers } from "@wave/server";
const wave = createWaveHandlers({ host: (req) => myHost(req), basePath: "/api/wave", build: GIT_SHA });
// Next:  export const GET = (req, { params }) => wave(req, params.path)   at app/api/wave/[...path]/route.ts
// Hono:  app.all("/api/wave/*", (c) => wave(c.req.raw, c.req.path.replace(/^\/api\/wave\//, "").split("/")))
```

Routes: `GET inspector.js`, `GET screens/:id`, `GET screens/:id/frame`,
`POST screens/:id/edit` (`set`, `wrap`, `unwrap`, `upgrade`), `GET|PATCH flows/:id`,
`POST flows/:id/approve`, `POST|DELETE flows/:id/waivers`,
`GET flows/:id/handover?format=zip|md|json`.

The frame is served with `sandbox allow-scripts allow-popups` and
`frame-ancestors 'self'`: the mockup runs in an opaque origin and can only talk
to the page by postMessage, and every message is validated by `readMessage`.

Browser:

```tsx
import "@wave/react/wave.css";
import { WaveProvider, ReviewApp } from "@wave/react";

<WaveProvider ui={{ api: "/api/wave", Link, navigate, back, refresh, hrefs, comments }}>
  <ReviewApp initial={view} initialNode={null} />
</WaveProvider>
```

Theme: map `--wave-bg`, `--wave-panel`, `--wave-text`, `--wave-muted`,
`--wave-border`, `--wave-accent`, `--wave-link`, `--wave-ok`, `--wave-warn`,
`--wave-bad`, `--wave-font-sans` to your own variables. `FlowOverview` outputs
the flow graph as `<pre class="mermaid">`; draw it with mermaid if you have it.

Post-it's adapter: `lib/wave-host.ts` (server), `lib/wave-ui.tsx` (browser),
`lib/wave.ts` (handlers), `app/api/wave/[...path]/route.ts` (mount).

## The vocabulary, and data-pi-*

Wave writes `data-wave-*`, `wave:` meta and `wave-resources`
(`application/wave+json`). Files written before the rename use `data-pi-*`,
`pi:` and `pi-resources`; they are read as exact aliases, edits keep the
file's own prefix, and `upgradePrefix(html)` (the review screen's "Upgrade to
data-wave-*" button, or `POST screens/:id/edit {op:"upgrade"}`) rewrites a file
to the current names byte for byte. The full reference is the Wave Design
skill.

## Testing

```
npx vitest run packages/wave-*   # engine on an in-memory host, spec, inspector, tools
./scripts/db-test.sh              # Wave's SQL and Post-it's host functions, under RLS
```
