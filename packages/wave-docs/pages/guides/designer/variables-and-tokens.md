# Variables and tokens

Wave builds the project's **tokens** (a DTCG token file) from the file's
variables and its text and effect styles. A page uses only those tokens: a value
that is not a token cannot appear on a page.

## Do

- **Make a variable for every value you reuse**: colours, spacing, radii, border
  widths, sizes, opacities, font sizes, line heights, letter spacing, font
  families and weights.
- **Bind, do not type.** Select the property (fill, gap, padding, radius,
  width) and pick the variable. A typed value that happens to equal a variable is
  still a typed value.
- **Set each variable's scope** (Fill, Stroke, Gap, Corner radius, Width and
  height, Font size, and so on). The gate checks a property only when the file
  has variables for it, and the scope is how it knows which variables are for
  what. A spacing variable scoped to everything shows up in every picker.
- **Keep the variables in this file.** Wave reads this file's local variables.
- **Name variables by role**, with slashes for groups: `color/text/primary`,
  `space/4`, `radius/md`, `size/control-lg`. The names become the token names
  engineers use.

## Do not

- **Library variables from another file.** A value bound to a variable this file
  does not define is refused ("Variable from another file"). Make it local, or
  publish the tokens from this file.
- **A paint that no longer matches its variable.** If a fill draws #2F4BDB but
  its variable is now #1F36B0 (the variable changed and the layer was not
  refreshed), the gate refuses it ("Colour does not match its variable").
  Detach and bind again.
- **Gradients for anything that matters.** A gradient cannot be a token yet; it
  is copied as drawn (advice).

## Text variables

String variables (for example a "Prototype state" collection that says which
chip a screen shows chosen) are not design values. Wave leaves them out of the
tokens and lists them as notes; they stay in Figma.

## A size Wave needs that you never named

If a component is a fixed width (a menu row 308 wide), that width needs a size
variable too (`size/select-option`). See [[guides/designer/spacing-and-layout|Spacing and layout]].

Gate rules: Colour without a variable, Colour does not match its variable,
Variable from another file, Gradient.
