# Roadmap and status

Where Wave is today, what it does not do yet, and what comes next. Updated
4 October 2026.

## Status

| Area | Status | Notes |
| --- | --- | --- |
| HTML spec (`data-wave-*`), parser, validator, byte-exact edits | Shipped | `data-pi-*` read as aliases, one-click upgrade |
| Briefs: DESIGN.md and FEATURE.md, inheritance | Shipped | Through MCP (`wave_get_brief`, `wave_save_brief`) |
| Element types and grouped questions, dry run | Shipped | Question sheet for product |
| Design system: DTCG tokens, specimens, catalogue, drift | Shipped | Specimen status is set in the specimen file |
| Review: inspector, anchored comments, versions, compare, flow approval | Shipped | |
| Handover to Claude Code, Wave Build skill | Shipped | zip, Markdown or JSON |
| Prototype on a mock API (OpenAPI + MSW), scenarios, shared links | Shipped, being extended | Generated API drafts and the data requirements page |
| Figma entry gate and `wave-figma` CLI | Shipped | First full feature converted and published (the Keel test project) |
| Figma flow as three interview skills, readiness report, upload links | Shipped on staging | Not yet run end to end in a fresh session |
| Design-system page and `design-system-ids` JSON, generated from the specimens | Shipped | `wave_design_system_page` |
| Shared screens across features | In progress | Schema to be reintroduced |
| Second host (Lighter) | Planned | See [[wave/hosting|Hosting Wave]] |
| Published packages | Planned | Wave ships as workspace source today |

## Known limits

| Limit | Effect | Plan |
| --- | --- | --- |
| `/api/wave` takes the browser session cookie only | Agents and scripts cannot call it directly | Agents use the MCP tools; a token scheme for the HTTP API |
| Briefs have no HTTP endpoint | DESIGN.md and FEATURE.md are read and written through MCP or as pages | Add `GET/PUT projects/{id}/brief` and `flows/{id}/brief` |
| Specimen approval is two steps | The designer approves the specimen page in review; the skill then writes `"status": "approved"` into the specimen | Read approval straight from the review state |
| `wave_open_comment_count` ignores shared screens | A flow using a shared screen can be approved with comments open on it | Count them once shared screens land |
| `wave_flow_screens` has no foreign-key cascade | Deleting a screen can leave a stale membership row | Add the cascade in a migration |
| The inspector's page-to-frame messages are not type-checked at the boundary | A wrong message is ignored, not reported | Typed `writeMessage` |
| `stay` and `none` are not destination kinds | An action that keeps the user on the screen is written as no `data-wave-to` | Add them to `Destination` |
| Middleware may replace the scripts' immutable cache header | `inspector.js` and `prototype.js` cache less well than they could | Exclude them in the matcher |
| The Figma flow runs on the engineer's machine | Needs Node 20+ and Playwright with Chromium locally | A hosted runner |
| Figma text kerning | Converted text can differ from Figma by a fraction of a pixel; fidelity scores read lower on text-heavy screens | Carry letter spacing exactly |

## Next

1. **Shared screens.** One screen used by several features, reviewed once,
   counted in every flow that uses it.
2. **Prototype.** Richer conditions, state across reloads, recorded journeys
   reviewers can replay.
3. **Specimen approval read from review**, and an HTTP API for briefs.
4. **Tokens for the HTTP API**, so tools other than MCP clients can call it.
5. **Lighter as the second host**, level 1 first (see [[wave/hosting|Hosting Wave]]).
6. **Published packages** with versions and a changelog.
