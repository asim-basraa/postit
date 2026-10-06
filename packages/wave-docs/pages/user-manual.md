# Wave user manual

Wave turns a product design (HTML mockups made in Claude Design, or a Figma file) into a complete, reviewable spec
that Claude Code can build from without guessing. This manual assumes you have
never used it. Read part 1 once; after that, parts 3 to 8 are the day-to-day.
Short on time? The [[quick-guide|quick guide for designers]] is the
whole journey on one page.

- Post-it: https://post.maqsoodlabs.com
- A worked example to open while you read: the **Shopfront** project in the
  Design space (Design space, then Shopfront).

---

## 1. The idea in five minutes

**The HTML is the spec.** A mockup is an ordinary HTML page. Wave adds small
attributes to its elements (`data-wave-*`) that say what each element is, what
it shows, and what it does: "this text is the user's first name", "this button
calls the add-address API and goes to the review screen, or shows this error".
Nothing lives in a separate document that can drift from the design.

**Four people, four jobs.**

| Who | What they do in Wave |
| --- | --- |
| Designer | Designs in Claude Design, answers Wave's questions (with product), confirms every upload, owns the screens. |
| Product | Answers the product questions (data, rules, navigation, permissions, tracking) in the question sheet. |
| Reviewers | Look at screens in Post-it, comment on any element. |
| Engineers | Build the approved flow with Claude Code from the handover. |

**Three places.**

| Place | What happens there |
| --- | --- |
| Claude Design | Designing, with Wave's four skills: Wave Brief, Wave Design System, Wave Feature and Wave Review (Wave Design says which comes next). |
| Post-it | Where screens, the design system and the question sheets live; where review happens. |
| Claude Code | Builds approved flows, using the Wave Build skill. |

**How work is organised in Post-it.**

```
Design space
  Shopfront                     <- a project
    DESIGN.md                   <- the project's defaults and design language
    design-system/
      tokens                    <- the design tokens (DTCG JSON)
      components/
        Button                  <- one specimen page per component
        TextInput
        TopBar
    Checkout                    <- a feature (a flow of screens)
      FEATURE.md                <- the feature's brief: screens, fields, data, actions
      Delivery address          <- screens (HTML)
      Review your order
      Order placed
      Wave questions            <- the dry run's question sheet
      Wave answers              <- the answers, once the dry run passes
```

- A **project** is a product or app. It owns one design system.
- A **feature** (also called a flow) is a set of screens that belong together.
- A **screen** is one HTML page.

**Every element has an address**, `screen.type.slug`, for example
`checkout-address.textInput.postcode`. Its parent has one too
(`checkout-address.form.address-form`). Behind the address is a permanent id
(`data-wave-id="n_post01"`) that never changes, so comments and answers stay
attached to the element through every new version.

---

## 2. One-time setup

### 2.1 Get a Post-it account

