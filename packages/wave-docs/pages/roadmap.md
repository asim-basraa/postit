# Roadmap and status

Where Wave is today, what it does not do yet, and what comes next. Updated
5 October 2026.

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
| Figma flow as three interview skills, readiness report, upload links | Shipped | Not yet run end to end in a fresh session |
| Prototype states drawn in Figma: chosen looks, selects that open their drawn menu; gate rules and the behaviour check | Shipped | Keel's Figma file now passes the entry gate; its screens are next |
| Design-system page and `design-system-ids` JSON, generated from the specimens | Shipped | `wave_design_system_page` |
| End-to-end tests: test ids, per-screen JSON, the feature's Gherkin, Wave Test, approval waiting for a passing run, the handover check | Shipped | See [[testing|End-to-end tests]]. Happy path only so far |
| Visual QA of the built app against the approved screens | Planned | After the first app is built from a prototype |
| Shared screens across features | In progress | Schema to be reintroduced |
| Wave space: docs and skills, members only | Shipped | `skills/designer`, `skills/engineering` and `skills/gates` |
| Second host (Lighter) | Planned | See [[hosting|Hosting Wave]] |
| Published packages | Planned | Wave ships as workspace source today |

## Before production

Wave does not go to production until these are done.

| What | Why |
| --- | --- |
| **Specimen approval read from review.** The catalogue counts a component as approved when its specimen page is approved at its current version, and stops counting it when the page changes. Nobody writes `"status": "approved"` by hand. | Today approval is two steps: the designer approves the page, then the skill copies that into the specimen file. The copy is a write on the designer's behalf, and an edit after approval does not undo it. |

## Known limits

| Limit | Effect | Plan |
| --- | --- | --- |
| `/api/wave` takes the browser session cookie only | Agents and scripts cannot call it directly | Agents use the MCP tools; a token scheme for the HTTP API |
| Briefs have no HTTP endpoint | DESIGN.md and FEATURE.md are read and written through MCP or as pages | Add `GET/PUT projects/{id}/brief` and `flows/{id}/brief` |
| Specimen approval is two steps | The designer approves the specimen page in review; the skill then writes `"status": "approved"` into the specimen | Read approval straight from the review state (before production) |
| `wave_open_comment_count` ignores shared screens | A flow using a shared screen can be approved with comments open on it | Count them once shared screens land |
| `wave_flow_screens` has no foreign-key cascade | Deleting a screen can leave a stale membership row | Add the cascade in a migration |
| The inspector's page-to-frame messages are not type-checked at the boundary | A wrong message is ignored, not reported | Typed `writeMessage` |
| `stay` and `none` are not destination kinds | An action that keeps the user on the screen is written as no `data-wave-to` | Add them to `Destination` |
| Middleware may replace the scripts' immutable cache header | `inspector.js` and `prototype.js` cache less well than they could | Exclude them in the matcher |
| The Figma flow runs on the engineer's machine | Needs Node 20+ and Playwright with Chromium locally | A hosted runner |
| The behaviour check runs in the Figma flow only | Screens from Claude Design are not clicked through before publishing | Run it in the host's preflight |
| The prototype's select has no keyboard navigation | Arrow keys do not move through the menu; Escape closes it | Arrow keys and type-ahead |
| Generated scenarios cover the happy path only | Validation, failure outcomes and conditional fields are not written yet; people can add them after the marker line | More generated scenarios, one kind at a time |
| An approval does not freeze the Gherkin page by its content | Editing `tests/flow-feature` after approval is not caught by the approval check (publishing is refused while locked) | Compare the Gherkin's version in the approval check |
| A run's pass or fail is the runner's word | The run happens on the engineer's machine; the host records what it is told, with the versions it ran | A hosted runner |
| Runs against the app do not block anything | Only prototype runs gate approval | A release check in CI |
| Figma text kerning | Converted text can differ from Figma by a fraction of a pixel; fidelity scores read lower on text-heavy screens | Carry letter spacing exactly |

## Next

1. **More scenarios.** Validation, failure outcomes and conditional fields,
   written by Wave like the happy path.
2. **Shared screens.** One screen used by several features, reviewed once,
   counted in every flow that uses it.
3. **Prototype.** Richer conditions, state across reloads, recorded journeys
   reviewers can replay.
4. **Specimen approval read from review** (required before production), and
   an HTTP API for briefs.
5. **Tokens for the HTTP API**, so tools other than MCP clients can call it.
6. **Lighter as the second host**, level 1 first (see [[hosting|Hosting Wave]]).
7. **Published packages** with versions and a changelog.
