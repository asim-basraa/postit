# Before you hand over

Run through this, then run the gate yourself. A file that passes goes straight
into Wave; one that does not comes back with the gate's list.

## Checklist

**Variables and tokens**
- [ ] Every colour, gap, padding, radius, stroke width, size, opacity is bound to a local variable
- [ ] Variables have scopes, and none come from another file
- [ ] No paint drawing a colour other than its variable's

**Layout**
- [ ] Auto layout everywhere; no groups; no layers dragged into place
- [ ] Every size is Hug, Fill or bound to a size variable (component sets' variants and min/max too)
- [ ] Canvas stacking is Last on top
- [ ] Whole-pixel positions and sizes

**Type and effects**
- [ ] Every text layer uses a text style, and every text style is built from variables
- [ ] Text boxes Hug or Fill
- [ ] Shadows are effect styles or bound to variables; no inner shadow under an inside stroke
- [ ] Fonts are free web fonts, or the font files are ready to send

**Design system**
- [ ] Every component is on the design-system page, with a description
- [ ] Component sets have auto layout, gap and padding bound
- [ ] Parts that come and go are variants, not on/off properties
- [ ] Duplicated variants keep their text properties

**States and prototype**
- [ ] Every choice has a chosen and a not-chosen State, both drawn
- [ ] Every select has an Open variant with a Menu of option instances
- [ ] Hover, Focus, Filled, Error and Disabled are drawn where the control has them
- [ ] Error messages set on each instance
- [ ] Every button links somewhere

**Screens and instances**
- [ ] Frames named as the screens, in plain words, no duplicates
- [ ] Instances are not restyled, resized or detached
- [ ] No hidden or default-named layers left

## Run the gate yourself

Ask Claude: **"Run the Wave gate on <link to the Figma file>"**, with the Wave
Figma Gate skill ([[skills/gates/wave-figma-gate|Wave Figma Gate]]). It only reads
the file. It answers with PASS or FAIL, the blocking items and the advice,
each linked to its layer in Figma. Fix, then say "run the gate again". The
full walkthrough is in the [[figma-gate-guide|Figma gate guide]].

When it passes, send the engineer the Figma file link, the prototype link and
the gate's result.