Sign in to Post-it (link above) with your work email. Ask an admin to add you to
the **Wave** space (where Wave's docs and skills are) and to the space your
projects live in.

### 2.2 Connect Claude Design to Post-it

1. In Post-it, open **Your account**, then **Connect to Claude**
   (`/settings/mcp`).
2. Create a token. Pin it to the Design space unless you need more.
3. Copy the **Connector URL** shown under "The Claude apps, desktop and web".
4. In Claude (desktop or web): **Settings**, **Connectors**, **Add custom
   connector**, paste the URL, name it "Post-it".
5. In Claude Design, make sure the Post-it connector is switched on for your
   project.

That is all Claude Design needs. When it connects, Post-it tells it: "before
you create, change or upload any HTML mockup, load the Wave Design skill and
follow it." You do not have to paste instructions anywhere.

**Optional belt and braces.** If you want the instruction to be visible in your
Claude Design project, add this to the project's instructions:

> Before creating, changing or uploading any HTML mockup, screen or
> component, load the Wave Design skill from Post-it (get_skill, space postit,
> path skills/wave-design) and follow it exactly. "Wave dry run" means run it
> in dry-run mode.

### 2.3 Connect Claude Code (engineers)

Same page in Post-it. Use the "Claude Code, command line" snippet (it puts the
token in a header, which is safer than a URL):

```
claude mcp add --transport http postit <endpoint> --header "Authorization: Bearer <token>"
```

---

## 3. Starting a new project: DESIGN.md and the design system

Wave works in four stages, each a skill in Claude Design. You do not pick
them: say what you want and Claude loads the right one.

| Stage | Skill | Makes | How often |
| --- | --- | --- | --- |
| 1 | Wave Brief | DESIGN.md | Once per project |
| 2 | Wave Design System | Tokens and components | Once per project, then for new components |
| 3 | Wave Feature | FEATURE.md, then the screens | Each feature |
| 4 | Wave Review | The few questions left, checks, upload, prototype | Each feature |

**Why this order.** Wave needs to know a lot about every element: is the copy
final, who can see it, is it tracked, what happens when it is empty, what the
button does and where it goes. Most of those answers are the same for the
whole project, or for every element that shows the same data or takes the
same action. Written once in DESIGN.md, the catalogue and FEATURE.md, they
are **inherited** by every element and never asked again. On the Keel lead
form, one screen went from 191 open questions to 9 (6 once grouped), all of
them real decisions.

### 3.1 DESIGN.md (Wave Brief)

In Claude Design, say something like:

> Start a new Wave project called Shopfront. Here are my designs.

Claude creates the project and feature folders, then writes **DESIGN.md** at
the project root with you. It reads what you already gave it (your prompt,
brand notes, designs) and only asks the rest, grouped, with a proposal each
time:

- the widths you design for and the language;
- whether the copy is final, draft or placeholder, and where it will live
  (code, a CMS, translation keys);
- who can open screens and see elements by default;
- analytics: tracked or not, and the naming convention;
- feature flags, form behaviour (when errors show, warning on leaving),
  what empty data shows, icons, what things do on small screens.

It also writes the design language in words: product, voice and copy,
colours, type, spacing, shape, layout, components, states, forms,
accessibility. Claude follows it whenever it designs for the project. You
approve the file before it is saved.

The settings at the top of DESIGN.md look like this:

```yaml
viewports: [390, 1280]
access: public
content:
  copy: final
  source: code
analytics:
  controls: none
forms:
  validate-on: submit
```

Any element can still say otherwise (for example `data-wave-copy="draft"` on
one heading).

### 3.2 The design system (Wave Design System)

Wave will not upload any screen until the design system is approved.

1. **Tokens.** Claude builds them from DESIGN.md's visual language and your
   designs, as one W3C DTCG token file. Sizes are always in **rem** (1px is
   0.0625rem). It shows you the list grouped by type: *Are these the right
   names and values?*
2. **Components.** For each component in DESIGN.md: its type, variants,
   **every state**, what using it means (a chip is "select", a button
   "press"), what it does on small screens, its parts and accessibility.
3. **A specimen page per component** drawing every variant and state, styled
   only with tokens.
4. **You approve the catalogue.** Only then is it published into
   `design-system/components`.

Every instance on a screen inherits its component's states, variants and
behaviour, so none of that is asked per element.

**See it in Post-it.** Open the project folder: it shows the catalogue with
every component, its variants and states, and **where each is used**.
Components used on screens but missing from the catalogue are listed
separately.

**The design-system page.** `design-system/design-system` lists every
component with its design-system id (`DS.button`), its variants' ids
(`DS.primaryButton`), its type and, for a Figma design, its Figma node. The
same table is next to it as JSON (`design-system/design-system-ids`) for code.
Claude writes both from the specimens with `wave_design_system_page` whenever
a specimen is published, changed or approved; nobody edits the table by hand.
Your own opening paragraph and a `## Notes` section on the page are kept.

---

## 4. Designing a feature (Wave Feature)

Give Claude Design your prompt as usual, for example "Design a lead
qualification form for Keel... three steps, then a result...". Claude:

1. **Writes FEATURE.md from your prompt**: the screens (with routes), every
   field people fill in (rules, options, defaults, "Other opens a text
   field"), the data the screens show, and every action (what it calls,
   where it goes when it works and when it fails). It asks only what your
   prompt leaves open, and you approve the brief.
2. **Designs the screens from it**, with the catalogue's components exactly as
   they are drawn, and the Wave attributes already on every element: fields,
   data, actions, the error and loading states the brief implies, the
   dialogs actions confirm with.

A good prompt answers most of FEATURE.md by itself. The more it says about
rules, data and what happens after each button, the fewer questions follow.

---

## 5. Wave Review: the questions left, check, upload

When the screens are ready (or you bring mockups made elsewhere), say:

> Review Checkout for Shopfront.

or, to get product's answers before anything is uploaded:

> Wave dry run for Shopfront / Checkout.

Claude will:

1. **Give every element its permanent id** (it never changes one).
2. **Run the dry run**, which saves **Wave questions** in the feature folder:
   only what is still open, each decision asked once for all the elements
   it applies to, split into questions for product and for you.
3. **Look for a better home first.** A question about a field, data or an
   action is answered in FEATURE.md; one that would repeat on every screen
   goes in DESIGN.md; one about a component's states in its specimen. One
   answer there closes it everywhere.
4. **Ask you the rest**, a group at a time, and give you the link to **Wave
   questions** for product.
5. **Apply the answers, check and upload** (below).

### 5.1 Reading the question sheet

```
## For product

- [ ] **Disabled when** `group/disabled-if/3` * _(product; 3 × button)_
  When can it not be pressed?
  Applies to: `about-you/n_ayx006/disabled-if`, `about-you/n_ayx008/disabled-if`, `about-you/n_ayx010/disabled-if`
  Elements: about-you button about-you; about-you button your-project; about-you button budget-timing
  Answer:
```

- `*` means **mandatory**. Optional questions are hidden; ask Claude for
  "the optional questions" if you want them.
- A grouped question (`group/...`) lists every element it applies to; one
  answer fills them all.
- `(product)` or `(designer)` says who is best placed to answer. The
  designer is still responsible for every answer.
- The top says how much is **already answered**, and where from (FEATURE.md,
  DESIGN.md, the design system, Wave itself, the HTML).
- A **Proposed:** line is Wave's guess, with its reason. Answer `yes` to
  accept it, or write the right answer.

### 5.2 Answering (product, or anyone)

Anyone who can open the page can edit it. Write after `Answer:` in plain
words; Claude tidies it into the exact format. If a question genuinely does
not apply, the designer writes `waive: <reason>`. A waived question stops
blocking, but stays visible (and is shown to engineers) with its reason.

When product says they are done, tell Claude Design *"Run the Wave dry run
again."* Answers that are missing or not valid are marked **Fix:**. Repeat
until the sheet says the dry run **passed**; a passing run saves **Wave
answers** next to it.

### 5.3 Check and upload

1. **Applies the answers.** Everything FEATURE.md says and the names Wave
   assigned are written into the HTML too, so the uploaded screen says it
   itself.
2. **Uploads assets.** Local or embedded images, SVG files, icons, logos and
   fonts go to Post-it's public asset store for the project. Links to other
   websites stay. No video; 10 MB per file.
3. **Tokens only.** A value with no token: add a token, or use the nearest?
4. **Preflight**, then Claude shows you what it changed, what you confirmed,
   what is waived, and asks **"Does this match what you designed? May I
   upload it?"** It uploads only on a clear yes.
5. **Compare** the Post-it link with your design side by side.
6. **Ask for review** once you are happy.

### 5.4 "It looks different in Post-it"

Post-it shows the page in a secure frame. The usual causes, all caught by
preflight:

| What you see | Usually because | Fix |
| --- | --- | --- |
| Fonts are wrong | A font file was local | Upload the font as an asset |
| Images missing | Local or relative image paths | Upload them as assets |
| Part of the page missing | A script used browser storage, or a missing file | Remove or guard the script |
| Page empty | The page was built by a script | Export the rendered HTML |
| Colours or sizes shifted | A value changed while tokenising | Use the token with the same value |
| Layout wrong at a width | No viewport tag | Add the viewport tag |

---

## 6. Playing a feature as a prototype

Every feature can be played as one working prototype: all its screens in one
window, like a Figma prototype, but running. Links and buttons move between
screens, forms check what you type, and the screens show data from a **mock
API**, so lists fill, totals add up and errors can be shown on purpose. It is
view only: no inspector, no comments. It is for demos, walkthroughs and
testing the flow with people.

### 6.1 Opening it

Open the feature folder in Post-it and click **Play prototype**, or ask
Claude Design for the link. The bar across the top has:

| Control | What it does |
| --- | --- |
| Mobile / Tablet / Desktop / Fit | The device size. Rotate turns a phone or tablet sideways. The screen shrinks to fit your window when it has to. |
| Back / screen list / Restart | Go back, jump to any screen, or start again with no data. |
| Network | Instant, Normal or Slow network, to see loading states. |
| Scenarios | Choose what each API call answers: success, or one of its errors (for example "place order fails"). |
| Requests | Every call the screens made and what the mock server answered. |
| Notes | Anything the mock API does not cover yet. |

The address bar above the device shows the screen's route with its
parameters filled in. The link keeps the screen and device, so you can send
someone straight to "the review screen on mobile".

### 6.2 Where the data comes from

Each feature has an `api` folder next to its screens:

```
Checkout
  Delivery address, Review your order, Order placed   <- screens
  api/
    openapi               <- the mock API (OpenAPI 3)
    mocks/                <- optional response files, one per operation
    Data requirements     <- what every screen shows, collects and calls
```

There are two ways to get it:

- **Let Wave draft it.** Tell Claude Design: *"Make the Checkout feature a
  prototype."* It asks Wave to draft the API from the screens (one call per
  kind of data the screens show, one per action that saves something, with the
  values from your design as examples). It shows you the draft and the data
  requirements, adds realistic data and the errors product expects, and saves
  it.
