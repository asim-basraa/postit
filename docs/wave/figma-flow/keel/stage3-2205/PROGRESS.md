# Wave Figma progress

Project **Keel**. Figma file "Keel - New File (Updated - 22:05)" (`OmgjhCFSzYeTIzZZTBQS5K`): design system page `28:129`, screens page `1:86`, flow start `28:398`.

## Where it stands (5 October 2026)

| Stage | Step | Status |
| --- | --- | --- |
| 1. Brief | DESIGN.md | Done (unchanged) |
| Entry gate | Design system page and screens | **Passes**: 0 blocking, 23 suggestions |
| 2. Design system | Tokens (331, from Figma's variables and styles) | Done: tokens page saved |
| 2. Design system | Specimens: 17 components, each matching Figma's render | Done |
| 2. Design system | Designer review of 7 specimens | **Waiting for the designer** |
| 3. Feature | FEATURE.md (samples, Budget and timing, team size options) | Saved |
| 3. Feature | Screens: 4 converted, matching Figma, behaviour check passed | Ready, not published |
| 3. Feature | Publish, Gherkin, prototype | **Waiting for the design system approval** (Post-it's preflight refuses a screen that uses an unapproved component) |
| 3. Feature | Wave Test against the prototype | After publishing |

## Waiting for the designer

Review and approve in Post-it, comparing each with Figma (comment on anything that differs):

- Select (new Helper On/Off variants, Open state with its menu)
- Select option (new)
- Segmented control (now USD, EUR and GBP variants)
- Text field (new Optional variants; version 5: the field is no longer drawn inside a button, the look is unchanged)
- Stepper item (new Completed without connector)
- Option card
- Segment item (version 5: its Selected variant is now marked as the chosen look, so the currency switch shows a choice in the prototype; the look is unchanged)

The other 10 components did not change and keep their earlier approval.

## Lead qualification screens

| Screen | Difference from Figma | Behaviour check | Post-it preflight |
| --- | --- | --- | --- |
| About you | 0.083% | 6 controls pass | Waits on Stepper item, Text field |
| Your project | 0.16% | 13 controls pass | Waits on Stepper item, Option card |
| Budget and timing | 0.118% | 16 controls pass | Waits on Stepper item, Segmented control, Segment item, Select |
| Qualified | 0.445% (over the 0.25% mark) | Passes | Passes |

Qualified: the headline's "fi" is spaced differently by Figma and by the Geist web font; no CSS changes that. Same as the previous run.

Waived on Budget and timing: z-index 2, 3 and 4, the stacking order Figma's "first on top" canvas stacking gives two frames, so the open team-size menu covers the fields after it. Figma has no variables for stacking order.

## Changes made in Figma (one-off, agreed with Asim)

- Select option rows: width bound to the new `size/select-option` variable (308), on the component's three variants and the 12 rows in the Select's menus. Nothing moved.
- Earlier: the six menu rows fixed at the component's width; Select's Show helper boolean became a Helper variant.

## Open

- Staging database: the `wave_test_runs` migration is not applied yet; needed before Wave Test can record a run.

## Links

- Design system: keel/design-system/design-system
- Figma readiness report: keel/figma-readiness-report
- Entry gate: keel/figma-entry-gate
