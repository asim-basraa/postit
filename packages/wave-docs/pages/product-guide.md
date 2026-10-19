# Answering Wave's questions: the product guide

A design shows what the product looks like. Wave also needs to know how it
**behaves**: what each field accepts, what each screen shows and where its data
comes from, what each button does and where it goes when it works and when it
fails, who may see what, what is tracked. Wave asks those questions once,
grouped, with a proposal where it can make one, and nothing is built until
they are answered. Many of them are product decisions. This guide is for the
product person who answers them.

## Where you come in

| Stage | What Wave asks | Where the answer goes |
| --- | --- | --- |
| 1. Brief (once per project) | Defaults for every screen: is the copy final, who may open screens, what is tracked, what empty data shows, form behaviour | DESIGN.md, the project's brief |
| 3. Feature (each feature) | Every field, the data on each screen, every action and where it leads | FEATURE.md, the feature's brief |
| Review (each feature) | Whatever is still open after the briefs, per element | The question sheet and the screens |

One answer in a brief fills every element that uses it, so most questions are
answered there, not screen by screen. Stage 2 (the design system) is the
designer's; you are not asked anything.

## Set up, once

1. **Claude** (claude.ai or the desktop app) with the **Post-it connector**: in
   Post-it, open Your account, then Connect to Claude, add the address shown
   there as a connector, click **Connect**, sign in and click Allow.
2. **Access** to the project's space in Post-it, so you can read and edit its
   briefs and question sheets. Ask whoever runs Wave for your team.

You do not need Figma, a command line or the Wave skills.

## The questions you answer

| Area | Typical questions |
| --- | --- |
| Fields | What does it save, is it required, what are its rules (length, format, allowed values), its options and default? What does a "Other" choice open? |
| Samples | For each field the happy path fills, a realistic value the tests type or pick |
| Data | What does each screen show, where does it come from, what does it show when there is nothing? How are prices, dates and names formatted? |
| Actions | What does each button do (save, call an API, go somewhere), where does it go when it works, what happens when it fails, does it ask to confirm? |
| Rules | When is a button disabled, when is a section shown or hidden? |
| Access | Who may open the screen, who may see an element? |
| Tracking | Is it tracked, and what is the event called? |
| Content | Is the copy final, draft or placeholder, and where does it live (code, a CMS, translation keys)? |

## How to answer

### In Post-it: the question sheet

When the designer or engineer runs the **Wave dry run** for a feature, Wave
saves a page called **Wave questions** in the feature's folder and sends you
its link. It looks like this:

```
## For product

- [ ] **Disabled when** `group/disabled-if/3` * _(product; 3 × button)_
  When can it not be pressed?
  Applies to: ...
  Answer:
```

- Write after `Answer:` in plain words. Claude turns it into the exact format.
- `*` is mandatory. Optional questions are hidden unless someone asks for them.
- `group/...` means one answer fills every element listed.
- **Proposed:** is Wave's guess with its reason: answer `yes` to accept it, or
  write the right answer.
- A question that does not apply: say so and why. The designer waives it with
  your reason, and engineers see the reason in the handover.

Tell the designer or engineer when you are done. They run the dry run again;
anything missing or not valid comes back marked **Fix:**. When everything
mandatory is answered, the sheet says the dry run **passed** and Wave saves
**Wave answers** next to it.

### In Claude: ask, then answer

You can do the same in a conversation, which is easier for many questions at
once:

> Show me the open Wave questions for `<project>` `<feature>`.

Claude lists them (`wave_warnings`), mandatory first, each with a link that
opens the element in Post-it. Answer in plain words, a few at a time. Claude
puts each answer where it belongs:

- an answer about a field, the data or an action goes into **FEATURE.md**
  (one answer for every screen that uses it);
- a default for the whole project goes into **DESIGN.md**;
- an answer about one element on one screen is applied to the screen by the
  person who uploaded it. If that is not you, Claude leaves your answer as a
  comment on the element for them.

Claude shows you the brief before saving it, and saves only when you agree.

### In Post-it: on the screens

Open a screen in the feature. Elements with an unanswered mandatory question
have a **red mark**; the inspector's **Required here** block lists each
question as Answered, Proposed, Missing or Waived. Comment on the element with
your answer; the designer applies it.

## Check your answers in the prototype

Every feature plays as a working prototype: open the feature folder and click
**Play prototype**. Fill the forms, press the buttons, switch **Scenarios** to
see what happens when a call fails. If a screen does not behave as the product
should, comment on the element: that is an answer to change, not a design to
redraw.

## When the feature is approved

The feature can be approved only when every mandatory question is answered or
waived and its end-to-end tests pass on the prototype. After that the feature
is locked: a change of behaviour means reopening it. Engineers build from the
handover, which carries every answer and every waiver with its reason, so
nothing has to be explained again.
