# Wave SDK for Lighter

How Lighter would take Wave in, when Wave is ready as a product. Nothing in
Lighter has been changed; this is the plan and the reference for doing it.

Read [README.md](README.md) first for what Wave is and the host contract.

## Where Lighter starts from

Surveyed from the Lighter repo (read only):

| | Lighter today | What Wave expects |
| --- | --- | --- |
| Web | Next.js 14 app router, React 18 (`services/web`), inline styles on CSS variables from `lib/tokenCss.ts` | React 18+, a place to mount `ReviewApp`, `--wave-*` variables |
| API | Hono 4 (`services/api`), `createApp(deps)`, fetch-standard `app.fetch` | Any handler taking `Request` and returning `Response` |
| Data | SQLite through Drizzle, raw SQL migrations in `packages/db/migrations`, no RLS | A `WaveStore`: ten methods over three tables |
| Identity | None by decision; reviews gated by share tokens, comment author is typed-in text | A `viewer` per request, and "author" versus "reviewer" for comment status |
| Screens | JSON specs (json-render trees) in a git-backed `SpecStore`, immutable versions | HTML screens with versions |
| Flows | No group entity; `flow_links` between screens | A container of screens with members |
| Anchoring | Positional ids (`el-0`, `el-1`) picked from a `<select>` in `CommentsPanel` | Stable `data-wave-id`s, clicked in the page |
| Agents | No MCP server | Optional: `@wave/mcp` tools |

So Wave fits Lighter's stack (Next, React, a fetch-standard API, pnpm
workspaces of TypeScript source) but not yet its data. The real work is giving
Lighter HTML screens with stable ids, and deciding who a reviewer is.

## Three levels, each useful on its own

### Level 1: the spec only (`@wave/spec`)

Lighter renders its json-render specs to HTML for review and export anyway.
Have that renderer write Wave's vocabulary onto each element:

- `data-wave-id` from a **stable** element id in the spec, not the position.
  Positional ids change when an element is inserted, and every comment
  anchored after it would move. Give spec elements a persistent id
  (`n_` plus four or more lowercase letters or digits) once, and keep it.
- `data-wave-component` and `data-wave-variant` from the catalog component.
- `data-wave-content`, `data-wave-bind`, `data-wave-action`, `data-wave-to`
  wherever the spec knows them. `flow_links` map straight onto `data-wave-to`.
- `<meta name="wave:screen">` with the screen id, and `wave:tokens` naming the
  design-system token file.

Then `parseMockup(html)` validates what Lighter produced, and
`completenessChecks`, `flowGraph`, `dataDictionary` and `buildHandover` give
Lighter the same handover Post-it gives, with no other Wave package involved.

### Level 2: the inspector (`@wave/inspector`)

Replace the anchor `<select>` on the share page with clicking in the page:

1. Serve the screen's HTML from a Lighter route with
   `content-security-policy: sandbox allow-scripts allow-popups; frame-ancestors 'self'`,
   passed through `injectInspector(html, "/wave/inspector.js")`.
2. Serve `INSPECTOR_SOURCE` at that address.
3. In the share page, frame it and listen with `readMessage` (or `useFrame`
   from `@wave/react`). `wave:select` gives the node id, `wave:range` the
   words, `wave:region` an area. Store that as the comment's anchor
   (`CommentAnchor` from `@wave/spec/anchor`) in Lighter's own `comments` table.
4. Send `wave:pins` with Lighter's comments so they show on the page.

This keeps Lighter's comments, approvals and sign-offs exactly as they are.

### Level 3: Lighter as a full Wave host

Everything Post-it has: the review screen with its panel, attribute editing
written back into the HTML, versions and compare, flow overview, approval and
the Claude Code handover.