- **Bring your own.** If product or engineering already have an OpenAPI file
  (JSON or YAML) with example responses, give it to Claude Design. Wave checks
  it and lists anything the screens need that it does not provide.

The screens connect to the API through what they already say: an operation
marked `x-wave-provides: order` feeds every `order/...` value on the screens,
and one marked `x-wave-effect: api/orders/place` is called by the button whose
effect is `api/orders/place`. Everything else is ordinary OpenAPI.

### 6.3 What the prototype does with your spec

| In the design | In the prototype |
| --- | --- |
| `data-wave-bind`, `-format`, `-empty` | Filled from the mock data, formatted (prices, dates), with the empty value when there is none. |
| `data-wave-repeat` | One item per record; the empty state shows for an empty list. |
| `data-wave-visible-if` | Shown or hidden by the data. |
| `data-wave-field`, `-validate` | Remembered across screens; checked on submit, showing the error state you drew. |
| `data-wave-action`, `-effect` | Calls the API, showing the loading state you drew for the button. |
| `data-wave-to`, `-to-failure` | Where it goes when the call works, or fails. |
| `data-wave-confirm` | Opens the confirmation dialog you drew first. Its cancel button (`data-wave-to="back"`, or labelled Cancel, No, Keep or Stay) closes it; its other button goes ahead. Escape and the backdrop cancel. |
| Error, loading, toast and modal states | Hidden until they happen. |

