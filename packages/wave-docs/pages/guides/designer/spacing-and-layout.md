# Spacing and layout

A browser places things with layout rules; Figma's auto layout is the same
idea. Wave turns auto layout into those rules, so a page reflows like the
design. Anything placed by hand becomes a fixed pixel position.

## Auto layout everywhere

- **Every frame with more than one layer uses auto layout**, and so does a frame
  whose single layer sits at an offset. "Layers placed by hand" is refused.
- **No groups.** A group places its layers absolutely. Replace it with an auto
  layout frame ("Group").
- **No offsets in absolute position.** A layer set to absolute position inside
  auto layout is fine only at 0,0 (an overlay that covers its parent). At any
  other offset it is a pixel position ("Absolute position with an offset"):
  let auto layout place it with alignment and padding instead.
- **Vectors are fine without auto layout**: a group of vector shapes (an icon,
  a logo) is exported as one SVG.

## Gaps and padding

- **Bind every gap and padding** (top, right, bottom, left, and the row gap of a
  wrapping layout) to a spacing variable. Zero needs nothing.

## Sizes: Hug, Fill, or a variable

Each layer's width and height is one of:

| Setting | When | Needs |
| --- | --- | --- |
| **Hug** | The layer is as big as its content | Nothing |
| **Fill** | The layer takes the space its parent gives | Nothing (but an instance may not Fill: see the instances guide) |
| **Fixed** | The layer is a set size | A **size variable** bound to it |

- A fixed size without a variable is refused ("Fixed size without a variable").
  This includes a **component's own size**: a variant in a component set that is
  Fixed (not Hug) needs its width or height bound too.
- **Min and max width and height** are sizes too: bind them to variables.
- **Text boxes** should Hug (auto width) or Fill; a text box with a typed fixed
  width is refused ("Text with a fixed width").

## Canvas stacking: Last on top

In auto layout's advanced settings, **Canvas stacking** stays on **Last on
top** (Figma's default). "First on top" becomes z-index numbers on the page,
which no variable can hold, and the gate refuses it. An open menu or popover
does not need it: draw it in its component's Open variant and Wave's prototype
lifts it above the page.

## Whole pixels

Keep positions and sizes on whole pixels. A frame at x 12.5 or 343.75 wide is
rounded differently by a browser and shows as a pixel difference (advice:
"Fractional position or size").

Gate rules: Layers placed by hand, Group, Absolute position with an offset,
Spacing without a variable, Fixed size without a variable, Text with a fixed
width, Canvas stacking first on top, Fractional position or size.
