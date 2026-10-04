# Keel: run Wave's entry gate yourself

Wave turns the Keel Figma file into a prototype only when the file passes its
entry gate. The gate reads the file (it never changes it) and lists what Wave
cannot take as drawn. Findings marked **blocking** must be fixed in Figma.
Findings marked **advice** are optional.

Run the gate as often as you like while you fix the file. When it shows
**0 blocking**, send the file link to Asim, who runs the official gate.

## What you need (one time)

1. Claude (claude.ai or the Claude desktop app).
2. The **Figma** connector in Claude (Settings > Connectors), signed in with the
   Figma account that can open the Keel file.
3. The **Post-it staging** connector in Claude, with access to the Wave and
   Design spaces. Asim adds you to both.

## Run the gate

Start a new chat and say:

> Run the Wave Figma gate for project keel on
> https://www.figma.com/design/OmgjhCFSzYeTIzZZTBQS5K/Keel---New-File--Updated---22-05-?node-id=28-129
> and
> https://www.figma.com/design/OmgjhCFSzYeTIzZZTBQS5K/Keel---New-File--Updated---22-05-?node-id=1-86

Use your current file's links: the design-system page and the screens page.
Claude loads the **Wave Figma Gate** skill from Post-it, runs the gate
read-only and lists each blocking item with a link to the layer and how to fix
it. It also says what changed since the last official gate. Fix the file in
Figma, then say "run the gate again".

## When it passes

Send Asim:

- the Figma file link (design file, not prototype),
- the prototype link, starting at About-you,
- the last gate result from Claude (PASS, 0 blocking, and its checksum).

Asim then runs the official gate. If it disagrees with yours, Asim sends you
the list.

## Read more (Post-it staging)

- Wave Figma Gate skill: https://post.staging.maqsoodlabs.com/s/wave/skills/gates/wave-figma-gate
- Figma quick guide: https://post.staging.maqsoodlabs.com/s/wave/figma-quick-guide
- Figma entry gate, every rule explained: https://post.staging.maqsoodlabs.com/s/wave/reference/figma-entry-gate
- User manual: https://post.staging.maqsoodlabs.com/s/wave/user-manual
- Concepts: https://post.staging.maqsoodlabs.com/s/wave/concepts
- Keel readiness report: https://post.staging.maqsoodlabs.com/s/design/keel/figma-readiness-report
- Keel entry gate (last official result): https://post.staging.maqsoodlabs.com/s/design/keel/figma-entry-gate
- Keel design system: https://post.staging.maqsoodlabs.com/s/design/keel/design-system/design-system

## Tips for the findings open on 22:05

- **Instance at another size than its component** (6 Option rows inside the
  Select's Open variant set to Fill): set them to Hug, or give the Select
  option component a full-width variant or a size variable for its width.
- **Boolean property away from its default** (the Select on Budget & timing
  with Show helper on): make "Show helper" a variant property of Select and
  draw that variant, or set the property back to its default.
- Advice "Instance recoloured with variables" on icons is fine to leave.
