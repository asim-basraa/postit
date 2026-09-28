-- Publishes Wave's skills into the Post-it space's Skills folder, where
-- Claude Design and Claude Code find them with list_skills and get_skill.
--
-- The same text as the documentation page, from content/skills.ts (whose
-- vocabulary comes from packages/wave-skills). The Design for Post-it page, if
-- there is one, becomes Wave Design in place, so links to it keep working.
-- Safe to run again: an existing page is brought up to date.

create or replace function pg_temp.put_skill(p_folder uuid, p_space uuid, p_slugs text[], p_title text, p_slug text, p_body text)
returns void
language plpgsql
as $fn$
declare
  v_node uuid;
begin
  select id into v_node from public.nodes
   where parent_id = p_folder and slug = any (p_slugs)
   order by slug = p_slug desc
   limit 1;
  if v_node is null then
    v_node := gen_random_uuid();
    insert into public.nodes (id, space_id, parent_id, kind, name, slug, content, content_type)
    values (v_node, p_space, p_folder, 'file', p_title, p_slug, p_body, 'skill');
    insert into public.grants (node_id, grantee_type, grantee_id, role)
    values (v_node, 'authenticated', null, 'viewer');
  else
    update public.nodes
       set name = p_title, slug = p_slug, content = p_body,
           content_version = content_version + 1, updated_at = now()
     where id = v_node and (name, slug, content) is distinct from (p_title, p_slug, p_body);
  end if;
end;
$fn$;

do $$
declare
  v_space uuid;
  v_folder uuid;
