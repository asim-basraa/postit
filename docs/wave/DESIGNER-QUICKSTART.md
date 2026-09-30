# Wave for designers: the quick guide

The whole journey on one page. Everything happens in two places: you talk to
**Claude Design**, and you look at the results in **Post-it**. The full
manual has the detail behind each step.

## Once: set up (5 minutes)

1. Sign in to Post-it and open the **Design** space.
2. In Post-it: **Your account**, **Connect to Claude**. Make a token for the
   Design space and copy the **Connector URL**.
3. In Claude: **Settings**, **Connectors**, **Add custom connector**, paste
   the URL, name it Post-it. Switch it on in your Claude Design project.

That is all. Claude Design now follows Wave's rules on its own.

## Once per product: DESIGN.md and the design system

4. Say: *"Start a new Wave project called Shopfront. Here are my designs."*
5. Claude writes **DESIGN.md** with you: how copy is managed, who can see
   what, analytics, form behaviour, widths, and the design language in
   words. It fills in what your designs and notes already say and asks the
   rest with a proposal each time. Approve it. Every screen inherits it, so
   these are never asked again.
6. Claude lists the colours, sizes and fonts as **tokens**. Check the names
   and values.
7. Claude proposes each **component** (buttons, inputs, chips, cards...):
   variants, every state, what it does on mobile. Correct it in plain words.
8. Look at the component pages it makes. When they are right, say
   **"Approved."** Nothing is uploaded before this.

## Each feature: brief, then design

9. Give Claude your prompt as usual: *"Design the Checkout feature for
   Shopfront: ..."*. It first writes **FEATURE.md** from it (the screens,
   every field and its rules, the data shown, what each button does and
   where it goes). It asks only what your prompt leaves open. Approve it.
10. Claude designs the screens from the brief, with the Wave attributes
    already in place.
11. Claude reviews them and asks only what is still open, **grouped** ("these
    3 step buttons are disabled: when can people jump to a step?"). Say yes
    to its proposal or correct it. If something really does not apply, say
    *"waive it: <why>"*.
12. Product questions go in the **Wave questions** page (say *"Wave dry
    run"*); send it to product, then say *"Run the Wave dry run again"* until
    it passes.
13. If you draw something new, Claude asks **"Is this a new component?"** Yes
    adds it to the design system (you approve it); no reuses an existing one.

## Upload and check

14. Claude shows you each screen with what it changed and asks **"May I
    upload it?"** Say yes only if it matches your design.
15. Open the Post-it link it gives you and compare it with your design side
    by side. If anything looks different, tell Claude what.

## Make it clickable

16. Say: *"Make Checkout a prototype."* Claude drafts the mock API from your
    screens (the data they show, the actions they take) and shows you the
    **Data requirements**. Add realistic data and the errors product
    expects. Have an OpenAPI file from engineering? Give it to Claude instead.
17. Open the prototype (**Play prototype** on the feature's page). Click
    through it on **Mobile** and **Desktop**. Use **Scenarios** to try the
    failures (card declined, server error) and **Slow network** to see your
    loading states.
18. To show it to someone without an account: **Share the prototype** on the
    feature's page (or say *"Share the Checkout prototype with the client"*).
    Copy the link straight away; it is shown once. Revoke it there when you
    are done.

## Review and hand over

19. Say *"Ask for review."* Reviewers comment on elements in Post-it.
20. Say *"Deal with the open comments on Checkout."* Claude fixes them and
    marks them addressed; reviewers confirm.
21. When every screen shows **0 missing** and is approved, click **Approve
    the flow** on the feature's page. Engineering builds from it with Claude
    Code.

## If something is off

| You see | Do |
| --- | --- |
| Claude does not ask about project and feature | Check the Post-it connector is switched on. |
| Many questions about copy, access or tracking | DESIGN.md is missing something; say *"Update DESIGN.md: ..."*. |
| Many questions about fields or buttons | Say *"Update FEATURE.md: ..."* with what your prompt left out. |
| The upload looks different from your design | Tell Claude what differs; it fixes and re-checks. |
| Red marks and "N missing" in Post-it | Open the screen, click a red layer, answer or ask Claude to. |
| The prototype shows your sample text, not data | Claude needs to add that data to the mock API (see Notes in the prototype). |
| A button does nothing in the prototype | It has no destination yet; tell Claude where it should go. |
