---
name: Wave Brief
description: Interview the designer and write the project's DESIGN.md (its defaults and design language) in Post-it, so Wave never asks the same thing per element. Use once per project, before the design system and any screen.
---

# Wave Brief: DESIGN.md

DESIGN.md sits at the project root. Its **front matter** is the defaults
every element in the project inherits; its **prose** is the design language
you follow whenever you design for this project. A complete DESIGN.md removes
most of Wave's questions before anything is drawn.

## Steps

1. `wave_get_brief` (kind design, id = the project). It returns the saved
   file, or a template, and what is missing.
2. **Read before asking.** Take everything you can from what the designer
   already gave you: their prompt, brand notes, existing screens, the token
   file. Fill those in first; never ask what you already know.
3. **Interview for the rest, grouped**, a few questions at a time, each with
   your proposed answer to confirm or change:
   - Product: what it is, who uses it, the platforms and widths
     (`viewports`), the language (`lang`).
   - Content: is the copy in the designs final, draft or placeholder
     (`content.copy`)? Where will copy live: code, a CMS, translation keys
     (`content.source`)?
   - Access: who can open a screen by default: public, signed-in, a role
     (`access`)? Can everyone see every element (`element-access`)?
   - Analytics: are controls tracked, and with what naming convention
     (`analytics.controls`: none or e.g. object_action)? Page views
     (`analytics.page-views`)?
   - Feature flags by default (`flags`: none, or the flag system).
   - Forms: when errors show (`forms.validate-on`: submit, blur, change);
     warn on leaving with unsaved changes (`forms.dirty-guard`).
   - Data: what data-driven text shows with no value (`data.empty`: hide,
     a dash, text); long text (`data.overflow`: wrap, truncate, clamp:2).
   - Icons: the library (lucide, material) or inline SVG (`icons`).
   - Responsive: what sections and cards do on small screens by default
     (`responsive`: stack, hide, collapse, scroll).
   - Links to other sites (`links.external`: _blank or _self); how dialogs
     and toasts close (`overlays`).
4. **Write the prose**, one section each, in the designer's words where you
   can: Product, Voice and copy, Visual language, Layout and breakpoints, Components, Interaction and states, Forms, Accessibility, Content and data, Analytics. The visual language is concrete:
   colours with their hex values and roles, type families, sizes and
   weights, spacing scale, corner radii, shadows, motion. Components names
   every component the product needs. Forms carries the UX rules (when to
   use chips instead of a select, when errors appear, what is never
   disabled).
5. **Show the designer the whole file** and ask: "Is this right? Anything to
   change?" Change it until they approve.
6. `wave_save_brief` (kind design). Fix anything it still lists and save
   again.
7. Next: **Wave Design System** builds the tokens and components from it.

## The format

```markdown
---
wave: 1
name: Acme
lang: en
viewports: [390, 1280]
access: public            # who opens a screen by default: public, signed-in, role:<name>
element-access: everyone
icons: inline             # a library name (lucide, material) or inline
content:
  copy: final             # fixed text is final, draft or placeholder
  source: code            # code, cms or i18n
analytics:
  controls: none          # none, or a convention such as object_action
  page-views: none
flags: none
responsive: stack         # sections and cards on small screens: stack, hide, collapse, scroll
forms:
  validate-on: submit     # submit, blur or change
  dirty-guard: off
data:
  empty: hide             # what data-driven text shows with no value
  overflow: wrap
images:
  fit: cover
links:
  external: _blank
overlays:
  modal: close-button escape
  toast: auto:5
---

# Acme design

## Product

## Voice and copy

## Visual language

## Layout and breakpoints

## Components

## Interaction and states

## Forms

## Accessibility

## Content and data

## Analytics
```

Front matter values are what an element inherits when its own HTML says
nothing. An element can always override one (`data-wave-copy="draft"`,
`data-wave-track="checkout_started"`).

## What is never asked

Every element inherits, in this order, and anything inherited is not a
question:

1. **Its own HTML** (`data-wave-*`, native attributes).
2. **FEATURE.md**: the fields it writes (`data-wave-field`: rules, options,
   default, shown-when), the data it shows (`data-wave-bind`: type, source,
   empty, format), the action it takes (trigger, effects, destinations,
   confirm, tracking) and the screen's route, title and access.
3. **Its component** in the catalogue: states, variants, responsive
   behaviour, events; parts inside a component instance belong to it.
4. **DESIGN.md**: copy status and where copy lives, who can see things,
   analytics, flags, form behaviour, empty values, overflow, icons,
   viewports, language.
5. **What Wave knows for certain**: names (slugs), element types, a submit
   button's trigger, the action name, "none" for a control that only
   navigates.

When answers are applied, what came from FEATURE.md and what Wave is certain
of is written into the HTML; DESIGN.md and the catalogue stay the policy.
