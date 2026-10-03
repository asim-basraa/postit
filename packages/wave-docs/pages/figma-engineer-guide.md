# Figma to Wave: the engineer's guide

How an engineer brings a design drawn in Figma into Wave, with Claude Code:
the design system first, then the screens, then review, the prototype and the
handover. Every step is repeatable for any project and any Figma file. The
one-page version is the [[wave/figma-quick-guide|Figma to Wave quick guide]].

Wave takes a Figma file exactly as it is drawn, or not at all. Nothing in
Wave changes to fit a file, and nothing is redrawn by hand: what Wave cannot
take is fixed in Figma, and only then converted.

---

## 1. What you end up with

| In Post-it | Made from |
| --- | --- |
| The project, with its DESIGN.md | The Figma file and your answers |
| `design-system/tokens` (DTCG JSON) | Figma's variables, text styles and effect styles |
| One specimen page per component, in `design-system/components` | Each component set, every variant and state |
| `design-system/design-system` and `design-system/design-system-ids` | The specimens: every component's design-system id and its variants' ids, as a table and as JSON |
| The feature's screens, with `data-wave-*` on every element | Each screen frame, pixel-matched to Figma |
| FEATURE.md, the question and answer sheets | Prototype links, components, and your answers |
| A working prototype and, once approved, the Claude Code handover | Everything above |

## 2. Before you start

**Accounts and access**

| You need | Why |
| --- | --- |
| Claude Code | Runs the flow, with Post-it's Wave skills |
| The Figma connector in Claude, signed in with **edit access** to the file | `use_figma` runs the read-only scripts, and Figma only allows it with edit access. A view seat is not enough. |
| The Post-it connector in Claude | Publishes everything, and serves the Wave skills |
| A Post-it account in the space the project lives in | You are the uploader of what you publish |

**On your machine**

