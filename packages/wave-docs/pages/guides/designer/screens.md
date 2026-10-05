# Screens

## Frames

- **One top-level frame per screen**, on the screens page, at the width you
  design for (1440 for desktop). Sections are fine for grouping them.
- **Name each frame as the screen is called**, in plain words: About you,
  Your project, Budget and timing, Qualified. No numbers, sizes or separators
  (`01 · About you · 1440`, `Frame 12`, `Login/2`). The name becomes the
  screen's id, and every test id on the screen starts with it ("Screen frame
  not named as the screen").
- **Two frames may not share a name**, even differing only in capitals.
- The screen is built from the design system's components; see
  [[guides/designer/instances|Using components on screens]].

## Layers

- **Delete hidden layers**, or make the hidden look a variant. Hidden layers
  are dropped (advice: "Hidden layer"). A layer hidden in one variant of a
  component, and shown in another, is fine.
- **Name layers for what they are** (Header, Form, Summary), not Frame 47 or
  Rectangle 3. Names become element names and help Wave tell a heading from a
  label (advice: "Default layer name").

## Content

- Use **realistic words and values**: the real labels, a real-looking name and
  email. Engineers and the end-to-end tests use them as examples.
- Draw every **empty, loading and error** look a screen can have, as its own
  frame or as component states, when the screen has them.

Gate rules: Screen frame not named as the screen, Hidden layer, Default layer
name.