begin
  select id into v_space from public.spaces where slug = 'postit';
  if v_space is null then
    raise notice 'no Post-it space here; skipping';
    return;
  end if;

  select id into v_folder from public.nodes
   where space_id = v_space and kind = 'folder' and slug = 'skills' and parent_id is null;
  if v_folder is null then
    raise notice 'no Skills folder in the Post-it space; skipping';
    return;
  end if;

  perform pg_temp.put_skill(v_folder, v_space, array['wave-design', 'design-for-post-it'], 'Wave Design', 'wave-design', '---
name: Wave Design
description: Specify HTML mockups with data-wave-* attributes, publish them to a Post-it flow for review and handover, and resolve reviewers'' comments. Use when designing screens that will be reviewed with Wave in Post-it or handed to Claude Code.
---

# Wave Design

Wave is how Post-it reviews HTML mockups in place of Figma. Reviewers open your
mockups, inspect elements like browser devtools, and comment on an exact
element, word or area. When a flow is approved, Claude Code receives a handover
built from your HTML. **The HTML is the spec**: everything about what an element
is, what it says and what it does lives on the element as `data-wave-*`
attributes. Nothing is kept anywhere else, so an exported mockup carries it all.

Older files use `data-pi-*`, `pi:` meta and `pi-resources`. They mean exactly
the same and are still read. Write `data-wave-*` in anything new, never mix the
two in one file, and when you rewrite an older file, upgrade it whole (the
review screen also has an "Upgrade to data-wave-*" button that does it
losslessly).

## Rules that matter most

1. **Every meaningful element gets a `data-wave-id`.** Form `n_` followed by at
   least four lowercase letters or digits, for example `n_7f3a2c`. Sections,
   headings, text that may change, every button, link and input, every list and
   its item template, every icon or image with meaning.
2. **Never change or reuse an id.** When you edit or regenerate a screen, keep
   every id that still refers to the same thing. Comments are anchored to ids; a
   dropped id orphans the feedback on it. New elements get new ids.
3. **Always read the latest version before editing.** Reviewers can add
   attributes in review, and they are saved as new versions of your file. Edit
   the current text, and never write from an older copy.
4. **One self-contained HTML file per screen.** Inline or same-document CSS: the
   token inspector cannot read stylesheets loaded from another origin. Use CSS
   custom properties named after tokens (`var(--color-brand-500)` for
   `color.brand.500`).
5. **Ids that review created** carry `data-wave-origin="wave"` (from a reviewer
   binding a word). Keep the id and remove the origin attribute.

## Screen meta, in the head

```html
<meta name="wave:spec" content="1">
<meta name="wave:screen" content="checkout-address">   <!-- screen slug -->
<meta name="wave:flow" content="checkout">
<meta name="wave:route" content="/checkout/address/:orderId">
<meta name="wave:title" content="Add delivery address">
<meta name="wave:tokens" content="tokens">             <!-- the flow''s token file -->
<script type="application/wave+json" id="wave-resources">
  { "user/firstName": { "type": "string", "source": "auth profile", "description": "Given name" } }
</script>
```

## Attributes

| Attribute | Meaning |
| --- | --- |
| `data-wave-id` | Stable id. Designer-owned. |
| `data-wave-slug` | Readable name, unique on the screen: `add-address-button`. Addresses are `screen-slug/node-slug`. |
| `data-wave-component`, `data-wave-variant` | The design-system component and variant: `Button`, `primary`. |
| `data-wave-role` | Role the tag does not say: `input`, `form`, `dialog`. |
| `data-wave-content` | `static` or `dynamic`. |
| `data-wave-bind` | Resource path the content comes from: `user/firstName`. For one dynamic word in a sentence, wrap it: `Hello <span data-wave-id="n_ab12cd" data-wave-content="dynamic" data-wave-bind="user/firstName">Asim</span>`. |
| `data-wave-sample`, `data-wave-empty`, `data-wave-format`, `data-wave-max` | Example value, what shows when empty, formatting (`currency:GBP`, `date:relative`), maximum length. |
| `data-wave-repeat` + `data-wave-item` | A list over a resource (`orders[]`), and the one child that is the item template. Item bindings start with the list: `orders[]/total`. |
| `data-wave-action` | Action name: `action/checkout/add-address`. |
| `data-wave-trigger` | `click` (default), `submit`, `change`, `load`. |
| `data-wave-effect` | Side effects, space separated, any names: `api/address/create analytics/address-added`. |
| `data-wave-to` | Destination on success: `screen:checkout-review`, `node:checkout-address/postcode-help`, `modal:checkout-address/confirm`, `back`, `url:https://...`. |
| `data-wave-to-failure` | Destination, or node revealed, on failure. |
| `data-wave-field`, `data-wave-validate` | What an input writes (`address/postcode`) and its rules (`required; pattern:uk-postcode; max:8`). |
| `data-wave-states` | States a component has: `default hover focus disabled loading error`. |
| `data-wave-state-of` + `data-wave-state` | An element depicting another node (by id) in a state. Hidden in review until previewed. Draw one for every state that looks different. |
| `data-wave-visible-if` | When a node is shown: `user/isLoggedIn`. |

Names (resources, actions, effects, fields) are free text; use a path grammar,
and reuse the same name for the same thing across screens.

## Interview the designer

Before publishing a screen, ask, and write the answers as attributes. Group the
questions; do not ask one at a time.

1. **Copy.** Which text is fixed, and which comes from data? For each dynamic
   piece: which resource, an example, what shows when it is empty, and any
   formatting. Which words inside a sentence are dynamic?
2. **Lists.** What repeats, over what, and which element is one item?
3. **Controls.** For every button and link: what is the action called, what does
   it trigger (API calls, analytics, emails), where does it lead on success, and
   what happens on failure?
4. **Inputs.** What field does each write, and how is it validated?
5. **States.** Which states does each interactive component have (loading,
   disabled, error, empty, success)? Draw the ones that look different.
6. **Conditions.** What is shown only to some people or in some situations?
7. **Data.** For each resource: its type, where it comes from, and what it means,
   for the `wave-resources` block.

## Publish, in Post-it

1. Find or create the flow: `list_tree`, then `create_folder` with `flow: true`
   (or `set_flow` on an existing folder).
2. Put the token file in the flow as a JSON page in W3C DTCG format, named as
   `wave:tokens` says.
3. Publish each screen with `attach_file` (`<screen-slug>.html`) or
   `create_page` with `content_type: "html"` and the flow as `parent_id`. For a
   new version, `read_page` then `update_page` with its version.
4. Ask for review with `ask_for_review` on each screen and the token page.

After every save, read the **validation report** (or call `check_screen`). Fix
every `error` and every `warn` you can (duplicate ids, attributes without ids,
bad destinations, vanished ids) and publish again.

## A round of review, in Post-it

1. `list_comments` with the flow''s `flow_id` and `status: "open"`.
2. `read_page` each affected screen, make the changes, keeping ids, and
   `update_page` with the version you read. Note the version each save returns.
3. For each comment you dealt with, `mark_addressed` with its `comment_id`, the
   version that fixes it and one sentence on what changed.

Each comment says where it points: a `data-wave-id` and slug, quoted words
inside a node, an area of the page, or an element without an id (give it one).
You cannot resolve comments: a reviewer confirms. If you disagree with a
comment, say so to the designer rather than marking it addressed. Finish by
telling the designer what changed, what you did not change, and why.

## Example

```html
<form data-wave-id="n_form01" data-wave-slug="address-form" data-wave-role="form">
  <h1 data-wave-id="n_head01" data-wave-slug="greeting">Hello
    <span data-wave-id="n_name01" data-wave-content="dynamic" data-wave-bind="user/firstName" data-wave-empty="there">Asim</span>,
    where should we deliver?</h1>
  <input data-wave-id="n_post01" data-wave-slug="postcode" data-wave-field="address/postcode"
         data-wave-validate="required; pattern:uk-postcode" data-wave-states="default error" placeholder="Postcode">
  <p data-wave-id="n_err001" data-wave-slug="postcode-error" data-wave-state-of="n_post01" data-wave-state="error">Enter a valid postcode</p>
  <button data-wave-id="n_save01" data-wave-slug="save" data-wave-component="Button" data-wave-variant="primary"
          data-wave-action="action/checkout/add-address" data-wave-trigger="submit" data-wave-effect="api/address/create"
          data-wave-to="screen:checkout-review" data-wave-to-failure="node:checkout-address/postcode-error"
          data-wave-states="default loading disabled">Save address</button>
</form>
```
');
  perform pg_temp.put_skill(v_folder, v_space, array['wave-build'], 'Wave Build', 'wave-build', '---
name: Wave Build
description: Build an approved flow of Wave mockups from its handover in Post-it. Use when asked to implement screens that were designed and approved with Wave.
---

# Wave Build

An approved Wave flow is a complete, frozen spec: HTML screens whose
`data-wave-*` attributes (or `data-pi-*`, in older files) say what every element
is, says and does, a DTCG token file, and the decisions made in review.

1. Call `get_handover` with the flow''s id. If it refuses, it lists what is
   blocking approval: stop and report that, do not build from unapproved
   screens.
2. Read HANDOVER.md from the answer end to end: routes, the flow graph, the data
   dictionary, the action catalog with side effects and destinations, component
   states, and the review decisions and accepted gaps.
3. Fetch each screen with `get_handover_screen` as you build it. The HTML is the
   source of truth for markup and copy; the attributes are the behaviour.
4. Map components (`data-wave-component`, `data-wave-variant`) to the codebase''s
   design system before writing new ones. Map tokens by name, never by value.
5. Bind every `data-wave-bind` to the resource named, render `data-wave-empty`
   when it is empty and apply `data-wave-format`. Build every state listed in
   `data-wave-states`, using the depicted states (`data-wave-state-of`) as the
   design for each.
6. Wire each `data-wave-action` with its `data-wave-effect`s, and navigate to
   `data-wave-to` on success and `data-wave-to-failure` on failure.
7. Where the handover lists an accepted gap, follow its note; where something is
   neither specified nor waived, ask rather than guess.
');
end $$;
