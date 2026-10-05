# Resume here (4 October 2026, evening)

Read `HANDOVER.md` for the rules and history; this page says where things
stand now and what comes next. Branch `claude/epic-bell-0fj70o`, also pushed
to `staging` (deployed from `a0df2a8`).

## Before anything

1. This environment must reach `post.staging.maqsoodlabs.com` (for
   `wave-figma send`) and `www.figma.com` (Figma asset files). Check both with
   one request each; if either is refused, stop and say so.
2. The staging database (`postit-staging`, `xtabecsqvvgitblwmftr`) is missing
   `supabase/migrations/20261005100000_wave_test_runs.sql`. Applying it through
   the Supabase connector was cancelled three times (its confirmation prompt
   does not reach Asim from a cloud session); Asim applies it in the SQL
   editor. Check with `select to_regclass('public.wave_test_runs')`. Until it is
   there, Wave Test cannot record a run and no feature can be approved.
   The three skill migrations (behaviour check, testing, figma gate) need not
   be applied: every skill page on staging already matches the repo exactly.

## Keel, where it stands

- Figma file: `OmgjhCFSzYeTIzZZTBQS5K` ("Keel - New File (Updated - 22:05)"),
  design system page `28:129`, screens page `1:86`, flow start `28:398`.
- The entry gate **passes** (`keel/gate.v7.json`: 0 blocking, 23 advice). Two
  one-off edits were made in Figma with Asim's approval (see the gate.v7
  commit): the Select option rows fixed at 308, and Select's Show helper
  boolean replaced by a Helper variant property (Off/On).
- Staging still has Keel's 3 October specimens and screens, from the older
  file `39lO3zxf1SU4lmjSGlljwS`: no test ids, no `tests/flow-feature`, no run,
  not approved. FEATURE.md has no `sample` values. No **Wave Figma progress**
  page yet.

## Next, in order (Asim approved all of it)

1. Stage 2 on the 22:05 file (skill `wave-figma-design-system`): tokens and
   fonts, then every specimen again (Select, Select option and Segmented
   control changed; check the rest), fidelity, publish with `wave-figma send`,
   `wave_design_system_page`, ask for review, write the progress page. The
   designer approves the specimens; never approve for them.
2. Stage 3 (skill `wave-figma-feature`): convert the four screens again,
   behaviour check, publish (test ids and the Gherkin come from publishing).
   **Asim's instruction for the FEATURE.md interview: do not ask him. Scan each
   screen and enter acceptable made-up values as each field's `sample`; write
   the same values as a test input data page and upload it to the Keel
   feature; every end-to-end run uses that data.**
3. Wave Test against the prototype with that data, publish the E2E report.
   Recording the run needs the migration above.

## Also open

- The empty folder `keel/skills` in the Design space on staging (id
  `0c8d1f7f-8f2f-4835-aa11-3c42408d5443`) should be deleted; the connector has
  no delete tool and the SQL delete was cancelled at its confirmation.
