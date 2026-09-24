-- Publishes the Design for Post-it skill into the Post-it space's Skills
-- folder, where Claude Design finds it with list_skills and get_skill.
--
-- The same text as the documentation page, from content/skills.ts. Idempotent:
-- a space without the folder, or a folder that already has the page, is left
-- alone.

do $$
declare
  v_space uuid;
  v_folder uuid;
  v_node uuid;
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

  if exists (select 1 from public.nodes where parent_id = v_folder and slug = 'design-for-post-it') then
    raise notice 'the skill is already there; skipping';
    return;
  end if;

  v_node := gen_random_uuid();
  insert into public.nodes (id, space_id, parent_id, kind, name, slug, content, content_type)
  values (v_node, v_space, v_folder, 'file', 'Design for Post-it', 'design-for-post-it', '---
name: Design for Post-it
description: Specify and publish HTML mockups to a Post-it flow for review and handover, and resolve reviewers'' comments. Use when designing screens that will be reviewed in Post-it or handed to Claude Code.
---

# Design for Post-it

Post-it replaces Figma for review and handover. Reviewers open your HTML
mockups, inspect elements like browser devtools, and comment on an exact
element, word or area. When a flow is approved, Claude Code receives a handover
built from your HTML. **The HTML is the spec**: everything about what an element
is, what it says and what it does lives on the element as `data-pi-*`
attributes. Nothing is kept anywhere else, so an exported mockup carries it all.

## Rules that matter most

1. **Every meaningful element gets a `data-pi-id`.** Form `n_` followed by at
   least four lowercase letters or digits, for example `n_7f3a2c`. Sections,
   headings, text that may change, every button, link and input, every list and
   its item template, every icon or image with meaning.
2. **Never change or reuse an id.** When you edit or regenerate a screen, keep
   every id that still refers to the same thing. Comments are anchored to ids; a
   dropped id orphans the feedback on it. New elements get new ids.
3. **Always `read_page` the latest version before editing.** Reviewers can add
   attributes in Post-it, and they are saved as new versions of your file. Edit
   the current text, pass its version to `update_page`, and never write from an
   older copy.
4. **One self-contained HTML file per screen.** Inline or same-document CSS: the
   token inspector cannot read stylesheets loaded from another origin. Use CSS
   custom properties named after tokens (`var(--color-brand-500)` for
   `color.brand.500`).
5. **Ids that Post-it created** carry `data-pi-origin="postit"` (from a
   reviewer binding a word). Keep the id and remove the origin attribute.

## Screen meta, in the head

```html
<meta name="pi:spec" content="1">
<meta name="pi:screen" content="checkout-address">   <!-- screen slug -->
<meta name="pi:flow" content="checkout">
<meta name="pi:route" content="/checkout/address/:orderId">
<meta name="pi:title" content="Add delivery address">
<meta name="pi:tokens" content="tokens">             <!-- the flow''s token page -->
<script type="application/pi+json" id="pi-resources">
  { "user/firstName": { "type": "string", "source": "auth profile", "description": "Given name" } }
</script>
```

## Attributes

| Attribute | Meaning |
| --- | --- |
| `data-pi-id` | Stable id. Designer-owned. |
| `data-pi-slug` | Readable name, unique on the screen: `add-address-button`. Addresses are `screen-slug/node-slug`. |
| `data-pi-component`, `data-pi-variant` | The design-system component and variant: `Button`, `primary`. |
| `data-pi-role` | Role the tag does not say: `input`, `form`, `dialog`. |
| `data-pi-content` | `static` or `dynamic`. |
| `data-pi-bind` | Resource path the content comes from: `user/firstName`. For one dynamic word in a sentence, wrap it: `Hello <span data-pi-id="n_ab12cd" data-pi-content="dynamic" data-pi-bind="user/firstName">Asim</span>`. |
| `data-pi-sample`, `data-pi-empty`, `data-pi-format`, `data-pi-max` | Example value, what shows when empty, formatting (`currency:GBP`, `date:relative`), maximum length. |
| `data-pi-repeat` + `data-pi-item` | A list over a resource (`orders[]`), and the one child that is the item template. Item bindings start with the list: `orders[]/total`. |
| `data-pi-action` | Action name: `action/checkout/add-address`. |
| `data-pi-trigger` | `click` (default), `submit`, `change`, `load`. |
| `data-pi-effect` | Side effects, space separated, any names: `api/address/create analytics/address-added`. |
| `data-pi-to` | Destination on success: `screen:checkout-review`, `node:checkout-address/postcode-help`, `modal:checkout-address/confirm`, `back`, `url:https://...`. |
| `data-pi-to-failure` | Destination, or node revealed, on failure. |
| `data-pi-field`, `data-pi-validate` | What an input writes (`address/postcode`) and its rules (`required; pattern:uk-postcode; max:8`). |
| `data-pi-states` | States a component has: `default hover focus disabled loading error`. |
| `data-pi-state-of` + `data-pi-state` | An element depicting another node (by id) in a state. Hidden in review until previewed. Draw one for every state that looks different. |
| `data-pi-visible-if` | When a node is shown: `user/isLoggedIn`. |

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
   for the `pi-resources` block.

## Publish

1. Find or create the flow: `list_tree`, then `create_folder` with `flow: true`
   (or `set_flow` on an existing folder).
2. Put the token file in the flow as a JSON page in W3C DTCG format, named as
   `pi:tokens` says.
3. Publish each screen with `attach_file` (`<screen-slug>.html`) or
   `create_page` with `content_type: "html"` and the flow as `parent_id`. For a
   new version, `read_page` then `update_page` with its version.
4. Read the **validation report** in the answer. Fix every `error` and every
   `warn` you can (duplicate ids, attributes without ids, bad destinations,
   vanished ids) and publish again.
5. Ask for review with `ask_for_review` on each screen and the token page.

## A round of review

1. `list_comments` with the flow''s `flow_id` and `status: "open"`. Each
   comment says where it points: a `data-pi-id` and slug, quoted words inside a
   node, an area of the page, or an element without an id (give it one).
2. `read_page` each affected screen, make the changes, keeping ids, and
   `update_page`. Note the version each save returns.
3. For each comment you dealt with, `mark_addressed` with its `comment_id`, the
   version that fixes it and one sentence on what changed. You cannot resolve
   comments: a reviewer confirms. If you disagree with a comment, say so to the
   designer rather than marking it addressed.
4. Tell the designer what changed and what you did not change, and why.

## Example

```html
<form data-pi-id="n_form01" data-pi-slug="address-form" data-pi-role="form">
  <h1 data-pi-id="n_head01" data-pi-slug="greeting">Hello
    <span data-pi-id="n_name01" data-pi-content="dynamic" data-pi-bind="user/firstName" data-pi-empty="there">Asim</span>,
    where should we deliver?</h1>
  <input data-pi-id="n_post01" data-pi-slug="postcode" data-pi-field="address/postcode"
         data-pi-validate="required; pattern:uk-postcode" data-pi-states="default error" placeholder="Postcode">
  <p data-pi-id="n_err001" data-pi-slug="postcode-error" data-pi-state-of="n_post01" data-pi-state="error">Enter a valid postcode</p>
  <button data-pi-id="n_save01" data-pi-slug="save" data-pi-component="Button" data-pi-variant="primary"
          data-pi-action="action/checkout/add-address" data-pi-trigger="submit" data-pi-effect="api/address/create"
          data-pi-to="screen:checkout-review" data-pi-to-failure="node:checkout-address/postcode-error"
          data-pi-states="default loading disabled">Save address</button>
</form>
```
', 'skill');
  insert into public.grants (node_id, grantee_type, grantee_id, role)
  values (v_node, 'authenticated', null, 'viewer');
end $$;
