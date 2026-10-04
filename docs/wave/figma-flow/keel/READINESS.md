# Keel lead qualification: Figma readiness

Figma file: [open in Figma](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS). Every component, screen and layer below links to its node in the file.

**Not ready for Wave.** Wave converts a Figma file exactly as it is drawn, or not at all, so nothing from this file is used until the corrections below are made in Figma. Wave is not changed to fit a file, and nothing is redrawn by hand.

| | |
|---|---|
| Corrections that block | 2 layers, in 2 components or screens |
| Controls that do nothing in the prototype | 2 |
| Suggestions (optional) | 21 |

## What to change, in short

- **Select without an open state** (2): Add a State value Open to the select's component set and draw it: the field as it looks open, with its menu. Without it the prototype has nothing to open, and Wave does not invent a menu.

Fix a component's main component first: every instance of it on the screens changes with it, and many of the screen corrections below go away.

## Controls that do nothing in the prototype

Wave played each screen and clicked every control. These show no change, because the look they change to is not drawn in Figma: a chosen state, an open menu. Wave does not invent a look; draw it, and the prototype uses it.

| Screen | Control | What happens |
|---|---|---|
| Budget and timing | [Company size](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-1221) (select) | does not open: its component has no Open state with a Menu drawn |
| Budget and timing | [Add context](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-1230) (action) | nothing happens when it is clicked: it has no prototype link in Figma, and nothing it would show is drawn |

## Corrections by component and screen

Each link opens the layer in Figma.

### [Qualification Form — 03 · Budget & timing · DS · 1440](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-728)

- **Select without an open state**, 1 layer: [Select](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-1221) (Select: State is Default, Filled, Focus, Disabled).
- Suggestion: **Button without a prototype link**, 1 layer: [Button](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-1230) (Button).

### [Select](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-271)

- **Select without an open state**, 1 layer: [Select](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-271) (Select: State is Default, Filled, Focus, Disabled).
- Suggestion: **Instance recoloured with variables**, 4 layers: [Chevron](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-241) (Icon: strokes), [Chevron](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-250) (Icon: strokes), [Chevron](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-259) (Icon: strokes), [Chevron](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-268) (Icon: strokes).
- Suggestion: **Hidden layer**, 4 layers: [Helper](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-243), [Helper](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-252), [Helper](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-261), [Helper](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-270).

## Suggestions

These do not stop anything; they make the result closer to what was meant.

### [Button](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-197)

- Suggestion: **Instance recoloured with variables**, 9 layers: [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-156) (Icon: strokes), [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-160) (Icon: strokes), [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-164) (Icon: strokes), [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-174) (Icon: strokes), [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-178) (Icon: strokes), and 4 more.

### [Checkbox](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-286)

- Suggestion: **Instance recoloured with variables**, 1 layer: [Check](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-284) (Icon: strokes).

### [Header](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-357)

- Suggestion: **Instance recoloured with variables**, 1 layer: [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-354) (Icon: strokes).

### [Stepper item](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-386)

- Suggestion: **Instance recoloured with variables**, 1 layer: [Icon](https://www.figma.com/design/39lO3zxf1SU4lmjSGlljwS?node-id=28-379) (Icon: strokes).

## Next

When the corrections are made, tell the engineer. Wave checks the file again from the start, and this report is replaced by the new one.
