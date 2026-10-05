# Figma gate: guide for designers

Wave turns a Figma file into a prototype only when the file passes its **entry
gate**. The gate reads the file (it never changes it) and lists what Wave
cannot take exactly as drawn. With the [[skills/gates/wave-figma-gate|Wave Figma Gate]]
skill you run it yourself, as often as you like, while you fix the file. When
it passes, the engineer runs the official gate on that version.

## Once

1. Claude (claude.ai or the Claude desktop app). No command line is needed.
2. The **Figma** connector in Claude, signed in with a Figma account that can
   open the file.
3. The **Post-it** connector in Claude, and membership of the Wave space (the
   skill) and of the space that holds your project. Ask the engineer.
4. In the Figma file: one page for the design system, and the screens on their
   own page (or pages).

## Say

> Run the Wave Figma gate for project `<project>` on `<design-system page link>`
> and `<screens page link>`

Copy each link from Figma with the page (or frame) selected, so it carries its
`node-id`. Claude asks for anything missing.

## What you get

- **PASS** or **FAIL**, with the number of blocking items and of advice.
- **What changed** since the project's last official gate: fixed, still open,
  new.
- **Blocking items**, by rule, each with how to fix it in Figma and a link to
  the layer. Every one must be fixed before Wave takes the file.
- **Advice**: optional improvements.

Fix the file in Figma, then say "run the gate again".

## Rules worth knowing

| The gate says | Fix it in Figma |
| --- | --- |
| Not bound to a variable (colour, size, gap, radius, stroke, effect) | Bind the variable, or set the layer to Hug or Fill |
| A fixed size without a variable, including a component's own size (a variant set to Fill in its component set still has one) and a min or max width or height | Bind the size to a size variable, or let the component Hug |
| Text without a text style | Apply the text style |
| A text style whose size, line height, letter spacing, family or weight is not a variable | Bind those values in the text style |
| Layers placed by hand | Auto layout |
| Canvas stacking first on top | Set Canvas stacking to Last on top in the auto layout settings (an open menu is still shown above the page) |
| Instance resized or restyled | An instance keeps its component's size and look; add a variant. A variant property bound to a variable (for the prototype) is fine |
| Boolean property shows or hides a part | Make it a variant property and draw the variant |
| Choice without a chosen look | A State with Selected (or Checked, On) and Default (or Unchecked, Off), each drawn |
| Select without an open state | State Open, drawn with a layer named Menu holding the options |

Every rule: [[reference/figma-entry-gate|Figma entry gate rules]].

## When it passes

Send the engineer the Figma file link, the prototype link and Claude's result
(PASS, 0 blocking, with its checksum). The engineer runs the official gate on
the same version and brings the file into Wave.

## Good to know

- Claude only reads the file. It never changes it, and it stops and says so if
  it cannot reach Figma, the file or Post-it.
- Your run is a self-check. The official result is the engineer's, published
  in the project as **Figma entry gate**.
