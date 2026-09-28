# Wave user manual

Wave turns HTML mockups made in Claude Design into a complete, reviewable spec
that Claude Code can build from without guessing. This manual assumes you have
never used it. Read part 1 once; after that, parts 3 to 7 are the day-to-day.

- Staging: https://web-staging-347f.up.railway.app
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
| Claude Design | Designing, and the Wave Design skill that interviews the designer, checks and uploads. |
| Post-it | Where screens, the design system and the question sheets live; where review happens. |
| Claude Code | Builds approved flows, using the Wave Build skill. |

**How work is organised in Post-it.**

```
Design space
  Shopfront                     <- a project
    design-system/
      tokens                    <- the design tokens (DTCG JSON)
      components/
        Button                  <- one specimen page per component
        TextInput
        TopBar
    Checkout                    <- a feature (a flow of screens)
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

Sign in to Post-it (staging link above) with your work email. Ask an admin to
add you to the **Design** space if you cannot see it.

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

## 3. Starting a new project (first run)

You do this once per product. Wave will not upload any screen into a project
until its design system has been approved.

In Claude Design, say something like:

> Start a new Wave project called Shopfront. Here are my designs.

Claude will:

1. **Ask which project and which feature.** It creates the project folder (with
   `design-system/` and `design-system/components/` inside) and the feature
   folder.
2. **Build the tokens.** It collects every colour, size, spacing, radius,
   font, weight, shadow, duration and so on from your designs and writes one
   token file in the W3C DTCG format. Sizes are always in **rem** (1px is
   0.0625rem); px tokens are refused. It shows you the list grouped by type
   and asks: *Are these the right names and values? Anything missing or
   duplicated?*
3. **Interview you about components.** For each distinct thing (buttons,
   inputs, cards, badges, bars, dialogs...): its name and type, whether two
   similar things are one component with variants or two components, its
   variants, its states (hover, focus, disabled, loading, error...), its parts
   and accessibility notes.
4. **Make a specimen page per component** that draws every variant and every
   state, styled only with token variables. Wave checks the specimen: a state
   the component claims but does not draw is reported.
5. **Ask you to approve the catalogue.** Only after you say yes does it mark
   the components approved and publish them into `design-system/components`.

**See it in Post-it.** Open the project folder: it shows the catalogue with
every component, its variants and states, and **where each is used** (screen
and element address). Components used on screens but missing from the
catalogue are listed separately.

---

## 4. Dry run: getting the questions answered before you build

A dry run produces every question Wave needs answered, as one page you can
share with product. Nothing is uploaded.

In Claude Design:

> Wave dry run for Shopfront / Checkout.

Claude will:

1. Prepare the draft screens and give every element its permanent id.
2. Run the dry run, which saves a page called **Wave questions** in the
   feature folder.
3. Go through the **designer** questions with you there and then.
4. Give you the link to **Wave questions** to send to product.

### 4.1 Reading the question sheet

Each screen has a section. Each question looks like this:

```
- [ ] **Who can open it** `checkout-address/screen/access` * _(product)_
  Who can open this: public, signed-in, role:<name>?
  Answer:
```

- `*` means **mandatory**. The rest are recommended.
- `(product)` or `(designer)` says who is best placed to answer. The designer
  is still responsible for every answer.
- A ticked box means the design already answers it; it is shown so you can
  check it.
- A **Proposed:** line is Wave's own guess from the design, with its reason.
  It still needs a human: answer `yes` to accept it, or write the right
  answer instead.

### 4.2 Answering (product, or anyone)

Anyone who can open the page can edit it. Write after `Answer:` in plain
words, for example:

```
  Answer: only signed-in customers
```

You do not need to know the exact format; Claude will tidy it into
`signed-in`. If a question genuinely does not apply, the designer writes:

```
  Answer: waive: the confirmation page cannot fail, it only shows data