### 6.4 Sharing it with people who have no account

On the feature's page, under **Share the prototype**, make a link: say who
it is for and when it should stop working (7, 30 or 90 days, or never).
Anyone with the link can play the prototype, without signing in: that
feature only, view only, with no notes about the mock API. The link is shown
once, when you make it (Post-it keeps only a fingerprint of it), so copy it
then. **Revoke** stops it at once. Claude Design can make one too: *"Share
the Checkout prototype with the client."*

### 6.5 Publishing a whole feature at once

For a feature of several screens, Claude Design publishes everything
together (all screens, then the API) and gives you the review links and the
prototype link in one go. You still confirm the upload first.

The API is also part of the handover: engineers get `api/openapi.json`, the
mocks and the data requirements, and can serve the same mock data in
development while the real API is built.

## 7. Reviewing a screen in Post-it

Open any screen. You see the mockup in the middle, **layers** on the left and
the **inspector** on the right.

### 7.1 Getting around

- **Inspect / Interact**: in Inspect mode a click selects an element; in
  Interact mode the mockup behaves as it will, and links open their screens.
  Ctrl or Cmd + I switches.
- **Mobile / Tablet / Desktop** and a width box change the viewport. Zoom is
  next to them.
- **Version** switches between saved versions of the screen.
- **Layers** lists every element by address. **Missing only** filters to
  elements with unanswered mandatory questions.

### 7.2 What the red means

- A **red mark** on a layer: that element has a mandatory question with no
  answer.
- A **red \*** on an inspector tab: something mandatory is missing on that tab.
- A **"N missing"** chip at the top: the total for the screen.

Waived questions stop being red but stay listed as **Waived** with their
reason.

### 7.3 The inspector tabs

| Tab | What it shows |
| --- | --- |
| Screen | About the whole screen: route, title, who can open it, widths, data it uses, and "Required here" for the screen. |
| Identity | The element's address, type, parent, id, component and variant, and where that component is used across the project. |
| Content | Fixed or from data, the data path, empty value, format, copy status. |
| Behavior | Action, trigger, side effects, where it goes on success and failure, validation. |
| States | The states it supports and where each is drawn. |
| Comments | The comments on this element. |

