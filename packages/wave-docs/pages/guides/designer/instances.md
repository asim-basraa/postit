# Using components on screens

On a screen, every component is an **instance** of the catalogue component and
looks exactly like one of its variants. That is what lets engineers build the
screen from the catalogue.

## What may change on an instance

- **Text properties**: the words (Label, Helper, Value).
- **Variant properties**: pick the variant (Type, State, Size, Icon).
- **Instance swaps**: which icon.
- **An icon's colour from a variable**, to take its parent's colour (advice:
  "Instance recoloured with variables"). If the colour is a state of the
  component, make it a variant instead.

## What may not

- **Restyling**: another fill, stroke, radius, padding, gap, font or effect on
  the instance ("Instance restyled"). Make the look a variant of the component.
- **Resizing**: an instance keeps its component's size, Hug where the component
  hugs. Setting it to Fill, or dragging it to another size, is refused ("Instance
  at another size than its component"). For a full-width and a half-width field,
  draw both as variants (Size = Full / Half) or bind the component's width to a
  size variable.
- **Hiding parts with a boolean**: make it a variant ("Boolean property away
  from its default").
- **Detaching**: a frame that carries a component's name but is not an instance
  is refused ("Detached instance"). Use the instance.

## Groups of choices

A row of chips, a grid of option cards or a list of radios is a frame of
instances in auto layout. Wave marks the group as the field and each instance
as one choice. No group component is needed.

Gate rules: Instance restyled, Instance at another size than its component,
Boolean property away from its default, Detached instance, Instance recoloured
with variables.
