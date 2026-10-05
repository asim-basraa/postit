# The design system

Wave's catalogue is this file's **design-system page**. Each component on it
becomes a **specimen**: a page in Post-it that draws every variant, checked
pixel by pixel against Figma, which the designer approves. Screens may only use
approved components.

## The design-system page

- **One page holds every component** the screens use. A component kept on a
  screens page works, but is not in the catalogue (advice: "Component outside
  the design-system page").
- **No components from other libraries.** Bring them into this file
  ("Component from another library").

## Component sets

- **Give every component a description**: what it is for, when to use which
  variant, its motion. It becomes the catalogue entry engineers read
  ("Component without a description").
- **Give the component set auto layout**, with its gap and padding bound to
  spacing variables. It becomes the specimen page's canvas ("Component set
  without auto layout").
- **Each variant follows every other guide**: variables, text styles, auto
  layout, sizes bound or Hug.

## Variants, not on/off switches

**Anything that can be there or not is a variant.** An icon, a helper line, an
"Optional" label, a badge: make it a variant property (Icon = Yes / No,
Helper = On / Off) and draw each value. A boolean property that hides a layer
on an instance gives that instance a shape no specimen draws, and engineers
cannot build it from the catalogue ("Boolean property away from its default").

- Only text properties (the words), instance swaps and variant properties
  change per instance.
- When you **duplicate a variant**, check its text layers still use the
  component's text properties (the property icon beside the text in the right
  panel). A copied text that lost its property is fixed words.
- Name variant properties and values in plain words: `Type = Primary`,
  `State = Hover`, `Size = Half`.

## States

A **State** variant property is how Wave knows looks such as Hover, Focus,
Filled, Error, Disabled, Selected, Open. See
[[guides/designer/states-and-prototype|States and the prototype]] for what
each kind of control needs.

Gate rules: Component without a description, Component set without auto layout,
Boolean property away from its default, Component from another library,
Component outside the design-system page.