Each tab has a **Required here** block: every question for the selected
element on that tab, as **Answered**, **Proposed**, **Missing** or **Waived**.

### 7.4 Who can do what

| | Uploader (the designer who created the screen) | Everyone else |
| --- | --- | --- |
| Comment | Yes | Yes |
| **Confirm** a proposal, **Change**, **Answer**, **Waive**, **Withdraw** a waiver | Yes | No |
| **Confirm all N proposed** | Yes | No |

Every change the uploader makes in the inspector is saved as a new version of
the screen, so Claude Design always works from the latest.

### 7.5 Commenting

Select an element (Inspect mode), open **Comments**, write. You can also
comment on quoted words, an area, or the whole screen. The comment is pinned
to the element's permanent id, so it follows the element through new
versions. Claude Design picks up open comments, fixes them, and marks them
addressed with the version that fixes them; a reviewer confirms and resolves.

---

## 8. Approving a feature and handing over

Open the feature folder in Post-it. The **flow overview** lists every screen
with its **Warnings open** count, the flow graph (which screen leads where), the
data, actions and tokens used.

**Warnings.** Below the screens is every screen's open warnings in one table,
mandatory first: the element (a link that opens it in review), what is missing,
what Wave asks, and what it proposes. It holds the questions still open (after
DESIGN.md, FEATURE.md and the catalogue) and what preflight finds in the file
(test ids, the Figma match). The project page has the same table for every
screen in the project. The count in each screens table is this list's, the same
one preflight and approval use. In Claude, ask for "the Wave warnings for
<feature or project>" (`wave_warnings`) and answer them there
(`wave_answer_warnings`, by question id; `waive: <reason>` waives one). Only
the person who uploaded a screen can change it; questions about the whole
feature or project are better answered in FEATURE.md or DESIGN.md.