```

A waived question stops blocking, but stays visible (and is shown to
engineers) with its reason.

### 4.3 Checking the answers

When product says they are done, tell Claude Design:

> Run the Wave dry run again.

Wave reads the sheet, and marks each answer that is missing or not valid with
**Fix:** and the reason (for example "not a screen in this project"). Claude
converts plain-word answers into the right format and checks the changes with
you. Repeat until the sheet says the dry run **passed**. A passing run saves
**Wave answers** next to it.

---

## 5. Full run: design, check, confirm, upload

In Claude Design:

> Design and upload the Checkout screens for Shopfront.

What Claude does, and what it will ask you:

1. **Uses the catalogue exactly.** Components are copied from their
   specimens, never restyled. If a design needs something the catalogue does
   not have, Claude asks you: **"Is this a new component (or a new variant of
   X)?"** Yes: it is added to the catalogue first and you approve it. No: the
   element is rebuilt from an existing component. This is what stops the
   design drifting.
2. **Applies Wave answers** from the dry run, if there is one.
3. **Interviews you for anything still open**, grouped ("these 6 primary
   buttons..."). Whatever Wave inferred is shown to you to confirm or change;
   nothing inferred is written without your say.
4. **Uploads assets.** Images, SVG files, icons, logos and fonts that are
   local files or embedded are uploaded to Post-it's public asset store for
   the project, and the HTML is pointed at them. Links to other websites (stock
   photos, Google Fonts) stay as they are. Videos are not supported. Maximum
   10 MB per file.
5. **Replaces values with tokens.** Every colour, size, font, weight, shadow,
   duration, opacity and so on must be a token. If a value has no token,
   Claude asks: add a token, or use the nearest one?
6. **Preflight.** Wave checks the screen before upload: everything above,
   plus things that would make it look different in Post-it (see 5.1). Then
   Claude shows you what it changed from your design, what Wave proposed and
   you confirmed, what is waived, and the result, and asks:
   **"Does this match what you designed? May I upload it?"** It uploads only
   on a clear yes.
7. **Compare.** Claude gives you the Post-it link. Open it next to your
   design and check they look the same. If not, tell Claude what differs.
8. **Ask for review** once you are happy.

### 5.1 "It looks different in Post-it"

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

## 6. Reviewing a screen in Post-it

Open any screen. You see the mockup in the middle, **layers** on the left and
the **inspector** on the right.

### 6.1 Getting around

- **Inspect / Interact**: in Inspect mode a click selects an element; in
  Interact mode the mockup behaves as it will, and links open their screens.
  Ctrl or Cmd + I switches.
- **Mobile / Tablet / Desktop** and a width box change the viewport. Zoom is
  next to them.
- **Version** switches between saved versions of the screen.
- **Layers** lists every element by address. **Missing only** filters to
  elements with unanswered mandatory questions.

### 6.2 What the red means

- A **red mark** on a layer: that element has a mandatory question with no
  answer.
- A **red \*** on an inspector tab: something mandatory is missing on that tab.
- A **"N missing"** chip at the top: the total for the screen.

Waived questions stop being red but stay listed as **Waived** with their
reason.

### 6.3 The inspector tabs

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

### 6.4 Who can do what

| | Uploader (the designer who created the screen) | Everyone else |
| --- | --- | --- |
| Comment | Yes | Yes |
| **Confirm** a proposal, **Change**, **Answer**, **Waive**, **Withdraw** a waiver | Yes | No |
| **Confirm all N proposed** | Yes | No |

Every change the uploader makes in the inspector is saved as a new version of
the screen, so Claude Design always works from the latest.

### 6.5 Commenting

Select an element (Inspect mode), open **Comments**, write. You can also
comment on quoted words, an area, or the whole screen. The comment is pinned
to the element's permanent id, so it follows the element through new
versions. Claude Design picks up open comments, fixes them, and marks them
addressed with the version that fixes them; a reviewer confirms and resolves.

---

## 7. Approving a feature and handing over

Open the feature folder in Post-it. The **flow overview** lists every screen
with its **Missing** count, the flow graph (which screen leads where), the
data, actions and tokens used.

- **Approve the flow** is only possible when every mandatory question on every
  screen is answered or waived ("Every mandatory field is answered or
  waived"). Otherwise it says **Not ready to approve** and lists the blockers.
- Once approved, the flow is frozen and ready for engineering.

**Engineers**, in Claude Code:

> Build the Shopfront Checkout flow from Wave.

The Wave Build skill fetches the handover: HANDOVER.md (routes, flow graph,
data dictionary, actions with side effects and destinations, states, review
decisions and waived gaps), every screen, the component specimens, the tokens,
the assets with a manifest, and the answer sheet. It builds the components
first, then the screens, and asks rather than guesses where something was
neither specified nor waived.

---

## 8. Changing the design system later

- A new component or variant is only added when the designer says yes to "Is
  this a new component?". It is drawn in its specimen with every state and
  approved before use.
- When a component changes, every screen using it is flagged, because the
  catalogue view lists where each component is used.
- Tokens are per project. Adding or changing one is a catalogue change the
  designer approves. A screen whose values no longer match the token file is
  flagged until it is updated.

---

## 9. What Wave asks about each kind of element

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

## 10. Quick reference

### Things to say to Claude Design

| You want to | Say |
| --- | --- |
| Start a product | "Start a new Wave project called X." |
| Get questions for product | "Wave dry run for X / Feature." |
| Recheck answers | "Run the Wave dry run again." |
| Build and upload | "Design and upload the Feature screens for X." |
| Fix review comments | "Deal with the open comments on Feature." |
| Add a component | "Add a new component: ..." (you approve it) |

### Words

| Word | Meaning |
| --- | --- |
| Project | A product; owns tokens and components. |
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

### When something goes wrong

| Problem | What to do |
| --- | --- |
| Claude Design does not use Wave | Check the Post-it connector is on; add the optional instruction from 2.2. |
| "Nothing is uploaded until the catalogue is approved" | Finish the first-run catalogue (part 3). |
| Upload looks different | See 5.1; ask Claude to run preflight again. |
| You cannot confirm or waive in Post-it | Only the uploader can; others comment. |
| Cannot approve the flow | The overview lists the blocking questions per screen. |
| An asset is refused | Videos are not supported; files must be under 10 MB. |
