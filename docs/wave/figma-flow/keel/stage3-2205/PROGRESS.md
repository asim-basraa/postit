# Wave Figma progress

Project **Keel**. Figma file "Keel - New File (Updated - 22:05)" (`OmgjhCFSzYeTIzZZTBQS5K`): design system page `28:129`, screens page `1:86`, flow start `28:398`.

## Where it stands (5 October 2026)

| Stage | Step | Status |
| --- | --- | --- |
| 1. Brief | DESIGN.md | Done (unchanged) |
| Entry gate | Design system page and screens | **Passes**: 0 blocking, 23 suggestions |
| 2. Design system | Tokens (331, from Figma's variables and styles) | Done: tokens page saved |
| 2. Design system | Specimens: 17 components, each matching Figma's render | Done |
| 2. Design system | Designer review of 8 specimens (Button again for its Icon variant) | **Approved** (Kinza; Button by Amina); design-system page rebuilt, 17 of 17 approved |
| 3. Feature | FEATURE.md | Saved |
| 3. Feature | 4 screens published (About you, Your project, Budget and timing v2; Qualified v4) | Done: Post-it preflight passes all four, behaviour check passes |
| 3. Feature | Gherkin (tests/flow-feature) | Written: happy path, 19 steps |
| 3. Feature | Wave Test against the prototype | **Passed** 19 of 19, recorded (report: tests/e2e-report) |
| 3. Feature | Designer review of the screens and the Gherkin, then approve the feature | **Waiting for the designer** |

## Waiting for the designer

Review in Post-it, comparing each screen with Figma, and approve (comment on anything that differs): About you, Your project, Budget and timing, Qualified, and the Gherkin (keel/lead-qualification/tests/flow-feature). Then approve the feature: the passing Wave Test run is on exactly these versions.

## Lead qualification screens

| Screen | Difference from Figma | Behaviour check | Post-it preflight |
| --- | --- | --- | --- |
| About you | 0.083% | 6 controls pass | Waits on Stepper item, Text field |
| Your project | 0.16% | 13 controls pass | Waits on Stepper item, Option card |
| Budget and timing | 0.118% | 16 controls pass | Waits on Stepper item, Segmented control, Segment item, Select |
| Qualified | 0.445% (over the 0.25% mark) | Passes | Passes |

Qualified: the headline's "fi" is spaced differently by Figma and by the Geist web font; no CSS changes that. Same as the previous run.

Budget and timing: the z-index waiver is gone. Two frames used Figma's "first on top" canvas stacking, which becomes z-index numbers no variable can hold; on Asim's instruction Claude set the form (28:795), its fields (28:796) and the team-size wrapper (28:854) to "last on top" in Figma, for the designer. Nothing moved, and the open team-size menu still shows above the page in the prototype. The entry gate now refuses "first on top" (rule layout.stacking), so a designer sees it before Wave does.

## Changes made in Figma (one-off, agreed with Asim)

- Budget and timing: canvas stacking set to Last on top on frames 28:795, 28:796 and 28:854 (was First on top). Nothing moved.

- Select option rows: width bound to the new `size/select-option` variable (308), on the component's three variants and the 12 rows in the Select's menus. Nothing moved.
- Earlier: the six menu rows fixed at the component's width; Select's Show helper boolean became a Helper variant.

## Open

- Staging database: `wave_test_runs` applied (5 October), so Wave Test can record runs.

## Links

- Design system: keel/design-system/design-system
- Figma readiness report: keel/figma-readiness-report
- Entry gate: keel/figma-entry-gate
