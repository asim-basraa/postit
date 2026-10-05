# Effects, radius, strokes and opacity

## Shadows and blurs

- Use an **effect style** (Keel/shadow/focus-ring), or bind every part of the
  effect (colour, blur, spread, x and y offset) to variables. An effect with
  typed values is refused ("Shadow or blur without tokens").
- **No inner shadow under an inside stroke.** Figma draws the stroke on top of
  the inner shadow; a browser draws the shadow inside the border, so the two
  look different ("Inner shadow under an inside stroke"). Use one or the other:
  the stroke, or the inner shadow as the ring.

## Corner radius

- Bind every radius to a radius variable (`radius/md`, `radius/full`), all four
  corners ("Corner radius without a variable").

## Strokes

- Bind stroke widths to a border-width variable (`border-width/default`),
  including per-side strokes ("Stroke width without a variable").
- Inside, center or outside strokes are all fine.

## Opacity

- A layer's opacity is bound to an opacity variable (`opacity/disabled`), or the
  transparency goes in the colour variable itself ("Layer opacity without a
  variable"). 100% needs nothing.

Gate rules: Shadow or blur without tokens, Inner shadow under an inside stroke,
Corner radius without a variable, Stroke width without a variable, Layer
opacity without a variable.
