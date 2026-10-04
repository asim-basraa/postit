# Figma entry gate

Not passed: 6 blocking items to fix in Figma, 21 advice. Nothing is converted until the blocking items are fixed and the gate is run again.

## Blocking

### Screen frame not named as the screen (4)

Name each screen's frame as the screen is called, in plain words (About you, Budget and timing): no numbers, sizes or separators like · — | /. The name becomes the screen's id, and every test id on the screen starts with it.

| In | Layer | Detail |
|---|---|---|
| Qualification Form — 01 · About you · DS · 1440 | [Qualification Form — 01 · About you · DS · 1440](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-398) `28:398` | "Qualification Form — 01 · About you · DS · 1440" |
| Qualification Form — 02 · Your project · DS · 1440 | [Qualification Form — 02 · Your project · DS · 1440](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-534) `28:534` | "Qualification Form — 02 · Your project · DS · 1440" |
| Qualification Form — 03 · Budget & timing · DS · 1440 | [Qualification Form — 03 · Budget & timing · DS · 1440](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-728) `28:728` | "Qualification Form — 03 · Budget & timing · DS · 1440" |
| Qualification Form — 04 · Qualified · DS · 1440 | [Qualification Form — 04 · Qualified · DS · 1440](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-897) `28:897` | "Qualification Form — 04 · Qualified · DS · 1440" |

### Select without an open state (2)

Add a State value Open to the select's component set and draw it: the field as it looks open, with its menu. Without it the prototype has nothing to open, and Wave does not invent a menu.

| In | Layer | Detail |
|---|---|---|
| Select | [Select](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-271) `28:271` | Select: State is Default, Filled, Focus, Disabled |
| Qualification Form — 03 · Budget & timing · DS · 1440 | [Select](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-1221) `28:1221` | Select: State is Default, Filled, Focus, Disabled |

## Advice

### Instance recoloured with variables (16)

Fine for an icon taking its parent's colour. If the colour is a state of the component, make it a variant instead.

| In | Layer | Detail |
|---|---|---|
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-156) `28:156` | Icon: strokes |
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-160) `28:160` | Icon: strokes |
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-164) `28:164` | Icon: strokes |
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-174) `28:174` | Icon: strokes |
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-178) `28:178` | Icon: strokes |
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-182) `28:182` | Icon: strokes |
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-186) `28:186` | Icon: strokes |
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-190) `28:190` | Icon: strokes |
| Button | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-194) `28:194` | Icon: strokes |
| Select | [Chevron](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-241) `28:241` | Icon: strokes |
| Select | [Chevron](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-250) `28:250` | Icon: strokes |
| Select | [Chevron](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-259) `28:259` | Icon: strokes |
| Select | [Chevron](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-268) `28:268` | Icon: strokes |
| Checkbox | [Check](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-284) `28:284` | Icon: strokes |
| Header | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-354) `28:354` | Icon: strokes |
| Stepper item | [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-379) `28:379` | Icon: strokes |

### Hidden layer (4)

Hidden layers are dropped. Delete it, or make the hidden look a variant.

| In | Layer | Detail |
|---|---|---|
| Select | [Helper](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-243) `28:243` |  |
| Select | [Helper](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-252) `28:252` |  |
| Select | [Helper](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-261) `28:261` |  |
| Select | [Helper](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-270) `28:270` |  |

### Button without a prototype link (1)

Add a prototype interaction so the prototype knows where it goes.

| In | Layer | Detail |
|---|---|---|
| Qualification Form — 03 · Budget & timing · DS · 1440 | [Button](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS/?node-id=28-1230) `28:1230` | Button |
