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

## Once per product: the design system

4. Say: *"Start a new Wave project called Shopfront. Here are my designs."*
5. Claude lists the colours, sizes and fonts it found as **tokens**. Check the
   names and values, and correct them.
6. Claude asks about each **component** (buttons, inputs, cards...): its
   variants and states. Answer in plain words.
7. Look at the component pages it makes. When they are right, say
   **"Approved."** Nothing is uploaded before this.

## Each feature: design it

8. Say: *"Design the Checkout feature for Shopfront."* Design as usual.
9. Want product to answer their questions first? Say *"Wave dry run."*
   Claude makes a **Wave questions** page. Send it to product; when they have
   filled it in, say *"Run the Wave dry run again"* until it passes.
10. Claude asks you what is still open, grouped ("these 3 buttons..."). It
    shows what it guessed; say yes or correct it. If something really does
    not apply, say *"waive it: <why>"*.
11. If you draw something new, Claude asks **"Is this a new component?"**
    Yes adds it to the design system (you approve it); no reuses an
    existing one.

## Upload and check

12. Claude shows you each screen with what it changed and asks **"May I
    upload it?"** Say yes only if it matches your design.
13. Open the Post-it link it gives you and compare it with your design side
    by side. If anything looks different, tell Claude what.

## Make it clickable

14. Say: *"Make Checkout a prototype."* Claude drafts the mock API from your
    screens (the data they show, the actions they take) and shows you the
    **Data requirements**. Add realistic data and the errors product
    expects. Have an OpenAPI file from engineering? Give it to Claude instead.
15. Open the prototype (**Play prototype** on the feature's page). Click
    through it on **Mobile** and **Desktop**. Use **Scenarios** to try the
    failures (card declined, server error) and **Slow network** to see your
    loading states.
16. To show it to someone without an account: **Share the prototype** on the
    feature's page (or say *"Share the Checkout prototype with the client"*).
    Copy the link straight away; it is shown once. Revoke it there when you
    are done.

## Review and hand over

17. Say *"Ask for review."* Reviewers comment on elements in Post-it.
18. Say *"Deal with the open comments on Checkout."* Claude fixes them and
    marks them addressed; reviewers confirm.
19. When every screen shows **0 missing** and is approved, click **Approve
    the flow** on the feature's page. Engineering builds from it with Claude
    Code.

## If something is off

| You see | Do |
| --- | --- |
| Claude does not ask about project and feature | Check the Post-it connector is switched on. |
| The upload looks different from your design | Tell Claude what differs; it fixes and re-checks. |
| Red marks and "N missing" in Post-it | Open the screen, click a red layer, answer or ask Claude to. |
| The prototype shows your sample text, not data | Claude needs to add that data to the mock API (see Notes in the prototype). |
| A button does nothing in the prototype | It has no destination yet; tell Claude where it should go. |
