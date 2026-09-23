# Post-it: QA handover

Everything a tester needs to start, plus the things worth knowing before you
file a bug.

**Start here.** The next section replays the two questions QA asked last round
and answers both, with the steps to verify each. One of them describes correct
behaviour the product failed to explain; the other was a genuine bug and is fixed.
Reading it first will save you filing the first one again.

Also this round: **a page can now be a static HTML document or a JSON file**, as
well as Markdown, and files can be brought in with **Upload** rather than typed.
A document can be **sent for review and approved**, if its author asks for one.
**Sharing a whole space** is offered where people were already trying to do it,
which is where the last report came from, and **being put into a space** finally
tells the person it happened to.

**New since that was written**, and the two worth your time first:

- **Skillsets.** A space can say that what it holds is skills, and those skills
  can then be installed by agent tooling outside Post-it, as files. The whole
  claim to attack is that this changes nothing about who can read anything. See
  [Skillsets](#skillsets-and-installing-them-anywhere).
- **Code blocks are legible in dark mode.** They were not: pale blues and a grey
  comment on a near-black panel. This is a visual change and nothing automated
  can tell you whether it looks right. See
  [Fixed since the last round](#fixed-since-the-last-round).

Start at [What a page can be](#what-a-page-can-be-articles-skills-html-and-json)
— it is the new surface and the one worth the most attention. The front page is
real rather than a holding page, and a link shows that it has been clicked. Full
list under [Fixed since the last round](#fixed-since-the-last-round).

---

## Answers to last round's questions

QA asked two questions about teams. Both were fair, and they have different
answers: the first describes correct behaviour that the product never explained,
and the second was a real bug. Read both before testing teams, or you will file
the first one again and miss what was actually wrong.

### 1. "If a user is added to a team but the space is not shared with that user, what is the purpose of adding them to the team?"

**Verdict: working as designed. The product was wrong to leave you guessing, not
wrong in what it did.**

A team is **a name you can share with**, not a bundle of access. Adding somebody
to a team grants them nothing at all, and that is the point.

Consider the alternative. If membership carried the team's access, then adding
one person to a team would hand them, in a single click, everything that team had
ever been given — including pages shared with it months ago by somebody who has
since left, which nobody present remembers. Access would arrive silently, in
bulk, as a side effect of an administrative act. In a product whose whole subject
is who can see what, that is the worst possible default.

So the purpose of adding them first is what happens next:

- Share a folder **with the team**, once, and everybody on it can read that
  folder and everything beneath it.
- Add a fourth person later and they get the same thing, without anybody
  revisiting the folder.
- Take somebody off the team and their access goes with them, in every folder
  the team was ever given.

That is the whole value: sharing once instead of five times, and revoking once
instead of five times. Until the first share happens, a team is a list of names
and nothing more — correctly.

**What changed.** Nothing about the behaviour. What changed is that the product
now says so, in three places:

- The owner's **Teams** screen: the description no longer implies membership is
  access, and each team carries a **What this team can reach** list. When that
  list is empty it says "Nothing yet", explains that being on the team grants
  nobody anything on its own, and tells you how to change it.
- The member's **`/teams`** screen: a team with nothing shared says "Nothing has
  been shared with this team yet, so it gives you nothing to read for the
  moment. That is the ordinary state of a new team, not a fault."
- This document.

**How to verify.** Create a team, add somebody, share nothing. They must be able
to see the team exists and must **not** be able to read anything in the space.
Both screens should tell you that is expected. Then share one folder with the
team and watch it appear for them.

This is asserted at the database level too, so it cannot drift: a member of a
team with no grants resolves to no role and no read on every node in the space.

### 2. "If the user can only see a notification on the welcome screen but cannot see what is inside the team or who else has been added to the team, how is the team functionality expected to work?"

**Verdict: a real gap, and it is fixed.**

You were right, and the problem was worse than "a bit opaque" — it was
asymmetric. The question this product exists to answer is *who can see what*, and
until now:

- The **space owner** could see the team, its roster, and what it reached.
- The **people on the team** could see none of those three things.

So somebody added to "QA" would find a folder appear in their list with no
account of where it came from, no way to learn who else could read what they
wrote in it, and a notification on the welcome screen that was not even a link.
The one question they had — *why can I see this, and who else can?* — had an
answer for one party and none for the other.

**What changed.** A member now gets the same answer the owner does:

| Before | Now |
| --- | --- |
| Roster readable by the space owner only | Readable by the owner **or** anybody on the team |
| No screen for a member at all | **`/teams`**, listing every team you are on |
| "Added to this team" notification went nowhere | It links to `/teams` |
| No way to learn why a folder appeared | Each team lists what being on it lets you read |

For each team you are on, `/teams` shows the space it belongs to, how many people
are on it, who added you, **who else is on it**, and **what being on it lets you
read** — each entry a link straight to the page or folder.

**What deliberately did not change: seeing is not administering.** This is the
part most worth trying to break. A member has no write of any kind:

- `/spaces/<slug>/teams` is still a plain 404 for anybody but the space owner.
- A member cannot add anybody, remove anybody, rename the team, delete it, or
  share anything with it. Every one of those is refused with a 404.
- Only the space owner can remove somebody from a team — including themselves.
  A member cannot leave a team on their own. That is a known gap, listed below;
  do not file it as a bug.

**How to find it.** **Your spaces** carries a **You are on N teams** line when
you are on any, which goes to `/teams`. So does the "added to this team" entry in
**Shared with you**.

**How to verify, including the refusals.**

1. As the owner, create a team in your space and add two other people.
2. As one of them, open `/teams`. You should see the team, the space it is in,
   who added you, and both other names under **Who else is on it**.
3. Still as them, try `/spaces/<slug>/teams` directly. You must get a 404 —
   the same answer a typo gives, not a "permission denied".
4. As the owner, share a folder with the team.
5. Back as the member, reload `/teams`. The folder must be listed, with the role
   it carries, and clicking it must open it.
6. As somebody on **no** team: no **You are on N teams** line anywhere, `/teams`
   says you are on no teams, and asking for that team's roster directly returns
   nothing at all — not an error, nothing, which is what a team that does not
   exist also returns.

One thing to know before you file it: `/teams` shows your team-mates' email
addresses. That is deliberate. You are on a named team together, somebody put you
both there, and knowing who else can read what you write is exactly the thing
this product is for. It stops at the team — it reveals nobody in the space who is
not on a team with you.

---

## What Post-it is

A knowledge garden where **who can see what is the product**, not a setting on
the side of it. People write Markdown in spaces, organise it in folders, and
share individual pages or whole folders with named people, with teams, or with
the public.

The one idea to hold in your head while testing: **content you are not allowed
to read must be indistinguishable from content that does not exist.** Not "you
do not have permission", which admits the page is there. A plain 404, the same
one a typo produces. If you ever find a way to tell the difference, that is a
bug and it is the most valuable bug you can file.

---

## Getting in

**Staging:** https://web-staging-347f.up.railway.app

**Read `/docs` first.** It is public, needs no account, and explains what Post-it
is, how to connect it to Claude, and what a connected Claude can and cannot
reach. It is also a thing to test in its own right.

**Then read the Post-it space**, at `/s/postit`, once you are signed in. It is
the same material as living content: what Post-it is, connecting Claude, how
sharing works, and six starter skills you can copy into your own space. It is
shared with everyone who has an account and with nobody who does not, so it
doubles as a check on that: open `/s/postit` in a private window and it must
404.

**Signing up.** Registration is open to anyone with a `@maqsoodlabs.com`
address. Everyone else is refused unless they have been invited.

**Being invited.** Somebody sharing a page or folder with an address that has
no account now invites it. The invitation email arrives from Post-it; following
the link asks you to set a password and then puts you straight on the thing you
were shared. That is the route in for a tester whose address is not on
`maqsoodlabs.com`: ask somebody to share something with you.

**Confirming your email.** You get a real confirmation email; the link signs you
in and lands you on your spaces. If it does not arrive, check spam before
reporting it, then report it.

**Registering an address that already has an account sends nothing.** The form
still says a link is on its way, because Supabase deliberately refuses to
confirm or deny whether an address is registered: doing so would turn the
signup form into a way of discovering who has an account. So if you are waiting
on an email that never comes, try signing in before reporting it. This is not a
bug, and it is the single most common way to lose ten minutes here.

**Forgot your password** works from the sign-in page and sends a real email too.

---

## What to test, and what "correct" looks like

### Your account

The header of every signed-in page shows the address you are signed in as, and
that is a link to `/account`. Worth checking with two accounts open in two
browsers: each header must name its own.

The account page gathers what is about you rather than about a space: which
account this is, your spaces, connecting Claude, and changing your password.
Changing it there should tell you it worked and leave you where you are; the
old password must then be refused at sign-in and the new one accepted.

### Spaces and pages

Create a space, and it comes with a welcome page. Inside, build folders and
pages, rename them, move them about, delete them.

**Moving, new this round, and QA was right about it.** The last document said you
could drag things about and you could not: moving was fully built underneath —
the endpoint, the rewriting of every descendant's address, the refusal to make a
folder its own ancestor — and nothing in the tree ever asked for it. That was a
documentation bug on my side, not a misreading on yours.

There are now two ways, and they do the same thing:

- **Drag a row** onto a folder. The row you are dragging fades, the destination
  is outlined, and illegal destinations refuse the drop rather than accepting it
  and failing. To take something back out to the top level, drop it on the
  **Files** header, which says "Move to the top level" while you are over it.
- **The Move button** on the row, which opens a list of destinations. This exists
  because a drag cannot be done from a keyboard and does not work **at all** on a
  touchscreen — that is a limitation of drag-and-drop in browsers, not a bug to
  file. On a phone or tablet, Move is the way, and it is not a lesser one.

Worth trying to break: a folder must not be offered as a destination for itself
or for anything inside it; where something already is must be listed but refused
rather than being a move that silently does nothing; and everything inside a
moved folder must come with it, with its address changed to match.

The space's own front page is not one of the files: it has its own link above
the tree, and it is renamed by renaming the space. Renaming the space changes
its name in the header, on its front page, and in the list of spaces, and
leaves the address alone.

New pages and folders are made from the tree header for the top level, and from
a folder's own page for anything inside it. Click a folder to open it.

Things worth trying to break:

- Rename a page, then open it. The heading at the top must be the new name.
  A page is titled by its name, never by whatever the body says.
- Rename a folder while you are reading a page inside it. You should be carried
  to the page's new address, not stranded on a dead URL.
- Rename a space, then reload /spaces and the space itself. Both must say the
  new name, and every link you had must still work.
- Give two things in the same folder the same name. It should refuse, clearly.
- Move a folder into itself. It should refuse.
- Delete a folder with pages in it. The pages go too, which is intended.

**A space of your own. New this round.** Signing up now creates one, private to
you, addressed from the part of your email before the @ — `asim@…` gets
`/s/asim`. If that address is taken the next person gets `/s/asim-2`. It is
listed first under **Spaces**, marked *yours, and private*.

- Everybody who signed up before this round has one too; it was created for
  them, and nothing they already had moved or changed.
- Nobody else can see it or anything in it, whatever they are told to try.
- It is an ordinary space otherwise: rename it, share out of it, delete it.
- Work sent home out of somebody else's space (**Remove from space**) lands
  here now, rather than in a space minted for the occasion.

**Telling file types apart. Also new.** Every file in the tree and in a folder's
listing carries its format at the head of its name — `MD`, `HTML`, `JSON` — so a
list of names says what is in them. The word after a name is what it is *for*
(`skill`) or what is happening to it (`review`), which is a different question.

### Editing

Pages are Markdown. The editor is deliberately plain: a text area, a Save, a
Cancel.

**Concurrent edits.** Open the same page in two browsers, edit both, save both.
The second save must be refused and must show you the version that is now
stored, with your own text still in the box. Nobody's writing is ever silently
overwritten. This is worth trying hard to break.

**What renders:** GitHub-flavoured Markdown, callouts, highlights, LaTeX maths,
syntax-highlighted code, and Mermaid diagrams. A malformed diagram shows its
error and its source rather than disappearing.

### Wikilinks and backlinks

Write `[[Some Page]]` to link to another page in the space. At the bottom of
every page, "Linked from" lists the pages that point at it.

The one that matters: a link to a page **you cannot read** and a link to a page
**that does not exist** must look exactly the same, an inert grey span. If a
forbidden link looks different in any way, that difference is a leak.

### Sharing

Every page and folder has a Share dialog for whoever administers it.

- Share is offered in two places for every page, folder and skill: beside it in
  the sidebar, and at the top of whatever you are reading.
- Share with a person by email, as viewer, editor or admin.
- Share with a team, if the space has any.
- Sharing a folder reaches everything inside it, at any depth.
- The dialog lists who has access and, for inherited access, names the folder it
  came from. "Why can this person see this" should always have an answer.
- Revoking takes effect on the next request.

Try: share a folder, then check a page three levels down. Try: share one page
and confirm its siblings still 404. Try: raise somebody from viewer to editor
and confirm the Edit link appears for them.

**Sharing a whole space. New this round, from a real report.** A space was
shared with a team from its front page, and the team saw the front page and
nothing else. That was correct and badly explained: **a space's front page sits
beside its folders, not above them**, so a grant on it reaches that one page.
Access flows downward from the thing you shared, and the front page has nothing
under it.

So the dialog on a space's front page now says that, and offers the thing
people meant:

- **Give them → The whole space** (the default, for the space's owner) adds
  them as a **member**. Members hold at least editor on everything in the
  space, including whatever is created later. There is no role to choose,
  because membership does not have one.
- **Give them → This page only** is the old behaviour, still there, now
  labelled.
- For anybody who is not the space's owner, the dialog explains that sharing
  the front page does not reach the folders and that only the owner can hand
  over the space.

Worth testing hard, because this is the shape of the original bug: give a team
the whole space, then check a folder created **after** that, and one created
before. Both must open. Then share only the front page with somebody else and
confirm the folders still 404 for them — that is correct, not a regression.

**Members** beside the space's name does the same thing and is still there.

**What the person on the other end sees.** This was reported as missing twice,
so it is worth stating exactly. There are two cases and they behave
differently on purpose:

| You share with | What reaches them |
| --- | --- |
| An address with **no account** | An invitation **email**, because that is the only way they can get in at all. See [Inviting somebody who has no account](#inviting-somebody-who-has-no-account). |
| Somebody who **already has an account** | An entry at the top of **Your spaces**, marked new, naming you. See [Shared with you](#shared-with-you). **No email.** |

There is deliberately no email in the second case, and that is a gap rather
than a decision: see the note at the end of [Shared with you](#shared-with-you).

### Teams

Changed this round. The two questions QA asked are answered in full under
[Answers to last round's questions](#answers-to-last-rounds-questions), including
how to verify each one; this section is the mechanics.

**The owner's side.** From a space you own, the **Teams** button in the header.
Create a team, add people by email, share a folder with the team.

- Removing somebody from a team removes their access immediately.
- Deleting a team removes every grant made to it.
- A member of a team cannot manage that team. Only the space owner can.
- Opening a team now shows **What this team can reach** beneath the roster. When
  nothing has been shared with it, it says so, and says how to change that.

**The member's side, new.** `/teams`, reached from **You are on N teams** on
**Your spaces**, and from the "added to this team" line in **Shared with you**,
which used to be the one notification in the product that went nowhere. For each
team you are on it shows the space it belongs to, how many people are on it, who
added you, **who else is on it**, and **what being on it lets you read**.

It is read-only, deliberately and completely. A member cannot add anybody,
rename the team, or share anything with it. `/spaces/<slug>/teams` is still a
plain 404 for anyone but the owner, and so is every write behind it.

Worth checking, because it still reads oddly the first time: a new member is told
they joined the team even though **team membership by itself grants no access to
anything**. That is correct, and `/teams` now says so on the team's own card.

**Worth trying to break.** Somebody on no team should get nothing: no **You are
on N teams** line on **Your spaces**, an empty `/teams` that says as much, and
nothing at all from a roster they ask for directly. Somebody on one team should
see that team and no other, and nobody's addresses but their own team-mates'.

### People, for a platform administrator

A **People** link appears in the header for administrators and for nobody else.
Everyone else gets a plain 404 on `/admin`, the same answer a typo gives, and
no link anywhere hinting the screen exists.

It lists every account with **how much they hold and never what it says**: how
many spaces, articles and skills they own, how many bytes that comes to,
whether they are disabled, and when they last signed in. Content is attributed
to whoever owns the space it sits in.

The property worth attacking hardest: **being an administrator is not access.**
Make somebody an administrator, then have them open a space they were never
shared. It must still 404. If an administrator can read somebody's writing
anywhere in this product, that is the highest-priority bug on this page.

- **Make admin / Stand down.** An administrator can appoint and remove others.
  The last one cannot stand themselves down, because a platform nobody can
  administer has no way back through the interface.
- **Disable.** Stops somebody signing in and touches nothing they hold. Their
  spaces, pages and grants are exactly as they were; enabling puts them back
  with nothing to restore. Check that a disabled person is refused at sign-in
  and that their shared pages still work for everybody else.
- **Hand over.** One space at a time, to a named person. The new owner
  administers everything in it; the old owner keeps only what they were
  separately granted.
- **Delete.** Refused while they still own a space, and the message says how
  many. Hand the spaces over first, then delete. The database refuses it too,
  so there is no route, including through the API, where deleting an account
  quietly takes a team's writing with it. Worth trying to find one.
- You cannot disable or delete **yourself**, and the buttons are not offered.

**Putting somebody on a team, from here. New this round.** Every row has a
**Teams** button. It opens what that person is on, and a picker of every team
they are not on, with **Add**. **Remove** takes them off one.

It is the same power the Teams screen has, from the side you are usually asking
from: you are looking at a person and thinking "which teams do they belong on",
not at a team wondering who is missing. Both go through the same endpoints and
are refused in SQL for anybody who is not an administrator.

- A team somebody is already on is not offered again.
- Adding somebody shows up for **them** under **Team updates** on their spaces
  page, and on their `/teams`.
- Being on a team still grants nothing by itself. The dialog says so, and that
  remains the thing most often misread about teams.

### Who can see this

One control at the top of the Share dialog, with four settings:

| Setting | Who that is |
| --- | --- |
| Private | Only the people and teams listed below, and the space's owner. |
| Everyone signed in to Post-it can read | Every person who can sign in. |
| Everyone signed in to Post-it can edit | The same people, with writing. |
| Public | The open internet. No account at all. |

The distinction between the middle two and the last matters more than anything
else on this screen, and it is what the whole control exists to keep apart.
Share a folder with everyone signed in, then open it in a private window: it
must still 404.

- **They are exclusive.** Publish something that was shared with everyone, and
  the grant to everyone is withdrawn; go back, and the public one is. Check the
  "Who has access" list after each change: there should never be two answers.
- Everyone can never be given admin, and the public can never be given editing.
  Neither is a decision anybody makes on purpose.
- A published folder publishes everything inside it. Open a published page in a
  private window: it should render, with a Sign in link and no editing.
- On a page that is public or shared *because a folder above it is*, the
  control shows this page's own setting and a line underneath naming the folder
  it comes from. Setting this page to Private there will not make it private —
  the message says so rather than letting you believe otherwise.

### Shared with you

**Your spaces** carries a **Shared with you** list at the top, in **two
sections since this round**:

| Section | What lands in it |
| --- | --- |
| **Content updates** | Pages, folders and skills granted to you by name; anything granted to a team you are on; and **being put into a whole space**, which is new |
| **Team updates** | Being added to a team |

Newest first within each, with who did it, and the recent ones marked **new**
until you have seen the list once.

**Being added to a space is new here and worth testing on its own.** It was the
one kind of access that arrived in complete silence: every folder in a space,
and everything anybody adds to it tomorrow, with no notice at all. It now reads
"the whole space", or "the whole space, through the *name* team" when that is
how it reached you, and the link opens the space. The owner is not told they
were added to their own space.

This is what closes the gap where sharing with somebody who already had an
account did nothing they could see.

- Share a page with a colleague who has an account. It must appear at the top
  of their spaces list, marked new, naming you.
- Reload. The new marks go, and the entries stay.
- Add somebody to a team. That appears too, even though team membership by
  itself grants no access to anything. **New:** that line is now a link, and it
  goes to `/teams`. It used to be the one entry in this list that went nowhere,
  which is exactly the complaint QA filed about teams.
- Nothing in anybody else's list, and nothing in the sharer's own: they did it,
  so it is not news to them.
- Owning a space is not being shared it, and must not appear.

**Where to find it:** the top of `/spaces`, which is where signing in lands
you. Nowhere else. There is no badge elsewhere in the product, no email, and
nothing inside a space.

> **Known gap, do not file it.** There is no **email** to somebody who already
> has an account, only this list. The only mail this product sends is sent by
> the auth service on its own account when it invites a new address; there is
> no mail sender configured for anything else, and adding one is a decision
> about infrastructure rather than a bug. Ask Asim before filing anything about
> it.

### Inviting somebody who has no account

Share with an email address that has never signed up. Post-it invites it: the
person appears in the list, and an invitation email goes out.

- Follow the link in that email. It should land on a page asking for a
  password, and after setting one you should be signed in and able to read the
  thing you were shared — not an empty list of spaces.
- Only an administrator of the item can invite. An editor sharing with a new
  address gets a 404, the same answer as for an item that does not exist.

### History

Every page has a **History** button next to Share. It is offered to anyone who
can read the page, not only to editors: "what did this say last week" is a
reader's question at least as often as a writer's.

- Pick a version on the left and the diff on the right compares it with the
  page as it stands. Unchanged lines show as unchanged, so a small edit reads
  as a small edit rather than a wholesale rewrite.
- **Only the last three versions are kept.** The newest entry is the page as it
  stands, so you can go back two saves and no further. Save a page four times
  and the first of those four is gone for good. That is deliberate, not a bug.
- **Restore** puts the old text back by writing it forward as a new version, so
  the restore is itself in the history and can itself be undone. It also
  pushes the oldest entry off the end, so the list stays at three.
- A viewer sees the history and gets no Restore button. Somebody who cannot
  read the page gets an empty history, which is what a page with no history and
  a page that does not exist both give.
- Pages that existed before this shipped have one baseline revision each,
  attributed to nobody, because nobody wrote it: it is a record of where we
  came in.
- A version is stored as the difference from the version after it, not as a
  copy of the page, which is why three versions cost a fraction of what one
  used to. Nothing about that should be visible: if a restored page comes back
  even slightly wrong, that is the highest-priority bug on this page after a
  permission leak.

Renaming is recorded and shown, but restoring only puts back content and type.
A name is part of the address, and moving a page is the tree's job.

### Search

The search box is in the sidebar. It searches the space you are in.

The important case: a word that appears **only** in a page you cannot read must
return nothing at all. Not a result with the content hidden. Nothing.

Anonymous visitors searching a space get exactly its published pages.

### Comments

At the bottom of every page, below the article and below the backlinks — never
attached to a paragraph. Reading a page is enough to comment on it; you do not
need edit rights.

- Post from one browser, reload in another: the second must see it. The panel
  re-reads on arrival, so a stale page should not be possible.

- One level of replies. You cannot reply to a reply.
- You can delete your own; an administrator of the page can delete anybody's.
- Deleting a comment that has replies leaves "This comment was withdrawn" so the
  answers underneath still make sense. Deleting one with no replies removes it
  entirely.
- There is no editing a comment after posting.
- **Comments require an account, even on a published page.** Publish a page,
  open it logged out: you see the document and no conversation. This is
  deliberate.

### What a page can be: articles, skills, HTML and JSON

**New this round.** A page is one of four things. Two of them are Markdown and
have been here all along; two are new.

| Type | What it is | How it is shown |
| --- | --- | --- |
| Article | Ordinary Markdown | Rendered prose, with a contents rail on a wide screen |
| Skill | Markdown written to Claude's conventions | The same, minus the frontmatter |
| HTML | A static HTML document | The document itself, in a frame, with its own styling |
| JSON | A data file | A tree you can fold, with the raw text underneath |

Everything else about them is identical, and that is the thing most worth
checking: sharing, permissions, renaming, moving, deleting, history and restore,
search and comments must behave on an HTML or JSON page exactly as they do on
prose. **If any of them differs, that is a bug and a high-priority one.**

**Skills**

- **+ Skill** in the tree header, and **New skill** on a folder's page, create
  one with its frontmatter already filled in.
- A skill with no `name` or `description` still saves, and shows a warning. It
  is never rejected: losing your writing over a formatting detail would be the
  worse outcome.
- Frontmatter must not appear as body text on the rendered page.

**Uploading**

- **+ Upload** in the tree header puts a file at the top of a space; **Upload**
  on a folder's page puts one inside that folder.
- It takes `.md`, `.markdown`, `.html`, `.htm` and `.json`. Anything else is
  refused by name before a byte is sent — try a `.csv` or a `.png` and you
  should get a sentence saying what it takes, and no page created.
- The page is named after the file, without its extension: `Quarterly
  Report.html` becomes a page called **Quarterly Report**.
- A file over 1000kB is refused, with its size in the message.
- You land on the page you just uploaded.

**HTML pages. Changed again this round — read this before testing them.**

An HTML page's bytes are no longer in the database. They are a file in a
private bucket, and the page carries a token that is its public address.

- **The document runs.** Scripts work, because these are design mockups and one
  that cannot move is not a mockup. The earlier round blocked scripts; that is
  no longer true and the note under the frame says so.
- What makes that safe is *where* it runs. The frame and the response both
  carry a sandbox without `allow-same-origin`, so the document is in an origin
  of its own: it cannot read your session, the page around it, or anything else
  on post.maqsoodlabs.com. **Report immediately** anything suggesting otherwise.
- **It has a public address.** Under the frame, whoever can edit the page gets
  a **Link to share**. Anybody with that link can open it — no account, no
  sign-in, nothing. It is the only thing in Post-it readable without being
  given, and it is deliberate: a mockup exists to be sent to a client.
- Test it properly: copy the link, open it in a private window with no session,
  and it must render. Change one character of the token and it must be a plain
  404, not an error that tells you a page exists.
- Deleting the page deletes the file. After deleting, the old link must 404.
- Size: up to 50MB for HTML, against 1000kB for Markdown and JSON, because one
  is a file and the other is a column.
- Known consequence, do not file it: **an HTML page has no version history and
  is not searchable.** Its text is not in the database to diff or to index.

**JSON pages**

- Shown as a tree. The first two levels arrive open, deeper ones folded; click
  a row to fold or unfold it.
- Strings are quoted and coloured differently from numbers, booleans and
  `null`, so `"12"` and `12` are distinguishable.
- **Raw JSON** at the bottom holds the file as text, for copying.
- A file that is not valid JSON still opens: it says why, and shows the text
  exactly as stored. It also still **saves** from the editor, half-written, with
  a warning — same rule as a skill with no description.
- A very large file is shown as text rather than as a tree, on purpose.

**Changing type**

- The Type dropdown in the editor reclassifies a page between all four.
- Turning an **empty** page into HTML or JSON fills it with the smallest valid
  starting document. A page with anything in it is never overwritten.
- The sidebar badges everything except an article: `skill`, `html`, `json`.

### Document status: under review, and approved

**New this round.** A document can be sent for review and approved. The first
thing to check is what it does to everything else: **nothing**.

**Review is opt-in.** A page nobody has asked to have reviewed has no status at
all — not "draft". No strip on the page, no badge in the sidebar, nothing
suggesting it is waiting for somebody. If you find a status on a page nobody
sent for review, that is a bug. Most pages will never carry one.

The flow, and who each step belongs to:

| Step | Who can do it | What shows |
| --- | --- | --- |
| **Ask for review** | **Its author, and nobody else** | "Under review", with who asked and when. A `review` badge appears in the sidebar and in folder listings |
| **Approve** | Anybody **in the space** except the author and whoever asked | "Approved by *name*", with the date. The sidebar badge goes |
| **Withdraw** / **Clear** | Its author | Back to no status at all |

**Corrected since the first cut of this feature**, and both are worth
re-testing from scratch:

- Asking used to be open to anybody who could **edit** the page. In a space
  whose members all hold editor that meant anybody could put somebody else's
  half-finished page up for review. It is the author's alone now. The one
  exception is a page whose author's account is gone, which the space's owner
  has the last word on.
- Approving used to be open to anybody in the space **including the person who
  asked**, so one person could start and finish a review on their own. The
  author cannot approve their own page, and whoever asked cannot approve it.

The two powers are deliberately different, and this is the part worth
attacking:

- A reviewer who can only **read** must be able to approve. That is the
  ordinary case, not an edge one.
- Somebody who was shared the **page** but is **not in the space** must see
  where the review got to and be offered nothing. No Approve, no Clear. Trying
  it through the API must be refused.
- Somebody who cannot read the page at all must be told the page does not
  exist — the same answer a typo gets, not "you are not allowed".
- You cannot approve a page that is not under review, and you cannot approve
  twice.
- A folder cannot be reviewed.

**Edited after approval.** Change the page after it is approved and the strip
adds **changed since**. An approval is of a document, not of a title; if an
approved page can be edited and still look plainly approved, that is the most
serious bug this feature can have.

Nothing here is a permission. Approving grants nobody anything, and the review
state on a page you cannot read is not visible to you at all. An anonymous
visitor to a published page sees no review state, because it names a person.

### Connecting to Claude (MCP)

**Your account → Connect Post-it to Claude**, or `/settings/mcp`.

Create a token and name it. A token can reach everything you can read, or be
pinned to a single space; pin it where you can, so a leak costs one space
rather than the account.

The token is shown **once**, with the configuration for each client already
built around it: the `claude mcp add` command line, an `.mcp.json` block, a
connector URL, and a curl for the Anthropic API. Each carries this token and
this Post-it's address, so connecting is copy and paste rather than transcribing
a secret by hand. There is no way to see it again; if you lose it, revoke it
and make another. Reload the page and the token must be gone while the entry
in the list stays.

**The Claude apps take a URL and nothing else.** Their Add custom connector
dialog has no field for a header, so the connector URL carries the token in the
path. This is weaker than a header on purpose, and the page says so in red: a
token in a URL is in every HTTP log that records the path, in whatever Claude
stores for the connection, and anywhere the URL is pasted. It is a stopgap
until Post-it speaks OAuth. Both routes reach the same endpoint and the same
content; if one works and the other does not, that is a bug.

What a connected Claude can do: list spaces, walk a space's tree, search, read
pages, list and fetch skills, create folders, create pages, update pages. What
it cannot do: delete anything, move anything, or change who can see anything.

Worth trying, because this is where the last round of bugs was:

- Ask Claude to file a folder of documents into a space. It should build the
  structure rather than a flat list.
- Ask for a folder by passing `content_type: "folder"` to a page, or by putting
  a slash in a page's name. Both must be **refused, and say what to do
  instead**. Quietly making something other than what was asked for is the bug
  that was fixed here.
- Make a folder in the browser, then ask Claude to find it. It should, through
  the tree, even though a folder has no text to search.

**A tool list is fetched once, when the connector is added.** A session
connected before a tool shipped will not see it, and that is the client's cache
rather than a missing feature. Reconnect before reporting a tool as absent.

The property to test: **a token reaches exactly what its owner reaches, and
never more.** Make a token, then have somebody share something new with you and
confirm it appears; have them revoke it and confirm it disappears. Revoking the
token itself must stop it on the very next request.

---

**New tools this round.** Worth a pass with a real client:

- `attach_file` — hand it a filename and the file's text and it becomes a page,
  typed from the extension, exactly as **Upload** does in the browser. Same
  rules: Markdown, HTML and JSON only, 1000kB, named after the file without its
  extension.
- `append_to_page` — the rest of a file that would not fit in one call. Claude
  cannot pass half a megabyte of HTML in a single tool argument, so it sends
  the first part with `attach_file` and the rest with this, in order. Each call
  is an ordinary save, so a large file leaves several revisions and the history
  reads as it arriving. Worth testing that a token which cannot edit a page
  cannot grow one either, and that a page cannot be pushed past 1000kB.
- `ask_for_review`, `approve_page`, `clear_review` — the review flow. Every
  rule is the database's, so a token can only do what its owner could.
  `read_page` now reports `review:` when a page has a status, and says nothing
  when it does not.

The thing to check here is that a token grants nothing extra. A token belonging
to somebody outside a space must not be able to attach a file to it, ask for a
review in it, or approve anything in it — the answers should be the same
not-founds they get everywhere else.

### Skillsets, and installing them anywhere

**New this round**, and the one thing on this page most worth trying to break.

A **skillset** is a space whose contents are skills. Its owner marks it with the
**Skillset** button in the space header. Once marked, the skills in it can be
fetched as files, in the layout that agent tooling expects, by anybody who was
already given them.

**The claim to attack: the mark is not a permission.** It changes nothing about
who can read anything. A skillset is a space — same members, same teams, same
sharing, same 404 for somebody who was never given it. If you can find any way
in which marking or unmarking a space changes who can reach what, that is the
most serious bug this feature can have, and it goes straight to the top of the
list.

**Setting one up.**

1. Make a space, and in it make pages whose type is **skill**. A new skill
   arrives with `name:` and `description:` already in its frontmatter; fill the
   description in, because that is what an agent reads to decide whether the
   skill is relevant.
2. Open the space and press **Skillset** in the header. Tick the box. The
   install commands appear underneath.
3. Make a token on **Your account → Connect Post-it to Claude**, pinned to that
   space. The token is shown once.

**The addresses.** All three carry a token, and the token is the person: it
reaches exactly the skills its owner can reach, and no more.

| Address | What comes back |
| --- | --- |
| `/k/TOKEN` | JSON: which skillsets this token can reach |
| `/k/TOKEN/SLUG.tar.gz` | The whole skillset, gzipped tar, a folder per skill |
| `/k/TOKEN/SLUG/SKILL_NAME/SKILL.md` | One skill on its own, as text |

You do not need to install anything to test this. `curl` is enough:

```
BASE=https://web-staging-347f.up.railway.app
curl $BASE/k/YOUR_TOKEN
curl -sL $BASE/k/YOUR_TOKEN/your-space.tar.gz | tar tz
```

The real thing is `npx skills add $BASE/k/YOUR_TOKEN/your-space.tar.gz`, and it
is worth one pass with the actual tool. Nothing automated has ever run it: the
tests prove the archive is well formed and holds exactly what the fetcher was
given, which is not the same as an installer being happy with it.

**The test that matters, and it needs three accounts.** Put two skills in a
skillset. Share one of them with a second person, and share nothing with a
third. Then have each of the three fetch the same skillset with their own token:

| Who | What they must get |
| --- | --- |
| The owner | Both skills |
| Shared one skill | That skill, and only that skill |
| Shared nothing | **404**, the same answer as a skillset that does not exist |

The third row is the one to push on. It must be a 404 and not a 403, and it must
be the same 404 you get for a made-up address, because anything else confirms
that the skillset exists. Revoke the second person's share and their fetch must
go to 404 on the very next request.

**Folder names come from the frontmatter, not the page.** A page called
"Invoicing (v2, final)" whose frontmatter says `name: monthly-invoicing`
installs into `monthly-invoicing/`. That is deliberate: the standard requires a
skill's name and its folder to agree, and it is the frontmatter an agent reads.
Two skills whose frontmatter names collide get `-2` rather than one of them
quietly not arriving. A skill with no frontmatter at all still comes out valid,
named after its page.

**Also worth trying:**

- Unmark the skillset. The files must stop being served, and everybody who could
  read those pages must still be able to read them, in the browser, exactly as
  before.
- A token pinned to one space must reach that space and nothing else, at `/k` as
  well as over MCP.
- A revoked token must stop working on the next request.
- Ask an agent for `list_skillsets`, then `list_skills` on one of them. A token
  whose owner was given nothing must get an empty list rather than a refusal.
- Put a colon, a quote and a `#` in a skill's description. It must survive the
  round trip intact rather than producing a file that will not parse.

**What is deliberately not there.** The format allows a skill to bundle a
`scripts/` folder of executables. Post-it has none: there is no file type here
that is meant to be run, and skillsets carry instructions and references only.
Do not file that as a bug.

**And the cost, stated rather than hidden.** The token travels in the address,
because no installer in this ecosystem offers a field for a header — the same
trade the Claude apps' connector URL already makes. A secret in a path is in
every log that records paths and in whatever the tool writes to disk. The dialog
says so. Pin the token to the one skillset.

## Where to look when something goes wrong

**Status page:** `/status` on either environment. It shows which environment you
are on, the commit that is deployed, and whether each piece of configuration is
present. Include what it says in any bug report about something being broken
rather than merely wrong.

**Health check:** `/api/health`.

---

## Fixed since the last round

Worth a second look, because these are where the bugs were.

- **Renaming.** A page's title is now its name. Renaming shows through
  immediately on the page, not only in the sidebar.
- **Renaming a space.** There is a real one now, next to the space's name in
  the header. It changes the name in the header, on the front page and in the
  list of spaces, and leaves the address alone. The space's front page is no
  longer a file in the tree, and the database refuses to move or delete it —
  renaming it was what 404ed whole spaces.
- **Sharing a folder.** Folders are links now; click one to see what is inside.
  Share is offered beside every item in the sidebar as well as at the top of
  whatever you are reading.
- **Sharing with an address that has no account.** It invites them instead of
  refusing.
- **Who can see this.** The two separate controls, "everyone here" and "on the
  web", are one setting with four values, and choosing one withdraws the others.
- **Your account.** There is a page for it now, and the header of every
  signed-in page names the address you are signed in as and links to it.
- **History.** Every page keeps its versions, with a diff and a restore.
- **Connecting Claude.** A token now arrives with each client's configuration
  already around it, including a URL for the Claude apps, which take nothing
  else. Claude can create folders and walk a space's tree, and is refused
  rather than obliged when it asks for a folder the wrong way.
- **A refused sign-in keeps your address.** It used to empty both fields, so a
  mistyped password cost two. A sign-in refused because you have tried too
  often now says so, rather than telling you your password is wrong.
- **The MCP endpoint stopped throttling clients that were doing nothing
  wrong.** Its failure budget counted every request rather than every refusal,
  so a Claude filing a folder of documents ran into a 429 after twenty calls.
- **You can move pages and folders.** The tree offered Rename and Delete and no
  way to move anything, while the last handover claimed you could drag things
  about. Both a drag and a Move button now exist. See
  [Spaces and pages](#spaces-and-pages).
- **A refused move used to report success.** Asking to move something you may
  read but not edit answered 200 with the unmoved page. Nothing was ever moved
  that should not have been — the database refused it correctly — but the reply
  was untrue, and it is now the same 404 as every other refusal.
- **The app works on a phone.** It had no viewport meta tag, so a phone laid the
  page out at about 980px and scaled it down: every screen was a desktop layout
  shrunk to illegibility, and none of the responsive rules ever applied. With
  that fixed, the header wraps instead of running off the side, wide tables and
  code blocks scroll inside themselves rather than dragging the page sideways,
  and the tree's Share, Rename, Move and Delete buttons are visible without a
  hover — a touchscreen has none, so they were unreachable. Worth a real device:
  the automated check only proves no screen scrolls sideways at 360px, which is
  the difference between usable and not, but says nothing about how it looks.
- **A member of a team can see the team.** Who else is on it, and what being on
  it lets them read. Previously the owner could see all of that and the people
  on the team could see none of it. See [Teams](#teams).
- **Clicking a link now shows that you clicked it.** Every page that reads
  content waits on the database, so a slow navigation used to leave the page
  looking exactly as it did before the click, and people clicked again, which
  started the navigation over and made the wait longer. The link you clicked now
  carries a spinner until the next page arrives — the one you clicked, and not
  the others in the list.
- **The front page is the product, not a placeholder.** "Coming soon" is gone,
  and the footer carries the credit and a **Tell me a joke** box that asks for
  nothing: no account, no address, no name. Notes land on a page only the owner
  of the documentation space can read.
- **Code is legible in dark mode.** Highlighting was a light theme, baked into
  the page, on a panel that is nearly black in dark mode: pale blues and a grey
  comment that read at 3.5:1. Both themes are emitted now and the stylesheet
  picks, which it has to, because a page is rendered once on the server and read
  by people in either mode. The pair was chosen by measuring against the panel
  this app actually puts behind a code block rather than the background each
  theme assumes; nothing in either mode now falls below 4.5:1. **This is a
  visual change and nothing automated can tell you whether it looks right.**
  Worth a pass through a page with code, a Mermaid diagram and a JSON file, in
  both modes, on a real screen.
- **The amber stopped being the least legible thing on the page.** It carries
  the "under review" label and the two-letter chip beside a file's name that
  says whether it is Markdown, HTML or JSON. At 3.5:1 on white it was small text
  nobody could read at a glance. Darkened; dark mode's was already fine and is
  untouched.
- **An account could not be emptied, and so could not be deleted.** Every
  account now comes with a space of its own and nobody may have two, so handing
  one person's spaces to another failed on the second one — their personal space
  arriving at somebody who already had one. A space that has been handed over is
  nobody's own any more, and counts as an ordinary one. Worth re-running the
  whole hand-over-then-delete path on **People**.
- **The product is Post-it**, and the rename reached everything a person
  reads. Identifiers deliberately did not move: the documentation space is
  still at `/s/postit`, the MCP server is still named `postit` in the
  configuration you paste into a client, and tokens begin `post_`. Any token
  issued before the rename still works.

---

## Known gaps, so you do not spend time on them

These are known and either scheduled or deliberate. Report them only if the
behaviour differs from what is written here.

| Gap | Status |
| --- | --- |
| No standalone invite screen; you are invited by being shared something | Deliberate for now. Sharing with an unknown address invites it |
| The Claude apps need the token in the URL | Stopgap. OAuth on the MCP endpoint is the replacement and is not built |
| A restore puts back content and type, never the name or the position | Deliberate. A name is part of the address; moving is the tree's job |
| A viewer cannot move anything | Correct. Moving needs edit, and the refusal is a 404 like every other |
| Production is behind staging | Deliberate. Staging is where this round is tested. Production has everything up to and including the dark-mode colours; skillsets are on staging only |
| A member cannot leave a team themselves | Known. Only the space owner can remove somebody. Report it as a gap, not a bug |
| `/teams` shows team-mates' email addresses | Deliberate. You are on a named team together and knowing who else can read what you write is the point |
| Google Drive image links do not render | #10, not built |
| No email when you share with somebody who already has an account | Known. They are told in **Shared with you**; email needs a mail sender this product does not have |
| An administrator cannot read anybody's content, only count it | Deliberate. It is the one exception this product does not make |
| A skillset carries no `scripts/` folder | Deliberate. The format allows bundled executables; Post-it has no file type meant to be run. Skills here are instructions and references |
| A skillset address carries the token in the URL | Same stopgap as the connector URL, for the same reason: no installer offers a field for a header. Pin the token to the one skillset |
| An HTML or JSON page in a skillset is not served as a skill | Correct. Only pages whose type is **skill** are, and only those carry the frontmatter a skill needs |
| Nobody is told their page was approved | Known. There is no notification for it; you see it on the page. Same reason the rest of the product sends no mail |
| Two people with the same name before the @ share an address stem | Correct. The second gets `-2`. Report it only if a signup fails outright |
| Staging is hosted in San Francisco, its database in Singapore | Known; staging is slower than production for this reason alone |
| Dragging to move does nothing on a phone or tablet | Correct. Browser drag-and-drop is mouse-only; use the Move button |
| Binary attachments: images, PDFs, zips | Not built. Uploading takes text files only — Markdown, HTML and JSON. Images are referenced from elsewhere; diagrams are Mermaid |
| An HTML page has no history and does not appear in search | Correct. Its bytes are a file rather than a column, so there is nothing to diff or to index |
| Anybody with an artifact link can open it forever | Deliberate. The link is the permission. Deleting the page takes the file with it |
| An HTML frame does not shrink to fit a short document | Known. Its height cannot be measured from outside a sandbox without letting scripts run. Drag the corner |

---

## What is already tested automatically

So you know where the thin ice is, and where it is not.

- **333 database-level assertions** covering every access rule:
  inheritance, teams, who may read a team's roster and what a team reaches,
  publishing, sharing with everyone, the exclusivity of the
  visibility setting, invitations and what accepting one delivers, revocation,
  search filtering, comment visibility, the protection on a space's front page,
  who may read and restore a page's history and the refusal to let anybody
  write it by hand, and the specific three-valued-logic trap that once let any signed-in user
  grant themselves administrator on any page. Among them, for skillsets: the
  same read questions are asked either side of marking a space, and must give
  the same answers. If they ever differ, the mark has become a permission.
- **269 browser tests** across thirty suites, driving real sign-ups with
  real confirmation emails and real invitation emails, and using two or three
  separate browsers wherever the question is what a *different* person can see.
- **118 unit tests** on the renderer, the diff, the MCP throttle, what an
  uploaded filename means, what survives the rewrite of an HTML document before
  it is shown — scripts, frames, event handlers and meta refreshes do not — and
  how a skillset is laid out: where each folder's name comes from, what happens
  when two collide, and that the archive is one real `tar` can open.

All of it runs on every push and must be green before anything merges.

What this does **not** cover, and where your attention is worth most:

- Anything visual. Layout, spacing, dark mode, small screens, long names,
  right-to-left text, very long pages. This includes the new spinner on a
  clicked link: nothing automated checks how it looks, only that widening what a
  member can see did not widen what they can do. **This round that matters more
  than usual**: the syntax colours were chosen by measuring contrast, which says
  nothing about whether the result is pleasant to read.
- Any agent tool actually installing a skillset. The tests prove the archive is
  well formed and that it contains exactly what the fetcher was given; nobody
  automated has run `npx skills add` against it.
- Real email in the wild: deliverability, spam folders, what the messages
  actually look like.
- Anything about how it *feels*: whether the affordances are where you expect,
  whether the errors say something useful, whether the flow makes sense to
  somebody who has not read this document.
- Anything with several people acting at once in ways the tests do not imagine.

---

## Filing a bug

Please include:

1. Which environment, and what `/status` says the commit is.
2. Which account you were signed in as, and what that account had been granted.
3. What you expected and what happened.
4. For anything permission-related: **who else could see it, and who could not.**
   That is the part that tells us whether it is a bug or the design.

Anything where somebody sees content they were not granted is the highest
priority, ahead of everything else on this page.