**Store.** Add three tables to `packages/db` in a new migration:
`wave_screen_versions (id, screen_id, content_version, snapshot_key, screen,
nodes, findings, extras, created_at, updated_at, unique(screen_id, content_version))`,
`wave_waivers (id, flow_id, check_key, message, note, created_by, created_at,
unique(flow_id, check_key))`, and `wave_flow_approvals (id, flow_id,
approved_by, approved_at, members, tokens, waivers)`, with JSON as text. Write a
`WaveStore` over them with Drizzle. `@wave/db`'s SQL is Postgres and
Supabase specific, so on SQLite the approval rules in `wave_approve_flow` move
into the store's `approve` in TypeScript: every member approved at its current
version, no open or addressed comment, a snapshot for every screen, then insert.
`packages/wave-server/test/memory-host.ts` is a working reference for all ten
methods.

**Blobs.** `putSnapshot`, `read`, `remove` over a directory beside `SPECS_DIR`
(`.lighter-wave/<screenId>/<version>-<uuid>.html`) or a blob table.

**Resources.** A screen is a Lighter screen at its current version, read as
rendered HTML (level 1). `save` is the one new idea: Wave edits the HTML
(attributes set in the review panel), so either Lighter screens become HTML
documents that Lighter stores, or `save` maps an attribute edit back onto the
json-render spec and creates the next spec version. The first is simpler and is
what Claude Design produces; the second keeps json-render as the source.
Decide this before anything else in level 3.

A flow needs an entity: a `flows` table with its screens, or a flow derived
from a starting screen and its `flow_links`. `members` returns the screens
(and the design-system token file as `kind: "tokens"`) with
`approved_current` from Lighter's `version_status` / sign-off at the current
version.

**Identity.** Wave needs `viewer` and "is this person the author". With
share tokens and typed-in names, the honest mapping is: a share link
identifies a reviewer session (`viewer = { id: share token, label: typed name }`),
and the author is whoever holds Lighter's internal (unshared) view. That keeps
the rule that the author marks a comment addressed and a reviewer confirms it,
without adding accounts. If Lighter later adds sign-in, `viewer` becomes the
user and nothing else in Wave changes.

**Mounting.**

```ts
// services/api/src/wave.ts
import { createWaveHandlers } from "@wave/server";
const wave = createWaveHandlers({ host: (req) => lighterWaveHost(req, deps), basePath: "/wave" });
app.all("/wave/*", (c) => wave(c.req.raw, c.req.path.replace(/^\/wave\//, "").split("/")));
```

The web app proxies `/wave/*` to the API, as `app/api/share/[token]/comments`
already does for comments, so the frame and the inspector stay same-origin with
the page. The share page renders
`<WaveProvider ui={lighterUi}><ReviewApp initial={view} initialNode={null} /></WaveProvider>`
with `hrefs` pointing at Lighter's routes and `comments` at Lighter's comment
endpoints. Map `--wave-*` to the token variables `tokenRootCss()` already emits.

**Agents (optional).** Lighter has no MCP server. If it adds one, register
`createWaveTools()` and run each tool with the host for the agent's session.
`@wave/skills`' `waveDesignSkill({ host: "Lighter", publish, review })` then
gives Claude Design the vocabulary with Lighter's own publishing steps.

## Getting the packages into Lighter

Wave lives in the Post-it repo today. For Lighter, in order of preference:

1. **Publish** `@wave/*` to GitHub Packages from the Post-it repo when Wave is
   ready, and depend on versions. Nothing to keep in sync by hand.
2. **Workspace link** during development: add the Post-it checkout's
   `packages/wave-*` to Lighter's `pnpm-workspace.yaml` (or `pnpm link`).
3. Copy, as a last resort.

Checks when wiring: Lighter's Next config already lists workspace packages in
`transpilePackages`; add the `@wave/*` ones. Wave's source uses extensionless
imports, which Lighter's `.js` to `.ts` `extensionAlias` does not affect. Wave
compiles under `strict`; run Lighter's `noUncheckedIndexedAccess` typecheck
over it once, and treat anything it finds as a Wave fix, not a Lighter one.

## Suggested order

1. Level 1 with stable spec element ids. Small, and useful by itself.
2. Level 2 on the share page. Better anchoring for existing comments.
3. Decide HTML-as-source versus spec-as-source, then level 3.