| You need | Check |
| --- | --- |
| Node 20 or later | `node --version` |
| Playwright with Chromium | `npx playwright --version`; the CLI renders pages to compare them with Figma |
| The `wave-figma` command line | Download it from your Post-it: `curl -o wave-figma.mjs <your Post-it>/wave/wave-figma.mjs`, run it with `node wave-figma.mjs <command>` |
| Network access to Figma, your Post-it, and Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`) | Fonts are downloaded once and stored in the project |

**Connect Claude Code to Post-it.** In Post-it, open **Your account**, then
**Connect to Claude** (`/settings/mcp`). Create a token pinned to the space
the project is in, and use the Claude Code snippet shown there:

```
claude mcp add --transport http postit <endpoint> --header "Authorization: Bearer <token>"
```

For `wave-figma send` (step 9), put the same endpoint and a token in the
environment, never in a file you commit:

```
export POSTIT_MCP_URL=<endpoint>
export POSTIT_TOKEN=<token>
```

**Keep it safe**

- A token acts as you. Pin it to the one space you need, keep it in an
  environment variable or Claude's connector settings, and revoke it in
  `/settings/mcp` when the work is done.
- Never paste a token into a page, a commit, a prompt you share, or a Figma
  comment.
- Fonts and images go to the project's public asset store. Do not upload
  anything you are not allowed to publish.
- Writing to the Figma file changes the designer's file. Claude asks before
  any Figma change, and lists every change in its report.

**The one rule.** If anything cannot be reached (Figma, Post-it, a font, an
image), stop and say what failed. Never take another route to the same result:
a value read off a screenshot, a layer redrawn in HTML or a font swapped for a
similar one is a design nobody approved.

## 3. Start

In Claude Code, with both connectors on:

> Bring the `<project>` design system and the `<feature>` screens in from Figma: `<Figma file link>`.

Claude loads **Wave Design** from Post-it, which sends it to **Wave Figma**.
It asks for what it cannot read itself:

- the project and the feature in Post-it (it creates them if they do not
  exist yet: a project folder holds the design system and its features);
- the design-system page and the screen frames in the file (their node ids,
  or links to them);
- DESIGN.md, the project's defaults (copy, access, analytics, forms, empty
  values). Claude drafts it from the file and asks you only what the file
  does not say; you approve it before it is saved.

## 4. The entry gate

The gate reads the design-system page and the screens, read-only, and lists
what Wave cannot take as it is.

1. `wave-figma script GATE --page <design-system page> --ids <design-system page>,<screens page>`
   prints a plugin script. Claude runs it with Figma's `use_figma` and saves
   the result as `gate.json`. `wave-figma checksum gate.json` must print the
   checksum the script returned; a result too big for one reply comes in
   parts (`--part n`).
2. `wave-figma gate --report gate.json -o GATE.md --fonts` lists what
   **blocks** and what is **advice**, each with a link to the layer, and any
   font Google does not serve.
3. Blocking items are **fixed in Figma**, by the designer or by Claude when
   you ask, then the gate runs again until it passes.

| The gate says | The fix in Figma |
| --- | --- |
| A colour, size, gap, radius, stroke or effect is not bound to a variable | Bind the variable, or set the layer to Hug or Fill |
| Text without a text style | Apply the text style |
| Layers placed by hand | Auto layout |
| An instance resized, restyled or detached | Keep the component's size and look; add a variant instead |
| A boolean property shows or hides a part | Make it a variant property (Yes/No) |
| An inner shadow under an inside stroke | Remove one: Figma hides the shadow, a browser shows it |

Advice does not block (a hidden layer no variant shows, a button with no
prototype link). Read it out and decide. A fix that changes the design (an
instance that was stretched now hugs its content) is the designer's to accept.
All rules: [[wave/reference/figma-entry-gate|Figma entry gate rules]].

The converter refuses any file, frame or component the last passing gate
report does not cover.

## 5. Tokens and fonts

1. `script VARIABLES` and `script STYLES` (run with `use_figma`, save,
   `checksum`), then:

   ```
   wave-figma tokens --variables vars.txt --styles styles.json -o tokens.json
   ```

   The token file is Figma's variables and styles as they are, in DTCG, sizes
   in rem. It must validate with no problems. Show it, then save it as the
   project's `design-system/tokens` JSON page.
2. Fonts:

   ```
   wave-figma fonts --families "<Family>,<Other family>" --weights 400,500,600 --out fonts/
   ```

   downloads free fonts. Upload each file with Post-it's `upload_asset`
   (project id, file name), keep `{file: url}` as `urls.json`, then:

   ```
   wave-figma font-css --manifest fonts/fonts.json --urls urls.json -o fonts.css
   ```

   A font Google does not serve: stop and ask for the font files and the
   right to use them.

## 6. The design system: one specimen per component

For each component set (and single component) on the design-system page:

1. Read it from Figma: `script COMPONENT --node <set>` (variants and
   properties, saved as `component.json`), `script BINDINGS --ids <set>`,
   `script EFFECTS --node <set>`, `script EXPORT_SVG --ids <vector ids>`, plus
   Figma's `get_design_context` (reference code) and `get_screenshot`
   (reference image). Save each result as returned.
2. Convert:

   ```
   wave-figma convert --gate gate.json --component component.json --type <element type> \
     --code code.tsx --width <w> --height <h> --tokens tokens.json --bindings bindings.txt \
     --effects effects.json --svgs svgs.json --fonts fonts.css -o specimen.html
   ```

   The element type is Wave's (`button`, `textInput`, `checkbox`, `radio`,
   `select`, `navigation`, `icon`...): see [[wave/reference/element-types|element types]].
3. `wave-figma align` places text where Figma draws it, then
   `wave-figma fidelity --page specimen.html --reference figma.png --component component.json`
   must pass (structural difference at most 0.25%).
4. Where Figma drew a picture of a control (an input, a checkbox, a button),
   an upgrade plan makes the real element: `wave-figma upgrade --page specimen.html --plan plan.json -o upgraded.html`.
   The look lock proves nothing moved: identical renders and no rendering
   change in the document. `wave-figma outline` lists what a plan can name.
5. `wave-figma ids --page upgraded.html [--from <published specimen>]`. With
   `--from`, every layer keeps the id it had in the last published version,
   so comments and answers stay attached.
6. `wave-figma preflight` locally, then Post-it's `preflight_html` (the one
   that counts) with nothing open.
7. **The designer approves.** Show each specimen next to its Figma
   screenshot. Approval is the designer's, never yours or Claude's: when they
   approve, each definition's `"status"` becomes `"approved"`.
8. Publish the specimens into `design-system/components`, then run
   **`wave_design_system_page`**. It writes the design-system page (every
   component, its design-system id such as `DS.button`, its variants' ids
   such as `DS.primaryButton`, its type, its Figma node, its review link) and
   the same table as JSON, `design-system-ids`, next to it. Never write that
   table by hand; run the tool again after any specimen changes or is
   approved.

No screen is published until the catalogue is approved.

## 7. Screens

For each screen frame:

1. Read it from Figma: `script NODE_MAP --node <frame>` (instances, their
   properties, prototype links, the vectors to export: `map.json`),
   `script BINDINGS --ids <frame>`, `EFFECTS --node <frame>`,
   `EXPORT_SVG --ids <its vectors>`, `get_design_context`, `get_screenshot`.
2. Convert, against the published specimens:

   ```
   wave-figma convert --gate gate.json --components <dir of component.json> \
     --specimen-pages <published specimens> --map map.json --screens screens.json \
     --code code.tsx --width <w> --height <h> --tokens tokens.json --bindings bindings.txt \
     --effects effects.json --svgs svgs.json --fonts fonts.css --source figma:<file>/<frame> -o screen.html
   ```

   `screens.json` maps frame names to screen slugs. Every instance carries
   exactly its specimen's markup; how it sits in its parent goes on a wrapper
   (`data-figma-slot`). Figma's prototype links become `data-wave-to`.
3. `align`, `fidelity` (must pass), `upgrade --plan` (look lock clean),
   `ids` (`--from` the published screen when there is one), `preflight`.
4. The plan says what Figma cannot draw, in the design's own words: a heading
   is `h1`, a form is `form`, a group of chips is a `radiogroup` with its
   field, a decorative icon is `aria-hidden`, and `data-wave-role` where Wave
   would guess wrong.

**What Figma already says**

| In Figma | In Wave |
| --- | --- |
| A text property on a layer only the Error variant shows (a field's helper) | That field's error message, shown when it fails validation |
| Prototype links (Navigate to, Open link) | Where each button or link goes (`data-wave-to`) |
| Bound variables, text styles, effect styles | Tokens |
| Variant properties | Variants and states (a State property's values are states) |

## 8. FEATURE.md and the questions

What Figma cannot say goes in FEATURE.md, never into a redrawn screen:
fields, rules, options, defaults, the data each screen shows, and what each
action does when it works and when it fails. Claude drafts FEATURE.md from
the frames and prototype links and asks you the rest **in the terminal**,
grouped, with a proposal each time.

A question that does not apply is **waived** with its reason, for example a
loading state for data the screen never fetches, or a group component the
catalogue does not have. Waivers are the designer's decision; every one is
listed in the report and in the handover.

## 9. Review, publish, prototype

Say "Review `<feature>` for `<project>`". Claude loads **Wave Review**:

1. `wave_dry_run`: what is still open, grouped; answers are applied with
   `wave_apply_answers` until the dry run passes.
2. Preflight on every screen, then Claude shows you each screen and asks
   before uploading.
3. Publish the whole feature at once:

   ```
   wave-figma bundle --screen "Sign in=sign-in.html,Your details=your-details.html" -o screens.json
   wave-figma send --tool wave_publish_flow --args '{"feature_id":"<feature id>"}' --json-file screens=screens.json
   ```

   `send` reads the files itself, so a page is never copied through the
   conversation.
4. Open the Post-it links and compare each screen with Figma side by side.
5. Make the prototype: "Make `<feature>` a prototype." Without an API, actions
   simulate loading and let you pick success or failure; form values carry
   from screen to screen.

## 10. Approval and handover

Reviewers comment on elements in Post-it; the uploader confirms, changes or
waives. When every mandatory question is answered or waived and every screen
is approved, the feature is approved and locked. Engineers then build it in
Claude Code with **Wave Build** ("Build `<project>` `<feature>` from Wave"),
from the handover: screens, specimens, tokens, assets, FEATURE.md, DESIGN.md,
the answers and every waiver.

## 11. When Figma changes

1. Run the gate again on what changed; fix blocking items in Figma.
2. Re-convert the changed components and screens with `ids --from` the
   published version, so ids, comments and answers carry over. `ids` reports
   any id that did not carry (`vanished`): check each one.
3. Republish specimens, then run `wave_design_system_page` again; republish
   screens through Wave Review.

## 12. When something goes wrong

| What you see | What it means | What to do |
| --- | --- | --- |
| `use_figma` refused | No edit access to the file | Ask for edit access; a view seat cannot run the scripts |
| Checksum does not match | The result was cut off | Run the script again in parts (`--part n`) |
| `convert` refuses: not passed the gate | Blocking items remain | Fix them in Figma, run GATE again |
| `convert` refuses: not covered | The gate did not read that frame | Run GATE with its page or frame |
| Fidelity fails | The page differs from Figma's render | Look at `--diff diff.png`; fix the cause in Figma or report it, never nudge the HTML |
| Look lock not clean | The plan changed how the page looks | Change the plan, not the page |
| A font is missing | Google does not serve it | Stop; ask for the files and the right to use them |
| `send` says set POSTIT_MCP_URL | The environment has no endpoint or token | Export both (step 2) |
| Post-it refuses a screen | Preflight found something | Fix what it lists, preflight again |
| The design-system page is out of date | A specimen changed since the tool last ran | Run `wave_design_system_page` |

## 13. Commands

| Command | Does |
| --- | --- |
| `script <NAME>` | Prints a read-only Figma plugin script: GATE, INVENTORY, VARIABLES, STYLES, NODE_MAP, COMPONENT, EFFECTS, BINDINGS, EXPORT_SVG |
| `checksum <file>` | Checksum and length of a saved Figma result |
| `gate` | The entry gate report; exit 1 while anything blocks |
| `tokens` | DTCG token file from Figma's variables and styles |
| `fonts`, `font-css` | Downloads free fonts; writes `@font-face` rules |
| `convert` | Figma reference code to a static page: a specimen (`--component`) or a screen (`--components`) |
| `render`, `fidelity` | Renders a page and compares it with Figma's image |
| `align` | Places text exactly where Figma draws it |
| `upgrade`, `lock`, `outline` | Real controls where Figma drew pictures, proven by the look lock |
| `ids` | Wave ids; `--from` keeps the published version's |
| `preflight` | Offline preflight |
| `bundle`, `send` | Package screens and call a Post-it tool directly |

Every command prints JSON and exits 1 when its check fails, so Claude can
read the result and stop. `node wave-figma.mjs` with no command prints the
full help.
