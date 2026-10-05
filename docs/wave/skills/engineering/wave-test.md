---
name: Wave Test
description: Run a feature's end-to-end tests (its Gherkin, tests/flow-feature) against its prototype or the built app, publish the E2E report in Post-it, and explain each failure. A feature is approved only after a run against its prototype passes on the versions being approved. Use when someone asks to test a feature, its prototype or the app, or before asking a designer to approve a feature.
---

# Wave Test

A feature's Gherkin names every element by its test id
(`<screen>.<section>.<DS id>.<label>`, the `data-testid` on the element), so
the same scenarios run the prototype and the built app. Wave writes the happy
path when the feature is published; people may add scenarios after its marker
line. Nobody writes test code: the Gherkin runs on Wave's step library.

## Rules

- **Nobody runs a command but you.** You run `wave-test` and Post-it's tools,
  read the JSON they print, and explain the result in plain words.
- **Never make a test pass by changing what it tests.** Do not edit a screen,
  a step, FEATURE.md or a test id to get green. A failure is a finding: say
  what it is and whose it is.
- **If anything cannot be reached** (Post-it, the app, the command line), stop and
  say exactly what failed. Never take another route.
- **Keep it safe.** The upload link from `wave_upload_link` goes only into
  `wave-test --link`, never into a file, a page or a message.

## 1. What to run

Ask which feature (propose it from Post-it's tree) and against what: its
**prototype** (the default; what approval waits for) or the **app** at an
address (a built app, a staging deploy). `tests/testing` in the feature
says where every file is: the Gherkin (`tests/flow-feature`, a .feature
file; scenarios people add go after its marker line and Wave keeps them), each
screen's elements and test ids as a tree (`catalogue/<screen>`, JSON) and the
reports. Read the Gherkin: if Wave says it is not complete, it lists the gaps (a field
without a sample): those are answered in FEATURE.md (`wave_save_brief`, which
writes the Gherkin again), with the engineer, before running.

## 2. Run it

1. Get the command line once: `curl -sSfo wave-test.mjs <post-it>/wave/wave-test.mjs`, where `<post-it>` is the Post-it connector's address without `/api/mcp`.
   It needs Node 20+ and Playwright with Chromium (`npx playwright install
   chromium` if it is missing; ask before installing).
2. `wave_upload_link` for the feature's space.
3. `node wave-test.mjs run --link <link> --feature <feature id> --target prototype
   --record --screenshots e2e/ --report e2e/report.md`. For the app, `--target
   <address>` (each screen opens at its FEATURE.md route).

`--record` publishes the report as `tests/e2e-report` (`tests/e2e-report-app`
for the app) and records the run with the versions it played. A run reported
after the feature changed is refused: run again.

## 3. Read the result

The JSON lists each failed step with its line, test id and error, and the
screenshot. For each, say what happened and whose it is:

| What failed | Whose | What to do |
| --- | --- | --- |
| No element with a test id on the screen | The design, or the build | Look the id up in `catalogue/<screen>`. Prototype: the screen changed since the Gherkin was written; publish again so Wave writes it again. App: the build is missing the `data-testid` from the handover (`catalogue/<screen>.json` there) |
| A choice does not show as chosen, a select does not open | Figma (a look not drawn) or the build | Prototype: the readiness report for the designer. App: the build |
| Stays on a screen instead of moving on | FEATURE.md (an answer it refuses) or the action | Check the sample and the field's rules; check the action's destination |
| Not one of Wave's steps | The person who added the scenario | Rewrite it with Wave's steps (`wave-test steps` lists them) |

Give the report's link. When the prototype run passes, say the feature can go
to the designer for approval (the Gherkin is approved with the screens).

## Steps

| Step | Does |
| --- | --- |
| `Given I open the "<screen>" screen` | Prototype: plays that screen. App: opens its route |
| `When I click "<test id>"` | Clicks it |
| `When I fill "<test id>" with "<text>"` | Types into the field inside it |
| `When I choose "<test id>"` | Picks a chip, radio, checkbox, card or segment |
| `When I pick "<option>" in "<test id>"` | Opens a select and picks the option |
| `Then I am on the "<screen>" screen` | The screen's root is on the page |
| `Then "<test id>" shows "<text>"` | Its text contains the words |
| `Then "<test id>" is chosen` | A choice is selected |
| `Then "<test id>" is visible` / `is hidden` | |
