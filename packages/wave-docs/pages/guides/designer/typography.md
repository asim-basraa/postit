# Typography

## Text styles, always

- **Every text layer uses one of the file's text styles** ("Text without a
  text style" is refused). A text layer with its own font settings has nothing
  Wave can name.
- **Build each text style from variables.** In the style, bind its font size,
  line height, letter spacing, font family and font weight to typography
  variables (`type/body/font-size`, `type/body/line-height`...). A style with a
  typed value is refused once ("Text style not bound to variables"), and every
  text using it then becomes tokens.
- **One style per text layer.** A layer that mixes styles (a bold word inside a
  sentence) becomes separate spans; check each part uses a style (advice:
  "Mixed text styles in one layer"). For a link inside a sentence, a
  separate text layer in an auto layout row is clearer.

## Text boxes

- Text boxes **Hug** (auto width) or **Fill** their container. A typed fixed
  width is refused ("Text with a fixed width"); a fixed height is never needed.
- Leave line breaks to the width. A hard line break is kept as a line break.

## Fonts

- Use fonts the web can serve. Free Google Fonts (Geist, Inter...) Wave
  downloads itself.
- For a font Google does not serve, the gate lists it: send the font files and
  confirm they may be used on the web, or choose a free font.
- Small differences in letter spacing between Figma and a browser are normal
  (a fraction of a pixel); they are not something to fix in the file.

Gate rules: Text without a text style, Text style not bound to variables, Mixed
text styles in one layer, Text with a fixed width.
