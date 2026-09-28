# @wave/server

Wave's engine, written against the `WaveHost` interface (`src/host.ts`) so it
runs inside any product that supplies users, permissions, storage and comments.

| Module | What it does |
| --- | --- |
| `host` | `WaveHost`, `WaveStore` and the record types. |
| `versions` | `recordScreenVersion` (call after every save), `ensureVersion`, `versionHtml`, `describeFindings`. |
| `view` | `loadScreenView` (everything the review screen shows), `editScreen` (`set`, `wrap`, `unwrap`, `upgrade`, as a new version through the host), `readEditRequest`. |
| `flow` | `loadFlow`, `flowOverview`, `addWaiver`, `removeWaiver`, `approveFlow`, `flowHandover`. |
| `handlers` | `createWaveHandlers({ host, basePath, build })`: the HTTP API, Request in and Response out. |

`test/memory-host.ts` is a complete host in memory, and the reference for
writing a new one. See `docs/wave/README.md`.
