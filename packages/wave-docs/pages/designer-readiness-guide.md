# Figma readiness: the designer's guide

You drew the design in Figma. Before Wave can turn it into screens, a
prototype and a handover, the file has to pass Wave's **entry gate**: Wave
takes a Figma file exactly as it is drawn, or not at all. This guide is the
designer's side of that, step by step: reading the readiness report, fixing the
file, checking it yourself with the **Wave Figma Gate** skill, and handing it
back to the engineer. The short version is the
[[figma-gate-guide|Figma gate guide]].

## Who does what

| Who | Does |
| --- | --- |
| Engineer | Runs Wave Figma (the official check). When the file is not ready, Wave publishes a **Figma readiness report** in the project. |
| You, the designer | Fix the file in Figma, check it yourself with Wave Figma Gate as often as you like, and tell the engineer when it passes. |
| Wave | Only reads Figma. It never changes your file, whatever access it has and whoever asks. |

## 1. Set up, once

1. **Claude**: claude.ai or the Claude desktop app. No command line.
2. **The Figma connector** in Claude (Settings, then Connectors), signed in
   with a Figma account that can **edit** the file. Figma runs plugin scripts
   only for editors, even to read; Wave still never changes anything.
3. **The Post-it connector** in Claude. In Post-it, open Your account, then
   Connect to Claude, and add the address shown there as a connector. Click
   **Connect** on the connector, sign in to Post-it and click Allow.
4. **Access in Post-it**: the space that holds your project, and the Wave space
   (it holds the skill). Ask whoever runs Wave for your team to add you.

Check it works by asking Claude: *"List my Post-it spaces."* You should see the
project's space and Wave.

## 2. Read the readiness report

Open the project in Post-it. The report is **Figma readiness report**, at the
project root for the design system and in the feature folder for screens (for
example `Onboarding / Figma readiness report`). Read it top down:

| Part | What it tells you |
| --- | --- |
| Version and date | Which check this is. Each check replaces the last; always act on the newest. |
| Since version N | **Fixed** since last time, and **Regressions**: what passed before and fails now because of a change in Figma. Fix regressions first. |
| Verdict and counts | Ready or Not ready, how many layers block, how many suggestions. |
| What to change, in short | Each kind of correction once, with how to do it in Figma. |
| Corrections by component and screen | Every finding, with a link that opens the layer in Figma. |
| Controls that do nothing | Chips, selects or buttons that do not show a chosen look, open a menu or go anywhere in the prototype. |
| Fonts | Fonts Wave cannot serve. Send the files and confirm they may be used on the web, or choose a web font. |

Blocking items must be fixed. Suggestions are optional.

## 3. Fix the file in Figma

Work component by component: the design system first (a fix there clears the
same finding on every screen that uses it), then the screens. The most common
fixes:

| The report says | Do this in Figma |
| --- | --- |
| Colour, spacing, radius, stroke or opacity without a variable | Bind it to the matching variable. If none matches, add the token to the design system. For spacing, the engineer may give you the project's spacing skill to do it with Claude (see the user manual). |
| Fixed size without a variable | Set the layer to Hug or Fill, or bind its width or height to a size variable. |
| Text without a text style, or a style not bound to variables | Apply a text style; bind its size, line height, spacing, family and weight. |
| Instance at another size, or restyled | Keep instances as their component draws them. For another size or look, add a variant (a Size variant for icons used at 16, 20 and 24) and use it. |
| Boolean property away from its default | Make it a variant property and draw the variant. |
| Layers placed by hand, groups | Auto layout. |
| Choice without a chosen look | A State property with Selected and Default (or Checked and Unchecked), both drawn. |
| Select without an open state | A State value Open, drawn with a layer named Menu holding the options. |
| Screen frame not named as the screen | Name each screen frame in plain words (About you, Account creation): no numbers or separators. |

Every rule, with its fix: [[reference/figma-entry-gate|Figma entry gate rules]].
How to draw so a file passes the first time:
[[guides/designer/index|Designing for Wave]].

## 4. Check it yourself: Wave Figma Gate

In Figma, select the design-system page and copy its link; do the same for the
screens page (or a single frame). Each link must carry its `node-id`. Then, in
Claude:

> Run the Wave Figma gate for project `<project>` on `<design-system page link>`
> and `<screens page link>`

Claude loads the skill from the Wave space, reads the file (it changes
nothing) and replies in the chat with:

- **PASS** or **FAIL**, with the blocking and advice counts and what it checked;
- **What changed** since the project's last official gate: fixed, still open,
  new;
- **Blocking items** by rule, each with how to fix it and a link to the layer;
- **Advice**, one line per rule.

Fix, then say *"run the gate again"*. Repeat until it says PASS. A large file
can be checked a frame at a time: give the link to one screen frame or one
component page instead of the whole page.

Your run is a self-check and is not saved in Post-it. The official report is
the one the engineer's run publishes.

## 5. Hand it back

When the gate passes, send the engineer:

1. the Figma file link (and the page links you checked);
2. the prototype link, if the screens are linked in Figma;
3. Claude's result: **PASS, 0 blocking**, with its checksum.

The engineer runs the official gate on the same version. If it passes, Wave
converts the file; if not, a new version of the readiness report appears in
the project, with what you fixed and anything still open.

## 6. After the gate: review in Post-it

Once the design system is converted, you review each component in Post-it
against Figma, comment on anything wrong and approve it. The same follows for
the screens of each feature. Only you approve; Claude never does.

## When something stops

| Claude says | What to do |
| --- | --- |
| It cannot reach Figma, or a script was refused | Check the Figma connector, and that your account can edit the file |
| A node is missing | The link is wrong or from another file; copy it again with the page or frame selected |
| It cannot read the Wave space or the project | Ask to be added to the Wave space and the project's space |
| There is no such project | Check the project name; the gate never creates one |
| The result differs from the report | The report is the last official check; your run is newer. Send the engineer your PASS to get a new official check |
