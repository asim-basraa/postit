# States and the prototype

Wave's prototype plays the screens in the browser: fields take typing, chips
can be chosen, selects open, buttons go to the next screen. It only shows looks
you drew. It never invents one.

## Choices: draw the chosen look

A **radio, checkbox, chip, segment, toggle, tab or option** needs a **State**
variant property with:

- a **chosen** value: **Selected**, **Checked** or **On**;
- a **not-chosen** value: **Default**, **Unchecked** or **Off**;

each drawn. The prototype swaps to the chosen look when it is picked. Without it,
"Choice without a chosen look" is refused. It is fine for the chosen look to be
the set's default (a currency switch whose first segment starts Selected).

## Selects: draw the open menu

A **select, dropdown, combo box or picker** needs:

- a State value **Open**, drawn: the field as it looks open, with its menu;
- in that variant, a layer named **Menu** holding at least two rows, each an
  **instance of one option component** whose State has **Selected** and
  **Default**.

The prototype opens that menu where you drew it, and the field takes its
**Filled** look with the option picked. Missing: "Select without an open
state", or "Select's open state without a usable menu". The menu can overlap
what is below it; do not use "First on top" stacking for that.

## Hover, focus, filled, error, disabled

Draw each as a State value on the component (Hover, Focus, Filled, Error,
Disabled). The catalogue shows all of them.

**Error messages**: a component whose Error variant shows a helper line takes
its words from a text property (Helper). Set the right message on each
instance on the screen, even while the instance shows Default: that is the
message the prototype shows when the field is wrong.

## Prototype links

- **Every button or link goes somewhere**: add a prototype interaction
  (Navigate to a screen, or Open link for a web address). Without one the
  prototype does not know where it goes (advice: "Button without a prototype
  link").
- **Change to** inside a component (a segment choosing its value, a field going
  to Focus) is fine: it is the component's own state, not a screen link.
- Navigate to the **screen's frame**, not to a frame inside it.

Gate rules: Choice without a chosen look, Select without an open state,
Select's open state without a usable menu, Button without a prototype link.
