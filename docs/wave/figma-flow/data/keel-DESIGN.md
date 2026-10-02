---
wave: 1
name: Keel
lang: en-US
viewports: [1440]
access: public
element-access: everyone
icons: inline             # Keel's own Icon component (Arrow right, Arrow left, Chevron down, Plus, Check, Check small)
content:
  copy: final
  source: code
analytics:
  controls: object_action
  page-views: one per screen
flags: none
responsive: stack
forms:
  validate-on: blur
  dirty-guard: off
data:
  empty: hide
  overflow: wrap
images:
  fit: cover
links:
  external: _blank
overlays:
  modal: close-button escape
  toast: auto:5
source:
  figma: https://www.figma.com/design/5Com7iQmv0VdLMBP3ELKQG/Keel
  design-system-page: "28:129"
---

# Keel design

## Product

Keel is a design and engineering studio. This site is its lead intake: a short, three-step qualification form (About you, Your project, Budget & timing) that ends on a result screen and an invitation to book a 30-minute call with a partner. Visitors are prospective clients, usually founders or marketing, product and engineering leads. Everything is public; nobody signs in.

The tone of the whole experience is a calm, senior conversation, not a sales funnel: "Your answers go straight to a partner, not a sales list."

## Voice and copy

- US English. Sentence case everywhere, including buttons ("See if we're a fit", "Book a 30-min call").
- Short, direct, second person. Headings are questions or plain statements ("First, who are we talking to?", "You're qualified.").
- Each step has a one-line intro that sets expectations ("Nothing here is binding.").
- Reassurance lives in small caption text under the stepper, not in banners.
- Eyebrows are mono, uppercase, numbered ("01 — About you").
- Copy in Figma is final and lives in the code.

## Visual language

- Tokens come from the Figma file's variables (Primitives and Semantics). Figma is the source of truth; the DTCG file in the design system mirrors it.
- Neutral, near-monochrome palette: ink `#111113` on white, warm greys for borders and secondary text. Cobalt `#2F4BDB` is the only accent: focus, links and the current step.
- Type: Geist for everything, Geist Mono for eyebrows, step markers and the header step count. Fifteen text styles: display, h1, h2, lede, title, body-lg, body, body-sm, label, caption, button, chip, eyebrow, logo, marker.
- Shapes: pill buttons and chips (radius full), 10px fields, 14px option cards. 1px borders; 1.5px for emphasis (current step, indicators).
- Selection is shown with an inset ink ring that reads as a 2px border without moving layout.
- Translucent white header with background blur. Two values are drawn in Figma without a token and Figma wins: the logo mark corner (6px) and the header blur (8px).

## Layout and breakpoints

- Designed at 1440 wide only. Content sits in a 1216px container with 48px gutters, centred under a 64px header.
- Form steps use two columns: a 430px left rail (eyebrow, heading, intro, stepper, reassurance) and a 602px question column, 88px apart.
- The result screen is a single 680px column.
- The tokens already define a 720px mobile breakpoint, a sticky mobile action bar and a 56px mobile header. Mobile frames are not drawn yet; when they are, sections stack.

## Components

The Figma Design System page holds the components every screen uses. Screens use instances, never drawn copies.

- Brand: Logo, Icon (6 line icons; recolour the stroke on the instance).
- Actions: Button (Primary, Secondary, Ghost, Link; Default, Hover, Disabled; optional icon).
- Form controls: Text field and Select (label row with Optional marker, 48px control, helper line; Default, Filled, Focus, Error, Disabled), Chip (single-select pill), Checkbox, Radio, Option card (Checkbox or Radio type), Segmented control with Segment items (currency).
- Navigation and content: Header (Step, Complete), Stepper item (Upcoming, Current, Completed with an answer summary), Summary stat, Next step item, Success mark.

## Interaction and states

- Steps move forward with Continue and back with the Back ghost button or by clicking a completed step in the stepper. Answers are kept while moving between steps.
- While submitting, the primary button shows a spinner (one turn per 700ms). On failure, an inline error line appears above the actions and every answer is kept.
- Motion: 120ms for press and hover colour, 200ms for borders, focus and selection, 320ms for step transitions, 600ms for the success check. Buttons and cards press to 98%, chips to 97%.
- "Back to website" opens keel.studio in a new tab.

## Forms

- Every field is required unless it shows "Optional" in its label row.
- Fields are checked when the person leaves them (on blur). Errors show in the field's helper line in the error colour, with the error focus ring.
- Single choices are chips or radio option cards; multiple choices are checkbox option cards ("Select all that apply").
- Leaving the site part-way gives no warning.

## Accessibility

- WCAG 2.2 AA.
- Every control has a visible focus ring: the 28% cobalt halo on buttons, chips and cards, the 18% halo on text fields, and the red halo on an invalid field.
- Controls are at least 44px tall. Field labels are real labels; Optional and helper text are tied to their field.
- Colour is never the only signal: selected chips and cards also change their border.

## Content and data

- The sample person is Maya Okafor at Northwind; recaps on later steps and the result screen echo the answers given earlier ("Maya Okafor · Northwind", Scope, Budget, Start).
- Data-driven text with no value is hidden.
- Currency follows the Segmented control (USD default, EUR, GBP); budget ranges show in the chosen currency.

## Analytics

- Every action sends an event named object_action (for example step_completed, form_submitted, call_booked).
- Every screen sends one page view, so drop-off between steps can be measured.
