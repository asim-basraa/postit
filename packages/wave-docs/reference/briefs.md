# DESIGN.md and FEATURE.md

_Generated from the code by `@wave/docs`. Do not edit by hand: change the code and generate again._

Two briefs answer most questions once, for every element that inherits them.

## DESIGN.md

At the project root (page `design-md`). Its sections: **Product**, **Voice and copy**, **Visual language**, **Layout and breakpoints**, **Components**, **Interaction and states**, **Forms**, **Accessibility**, **Content and data**, **Analytics**. The template Wave gives a new project:

```markdown
---
wave: 1
name: Example
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

# Example design

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

## FEATURE.md

In each feature folder (page `feature-md`): the screens, the fields they write, the data they show and the actions they take. The template:

```markdown
---
wave: 1
feature: example-feature
name: Example feature
screens:
  first-screen: { title: First screen, route: /path }
fields:
  # path: { type, validate, options, default, visible-if, label }
data:
  # path: { type, source, description, empty, format }
actions:
  # id: { screen, on: [slug], trigger, effect, to, failure, confirm, feedback, track }
---

# Example feature

## Goal

## Flow

## Rules

## Outcomes
```
