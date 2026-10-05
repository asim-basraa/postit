# Designing for Wave: the designer's guides

Wave turns a Figma file into real pages, a design-system catalogue and a
clickable prototype, exactly as drawn. It only takes a file it can convert
exactly, and the **entry gate** decides that: it reads the file and lists
everything Wave cannot take as it is, with a link to each layer.

These guides say how to draw so the gate passes the first time. Each one is
one part of the file:

- [[guides/designer/variables-and-tokens|Variables and tokens]]: Colours, numbers, collections, scopes: where every value comes from
- [[guides/designer/spacing-and-layout|Spacing and layout]]: Auto layout, gaps and padding, sizes, Hug and Fill, stacking
- [[guides/designer/typography|Typography]]: Text styles, their variables, fonts, text boxes
- [[guides/designer/effects-and-radius|Effects, radius, strokes and opacity]]: Shadows, blurs, borders, corners, transparency
- [[guides/designer/design-system|The design system]]: The design-system page, component sets, variants, descriptions
- [[guides/designer/instances|Using components on screens]]: Instances: what may change, what may not
- [[guides/designer/states-and-prototype|States and the prototype]]: Chosen looks, selects and menus, errors, prototype links
- [[guides/designer/screens|Screens]]: Frames, names, hidden layers, layer names
- [[guides/designer/checklist|Before you hand over]]: The checklist, and how to run the gate yourself

## The one idea behind all of it

**Every value is a token, and every look is drawn.** Wave writes a page from
what the file says, never from what it looks like. So:

- A colour, size, gap, radius, stroke, shadow or font size is bound to a
  **variable** (or comes from a style built from variables). A typed number is
  a guess Wave will not make.
- Every look a component can have is a **variant** you drew. Wave never
  invents a hover, a chosen chip, an open menu or an error message.
- Everything is placed by **auto layout**. A layer dragged into place becomes a
  pixel position that does not reflow.

## Blocking and advice

The gate sorts what it finds in two:

- **Blocking**: Wave refuses the file until it is fixed.
- **Advice**: Wave takes the file, but you should look (a hidden layer, a
  default layer name, a button without a prototype link).

Every rule, with its fix, is in [[reference/figma-entry-gate|Figma entry gate
rules]]. The short version for running the gate is the
[[figma-gate-guide|Figma gate guide]].