- **Approve the flow** is only possible when every mandatory question on every
  screen is answered or waived ("Every mandatory field is answered or
  waived"). Otherwise it says **Not ready to approve** and lists the blockers.
- It also waits for the **end-to-end tests**: the feature's Gherkin
  (`tests/flow-feature`) approved like a screen, and a passing Wave Test run
  on the prototype at the versions you approve. If a screen changes after the
  run, run it again. See [[testing|End-to-end tests]].
- Once approved, the flow is frozen and ready for engineering.

**Engineers**, in Claude Code:

> Build the Shopfront Checkout flow from Wave.

The Wave Build skill fetches the handover: HANDOVER.md (routes, flow graph,
data dictionary, actions with side effects and destinations, states, review
decisions and waived gaps), every screen, the component specimens, the tokens,
the assets with a manifest, the answer sheet, DESIGN.md and FEATURE.md, and the
tests (`tests/flow.feature`, `catalogue/<screen>.json` with each screen's test
ids, and `tests/README.md`, which says where each is). It builds the components
first, then the screens, puts every `data-testid` on the element that builds
it, and asks rather than guesses where something was neither specified nor
waived. Before calling it done it runs the handover check and the same
Gherkin against the app (Wave Test).

---

## 9. Designs drawn in Figma (Wave Figma)

When the design system and the screens are drawn in Figma, an engineer brings
them into Wave by talking to Claude, in three stages (brief, design system,
feature): see [[figma-engineer-guide|Figma to Wave: the engineer's guide]].
Wave takes the file exactly as drawn, or not at all: nothing is redrawn by
hand, and Wave does not change to fit a file. As the designer, you fix what
Wave cannot take in Figma, and you review and approve the result in Post-it.

### 9.1 The entry gate

Before anything is converted, the gate reads the design-system page and the
screens (read-only) and lists what Wave cannot take as it is, with a link to
each layer. Blocking items are fixed **in Figma**, then the gate runs again;
the converter refuses a file that has not passed. The rules are in
[[reference/figma-entry-gate|Figma entry gate rules]]. The designer can run the
same gate while fixing the file, with no command line: "Run the Wave Figma gate
for <project> on <links>" loads [[skills/gates/wave-figma-gate|Wave Figma Gate]]
(read-only, a self-check; the engineer still runs the official gate). How to
draw so it passes the first time, part by part (variables, spacing and layout,
typography, effects, the design system, instances, states, screens, a
checklist): [[guides/designer/index|Designing for Wave: the designer's guides]].
The ones you will meet most:

| The gate says | Fix it in Figma |
| --- | --- |
| Not bound to a variable (colour, size, gap, radius, stroke, effect) | Bind the variable, or set the layer to Hug or Fill |
| A fixed size without a variable, including a component's own size (a variant set to Fill in its component set still has one) and a min or max width or height | Bind the size to a size variable, or let the component Hug |
| Text without a text style | Apply the text style |
| A text style whose size, line height, letter spacing, family or weight is not a variable | Bind those values in the text style |
| Layers placed by hand | Auto layout |
| Canvas stacking first on top | Set Canvas stacking to Last on top in the auto layout settings (an open menu is still shown above the page) |
| Instance resized or restyled | An instance keeps its component's size and look; add a variant. A variant property bound to a variable (for the prototype) is fine |
| Boolean property shows or hides a part | Make it a variant property (Yes/No) |
| Inner shadow under an inside stroke | Remove one: Figma hides the shadow, a browser shows it |
| Choice without a chosen look | Give the chip, radio, checkbox, segment, toggle or option a State with Selected (or Checked, On) and Default (or Unchecked, Off), each drawn |
| Select without an open state | Add State Open and draw it: the field open, with a layer named Menu holding at least two instances of an option component that has Selected and Default |

Advice does not block: a hidden layer that no variant ever shows, a button
with no prototype link. A layer one variant hides and another shows (an error
message, a summary on a completed step) is that variant's look, not advice.

When the file is not ready, you get a **Figma readiness report** in Post-it,
with its version and the date checked at the top. Each new check is the next
version and replaces the last. From version 2 on, it starts with what you fixed
since the last version and any **regression**: something that passed then and
fails now, because a change in Figma broke it. Fix the regressions first. Then
come the corrections by component and screen, with a link to each node in Figma,
and any control that did nothing when Wave played the screens (Wave clicks
every control before publishing; what does not respond is missing a drawn
look).
Make them in Figma and tell the engineer; Wave checks again. Claude edits your
file only if the engineer says yes twice, after you agreed, and then lists
every change it made.

### 9.2 What you draw in Figma, and what Wave makes of it

| In Figma | In Wave |
| --- | --- |
| Variables and styles | The project's tokens (DTCG); every value on a page is a token |
| A component set | A specimen: every variant, checked pixel by pixel against Figma |
| An instance on a screen | That catalogue component, exactly; how it sits in its parent goes on a wrapper |
| Variant properties | Variants and states (a State property's values are states) |
| A text property on a layer only the Error variant shows (a Text field's Helper) | That field's error message: set it on each instance, even while it shows Default |
| Prototype links (Navigate to, Open link) | Where each button or link goes |
| Change to (a variant swap inside a component, such as a segment choosing its value) | Not a link: the prototype shows the choice |
| A component with a click interaction (Figma's code draws it as a button) | The element its specimen draws; a field is never a button |
| Effect styles | Shadow tokens |
| A choice's Selected (or Checked, On) variant | The look a control takes when it is chosen in the prototype, even when it is the component's default look |
| A select's Open variant and its Menu | The prototype's dropdown: the menu opens where Figma draws it, one row per option, and the field takes its Filled look with the option chosen |

Fidelity is measured against Figma's own render of each frame; the mark is
0.25% of structural difference. One known gap: Figma does not apply a font's
kerning pairs at very large sizes where a browser does, so a display heading
can measure slightly over (Keel's "Qualified" heading: 0.445%). It is reported,
not hidden.

### 9.3 What Figma cannot say

Fields, rules, options and data go in FEATURE.md, as for any feature (part 4).
A question that does not apply is waived with its reason: a loading state for
data the screen never fetches (the answers carried from the earlier steps), or
a group component the catalogue does not have (a row of chips). Waivers are
your decision; Claude lists each one.

### 9.4 Then, as for any feature

You approve the specimens (part 3); Wave Review runs the dry run, shows you
every screen and uploads only on your yes (part 5); then the prototype
(part 6), and the end-to-end tests: you read the feature's Gherkin next to the
prototype and approve it with the screens (part 8).

Screens are named as their Figma frames ("About you", not a name with a
number, a size and separators in it): the name starts every test id on the
screen, so the gate refuses a frame that is not named as its screen.

### 9.5 Notes for engineers

What the first full Figma run taught us, in the order you meet it.

**The order is fixed.** The design system is approved before any screen is
published: Post-it's preflight refuses a screen that uses a component not yet
approved ("Text field not approved"). The screens and the feature's Gherkin are
approved after a passing Wave Test run on exactly those versions.

**Approving a specimen is two steps today.** The designer opens each specimen
page in Post-it (`<space>/<project>/design-system/components/<name>`) and
presses **Approve** in the "Under review" bar. Then Claude records that approval
in the specimen (its `"status": "approved"`), publishes it and rebuilds the
design-system page; Claude Code may ask your permission for that write. The
person who asked for the review cannot approve it, so the designer needs their
own account in the project's space. Reading approval straight from the review
is on the roadmap, required before a project ships its features to production.

**Comments on specimens.** When a published version fixes a designer's
comment, Claude marks it addressed with what changed; the designer confirms it
(resolved) or reopens it. A comment that needs a change in Figma goes back to
the designer.

**Changing Figma for the designer.** Claude edits the designer's file only when
you say so, one change at a time, and nothing on a screen may move. Every such
change is written to the project's "Figma changes made for the designer" page:
layer ids, before and after, why Wave needed it, and what to draw next time.
Prefer this to a waiver: a waiver keeps a value that is not a token on the page
(z-index from "first on top" stacking is the example).

**When a component changes in Figma**, its specimen is converted again and
needs the designer's approval again, and every screen using it is fetched
again from Figma (its instances now carry the new variant) and published again.
A screen's ids and test ids are carried from its published version, so comments
and tests stay on their elements.

**The 99% Figma match.** Every screen converted from Figma is measured against
its frame on the finished page (`wave-figma fidelity --stamp`), after ids and
any other change: a page changed after measuring is refused. Post-it uploads it
only at 99% match or better; the other screens of the publish still go up.
Each result, uploaded or refused, is a row in the feature's
`tests/fidelity-report`. Read structural, not raw: raw counts every glyph edge
the two renderers draw differently and is always higher.

**Where the test files are.** `tests/testing` in the feature lists them: the
Gherkin (`tests/flow-feature`, a `.feature` file you can download), each
screen's catalogue JSON (`catalogue/<screen>`) and the reports.

**Wave Test runs on your machine.** It needs Node 20+ and Playwright with
Chromium; Claude downloads the runner from Post-it (`/wave/wave-test.mjs`) and
runs it where Playwright can be loaded. It records the run with the versions it
played: change a screen or the Gherkin and it must run again before the feature
can be approved. A failure is a finding, never something to edit away: say
whose it is (the design, FEATURE.md, the runner) and fix it there.

**The database.** Recording a test run needs the `wave_test_runs` migration
applied in the project's database.

---

## 10. Changing the design system later

- A new component or variant is only added when the designer says yes to "Is
  this a new component?". It is drawn in its specimen with every state and
  approved before use.
- When a component changes, every screen using it is flagged, because the
  catalogue view lists where each component is used.
- Tokens are per project. Adding or changing one is a catalogue change the
  designer approves. A screen whose values no longer match the token file is
  flagged until it is updated.

---

## 11. What Wave asks about each kind of element

Wave recognises the type of every element and asks the right questions. A
summary of the mandatory ones (the full decision tree, with every question
and its exact wording, is in the Wave Design skill in Post-it: postit space,
Skills, Wave Design):

| Element | Mandatory questions |
| --- | --- |
| Every element | a name (slug); when it is shown, if hidden in the mockup |
| Screen | slug, title, route, feature, who can open it, widths, viewport tag, loading and error states if it shows data, every data path described |
| Text and headings | fixed or from data; if fixed, final or draft copy; if data, which data, empty value, overflow |
| Values (prices, dates) | as text, plus format |
| Images, avatars | alt text, fixed or from data, fallback, fit |
| Icons | decorative or meaningful (aria-label), icon name |
| Buttons | component, variant, action, trigger, side effects, success and failure destinations, states, loading state drawn, when disabled, confirmation if destructive |
| Links | destination; new tab if it leaves the product |
| Forms | which button submits, when errors show |
| Inputs, selects, checkboxes, switches, date pickers, sliders, uploads, rich text | the data they write, label, rules, error drawn, states, component, plus type-specific ones (options, default, range, accepted files, allowed formatting) |
| Lists and tables | what it is a list of, item template, order, how many, empty state |
| Modals, drawers | kind, what opens it, how it closes, component |
| Navigation, menus | current item, destinations, what opens it, component |
| Toasts, errors, empty and loading states | what they belong to or what shows them, severity, how they go away |
| Maps, charts, media | data, empty value, component, interactions or playback |

Behaviours such as carousel, drag and drop, accordion, sticky or infinite
scroll sit on top of these and each asks for its settings.

**Accessibility, analytics, feature flags and translations** are covered as
recommended questions on every relevant element (who can see it, feature
flag, analytics event, where copy lives such as `i18n:<key>`).

---

## 12. Quick reference

### Things to say to Claude Design

| You want to | Say |
| --- | --- |
| Start a product | "Start a new Wave project called X." (writes DESIGN.md, then the design system) |
| Change a project default | "Update DESIGN.md: copy lives in the CMS." |
| Design a feature | Your prompt, e.g. "Design the Checkout feature for X: ..." (writes FEATURE.md, then the screens) |
| Get questions for product | "Wave dry run for X / Feature." |
| Recheck answers | "Run the Wave dry run again." |
| See every question | "Show the optional questions too." |
| Check and upload | "Review and upload the Feature screens for X." |
| Make it clickable | "Make X / Feature a prototype." |
| Use product's API | "Use this OpenAPI file for the Feature prototype." |
| Show a client | "Share the Feature prototype with the client." |
| Fix review comments | "Deal with the open comments on Feature." |
| Add a component | "Add a new component: ..." (you approve it) |
| Bring a Figma design in | "Bring the X design system and the Feature screens in from Figma: <link>." |
| Check a Figma file | "Run the Wave entry gate on <link>." |
| Self-check a Figma file (designer) | "Run the Wave Figma gate for <project> on <links>." |

### Words

| Word | Meaning |
| --- | --- |
| Project | A product; owns DESIGN.md, tokens and components. |
| DESIGN.md | The project's defaults and design language, at its root; every element inherits it. |
| FEATURE.md | A feature's brief: screens, fields, data and actions; the elements that use them inherit it. |
| Inherited | Answered by DESIGN.md, FEATURE.md, the component or Wave itself, so never asked. |
| Feature, flow | A set of screens that belong together. |
| Catalogue | The project's approved components. |
| Specimen | The page that draws one component in every variant and state. |
| Token | A named design value (colour, size...) in the DTCG format, sizes in rem. |
| Address | `screen.type.slug`, how an element is referred to. |
| Mandatory | Must be answered or waived before the flow can be approved. |
| Proposed | Wave's guess; needs the designer to confirm. |
| Waived | Deliberately not answered, with a reason. |
| Dry run | Produces the question sheet; uploads nothing. |
| Preflight | Wave's check just before upload. |
| Handover | What Claude Code builds from, once a flow is approved. |
| Prototype | The feature's screens played together on a mock API. |
| Mock API | The feature's OpenAPI document with example responses, served in the prototype. |
| Scenario | Which answer a mock API call gives in the prototype: success or one of its errors. |

### When something goes wrong

| Problem | What to do |
| --- | --- |
| Claude Design does not use Wave | Check the Post-it connector is on; add the optional instruction from 2.2. |
| "Nothing is uploaded until the catalogue is approved" | Finish the design system (3.2). |
| Many questions about copy, access or tracking | DESIGN.md is missing or incomplete; ask Claude to run Wave Brief. |
| Many questions about fields, data or buttons | FEATURE.md is missing or incomplete; ask Claude to update it from your prompt. |
| Upload looks different | See 5.4; ask Claude to run preflight again. |
| You cannot confirm or waive in Post-it | Only the uploader can; others comment. |
| Cannot approve the flow | The overview lists the blocking questions per screen. |
| An asset is refused | Videos are not supported; files must be under 10 MB. |
| The prototype shows the design's sample text | That data has no operation in the mock API; see Notes in the prototype. |
| A button does nothing in the prototype | It has no destination (`data-wave-to`) or its effect has no operation; see Notes. |
| Preflight says a component is "not approved" | The designer approves its specimen in Post-it, then Claude records the approval (9.5). |
| Wave Test says Playwright is not installed | Install Playwright with Chromium, or run the runner from a folder where Playwright is installed. |
| Recording a test run fails | The `wave_test_runs` migration is not applied (9.5). |
| The project page's count differs from preflight | Fixed: the project page now reads each screen's FEATURE.md, as preflight does. Both show the Warnings list's count. |
| A Figma screen "is not uploaded" | It has no Figma match stamp, matches under 99%, or changed after it was measured. Measure the page you send and stamp it (9.5); `tests/fidelity-report` says which. |
| Creating a Gherkin page fails | The `feature` content type migration is not applied. |
