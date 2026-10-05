# Wave Figma progress

Project **Keel**. Figma file "Keel - New File (Updated - 22:05)" (`OmgjhCFSzYeTIzZZTBQS5K`): design system page `28:129`, screens page `1:86`, flow start `28:398`.

## Where it stands (5 October 2026)

| Stage | Step | Status |
| --- | --- | --- |
| 1. Brief | DESIGN.md | Done (unchanged) |
| Entry gate | Design system page and screens | **Passes**: 0 blocking, 23 suggestions |
| 2. Design system | Tokens (331, from Figma's variables and styles) | Done: tokens page saved |
| 2. Design system | Specimens: 17 components, each matching Figma's render | Done |
| 2. Design system | Designer review of the 6 changed specimens | **Waiting for the designer** |
| 3. Feature | Screens, behaviour check, publish, Gherkin | To do, after the design system is approved |
| 3. Feature | Wave Test against the prototype | To do |

## Waiting for the designer

Review and approve in Post-it, comparing each with Figma (comment on anything that differs):

- Select (new Helper On/Off variants, Open state with its menu)
- Select option (new)
- Segmented control (now USD, EUR and GBP variants)
- Text field (new Optional variants)
- Stepper item (new Completed without connector)
- Option card

The other 11 components did not change and keep their earlier approval.

## Changes made in Figma (one-off, agreed with Asim)

- Select option rows: width bound to the new `size/select-option` variable (308), on the component's three variants and the 12 rows in the Select's menus. Nothing moved.
- Earlier: the six menu rows fixed at the component's width; Select's Show helper boolean became a Helper variant.

## Open

- Staging database: the `wave_test_runs` migration is not applied yet; needed before Wave Test can record a run (stage 3).

## Links

- Design system: keel/design-system/design-system
- Figma readiness report: keel/figma-readiness-report
- Entry gate: keel/figma-entry-gate
