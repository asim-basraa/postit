-- Publishes Wave Figma (a design drawn in Figma, brought into Wave through the
-- entry gate) into the Post-it space's Skills folder, and brings Wave Design (the
-- router, which now points at it) up to date. The text is content/skills.ts.
-- Safe to run again.

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
       -- path is set by a trigger on insert only, so a new slug brings its path along here.
       set name = p_title, slug = p_slug, content = p_body,
           path = regexp_replace(path, '[^/]+$', p_slug),
           content_version = content_version + 1, updated_at = now()
     where id = v_node and (name, slug, content, path) is distinct from (p_title, p_slug, p_body, regexp_replace(path, '[^/]+$', p_slug));
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
description: Start here for any Wave work in Post-it (design systems, features, HTML mockups, dry runs, uploads, prototypes and review). Says which Wave skill to use next (Wave Brief, Wave Design System, Wave Feature, Wave Review). Use before creating, changing or uploading any HTML mockup or component.
---

# Wave Design

Wave is how Post-it reviews HTML mockups and hands them to Claude Code. **The HTML
is the spec**: what every element is, says and does lives on it as
`data-wave-*` attributes, checked against the project''s design system.

The work goes in four stages, each with its own skill. Load the one you need
with `get_skill` (space postit, path `skills/<name>`) and follow it exactly.

| Stage | Skill | Makes | When |
| --- | --- | --- | --- |
| 1 | `wave-brief` | DESIGN.md at the project root | Once per project, first |
| 2 | `wave-design-system` | Tokens and component specimens | Once per project, after the brief; again for a new component |
| 3 | `wave-feature` | FEATURE.md, then the screens with their attributes | Each feature |
| 4 | `wave-review` | The few questions left, preflight, upload, prototype, review | Each feature, after stage 3 |
| Figma | `wave-figma` | Specimens and screens from a Figma file, through the entry gate | Instead of stages 2 and 3 when the design is in Figma |

## Always start here

1. Ask the designer **which project** and **which feature** this is for.
   - Find it with `list_spaces` and `list_tree` (projects and features are marked).
   - No project yet: `create_folder` with `project: true` (it creates design-system/ and
     design-system/components). No feature yet: `create_folder` inside the project with
     `flow: true`.
2. `wave_get_brief` (kind design, the project). No DESIGN.md yet, or it
   lists problems: **Wave Brief** first.
3. `get_catalogue` for the project. No approved catalogue (no components,
   or no valid token file): **Wave Design System** next.
4. For a feature: `wave_get_brief` (kind feature). No FEATURE.md yet: **Wave
   Feature** (it writes the brief with the designer, then the screens).
5. The design system or the screens are drawn in Figma: **Wave Figma** (the
   entry gate, then specimens and screens converted exactly as drawn), then
   **Wave Review**.
6. Screens designed, or the designer brings a mockup made elsewhere: **Wave
   Review**. "Wave dry run" also means Wave Review (it saves the question
   sheet and uploads nothing).
7. "Make it a prototype" or "share the prototype": Wave Review, prototype
   section.

Nothing is uploaded before the designer has approved DESIGN.md and the
catalogue. To build an approved flow in code, use **Wave Build**.

## What is never asked

Every element inherits, in this order, and anything inherited is not a
question:

1. **Its own HTML** (`data-wave-*`, native attributes).
2. **FEATURE.md**: the fields it writes (`data-wave-field`: rules, options,
   default, shown-when), the data it shows (`data-wave-bind`: type, source,
   empty, format), the action it takes (trigger, effects, destinations,
   confirm, tracking) and the screen''s route, title and access.
3. **Its component** in the catalogue: states, variants, responsive
   behaviour, events; parts inside a component instance belong to it.
4. **DESIGN.md**: copy status and where copy lives, who can see things,
   analytics, flags, form behaviour, empty values, overflow, icons,
   viewports, language.
5. **What Wave knows for certain**: names (slugs), element types, a submit
   button''s trigger, the action name, "none" for a control that only
   navigates.

When answers are applied, what came from FEATURE.md and what Wave is certain
of is written into the HTML; DESIGN.md and the catalogue stay the policy.
');
  perform pg_temp.put_skill(v_folder, v_space, array['wave-figma'], 'Wave Figma', 'wave-figma', '---
name: Wave Figma
description: Bring a design system and screens drawn in Figma into Wave in Post-it, exactly as drawn. Runs the Figma entry gate, fixes what blocks in Figma (never in Wave), converts specimens and screens with wave-figma, checks fidelity and preflight, and hands over to Wave Review. Use whenever the design lives in a Figma file.
---

# Wave Figma

The Figma file is the design. Wave takes it as it is drawn, or not at all:
nothing in Wave changes to fit a file, and nothing is drawn again by hand.
Every step below either reads Figma, or writes what Figma says.

You need the Figma file (its key and the node ids of the design-system page
and of each screen), the `wave-figma` command line, and the project and
feature in Post-it (Wave Design, "Always start here").

**If you cannot reach a resource (Figma, Post-it, a font, an image), stop and
tell the designer.** Never take another route to the same result: a value
guessed from a screenshot, a layer redrawn in HTML, or a font swapped for a
similar one is a design nobody approved.

## 1. The entry gate

1. `wave-figma script GATE --page <design-system page> --ids <design-system page>,<screens page>`
   prints a read-only plugin script. Run it with Figma''s `use_figma` and save
   the result''s `data` as `gate.json`; `wave-figma checksum gate.json` must
   print the checksum the script returned (results that do not fit in one
   reply come in parts: `--part n`).
2. `wave-figma gate --report gate.json -o GATE.md --fonts` lists what blocks
   and what is advice, each with a link to the layer.
3. **Blocking items are fixed in Figma**, then the gate runs again. The usual
   ones, and their Figma fix:
   - a colour, size, gap, radius, stroke or effect not bound to a variable
     (`*.unbound`, `size.fixed`): bind it, or set the layer to Hug or Fill;
   - a text layer without a text style: apply one;
   - layers placed by hand (`layout.none`, `layout.group`): auto layout;
   - an instance resized, restyled or detached (`instance.*`): an instance
     keeps its component''s size and look; make a variant instead;
   - a boolean property used to show and hide a part (`instance.boolean`):
     make it a variant property (Yes/No), so the look is a variant Wave can
     compare against the catalogue;
   - an inner shadow under an inside stroke (`effect.under-stroke`): Figma
     hides it, a browser shows it; remove one of the two.
   A design change that a fix causes (an instance that was stretched now hugs)
   is the designer''s to accept: show it and say so in the report.
4. Advice does not block. Read it out to the designer; a hidden layer that no
   variant shows is dropped, an unlinked button has nowhere to go.

`ENTRY-GATE.md` in the Wave docs lists every rule.

## 2. Tokens

`script VARIABLES` and `script STYLES` (run, save, checksum), then
`wave-figma tokens --variables vars.txt --styles styles.json -o tokens.json`.
The token file is the variables and styles as Figma has them, in DTCG. Show
it to the designer before saving it to the project.

## 3. Specimens: one per component set

For each component set on the design-system page:

1. `script COMPONENT --node <set>` (its variants and properties),
   `script BINDINGS --ids <set>` (the variables its layers are bound to),
   `script EFFECTS --node <set>` for its shadows, `script EXPORT_SVG --ids <vector ids>` for its vectors,
   and Figma''s `get_design_context` for its reference code and
   `get_screenshot` for the reference image. Save each result as returned.
2. `wave-figma convert --gate gate.json --component component.json --type <element type>
   --code code.tsx --width <w> --height <h> --tokens tokens.json --bindings bindings.txt
   --effects effects.json --svgs svgs.json --fonts fonts.css -o specimen.html`.
3. `align` then `fidelity` against the screenshot: it must pass.
4. A plan (`upgrade --plan`) makes real elements where Figma drew pictures of
   them (an input, a button, a label with its checkbox); the look lock proves
   no pixel moved. `outline` lists what a plan can name.
5. `ids --from <published specimen>` keeps every id the last version had.
6. `preflight` must pass with nothing open. Show the designer each specimen
   next to its Figma screenshot; they approve the catalogue, not you.

## 4. Screens

For each screen frame: `script NODE_MAP --node <frame>` (instances, their
properties, prototype links, and the vectors to export), `script BINDINGS --ids <frame>`,
`EFFECTS --node <frame>`, `EXPORT_SVG --ids <its vectors>`, `get_design_context` and
`get_screenshot`. Then:

1. `convert --gate gate.json --components <dir of component.json> --specimen-pages <published specimens>
   --map map.json --screens screens.json ... -o screen.html`. Each instance carries exactly
   its specimen''s root; how it sits in its parent goes on a wrapper
   (`data-figma-slot`). Prototype links become `data-wave-to`.
2. `align`, `fidelity` (must pass), `upgrade --plan` (look lock clean),
   `ids`, `preflight`.
3. What the plan says, it says with the design''s own words: tag a
   heading `h1`, a form `form`, a group of chips a `radiogroup` with its
   field; mark a decorative icon `aria-hidden` (`"<layer id> svg"` names
   the drawn SVG inside a layer); `data-wave-role` where Wave would guess
   wrong (a stepper is a section, a completed step that links back is a link).
   Plan ops: `meta`, `attrs`, `tag`, `input`, `control`; ids are a Figma id
   (every element with it), `@<instance>` (that instance), `@<instance> <id>`
   (inside it), `slot:<instance>` (its wrapper).

## What Figma already says, and where it goes

- **Error messages.** A component whose Error variant shows a message layer
  with its words in a text property (a Text field''s Helper) gives each
  instance its own message: set the property on each instance in Figma, even
  while it shows Default. The converter writes it as the field''s hidden error
  state (`data-wave-state="error"`, pointed at the field), in the Error
  variant''s look; the prototype shows it when the field fails validation.
  The specimen draws the same part in every variant, so instances match.
- **Destinations.** Figma prototype links (`Navigate to`, `Open link`) are the
  screen''s `data-wave-to`. A button with nowhere to go is advice in the gate:
  link it in Figma.
- **Sizes and type.** Bound variables come back as tokens (BINDINGS), text
  sits on Figma''s pixel grid (the design system''s own 1px token), effect
  styles are shadow tokens.

## What Figma cannot say

Answer these in FEATURE.md or the plan, never by redrawing:

- fields, rules, options, defaults and data (FEATURE.md);
- a loading or error state for data the screen does not fetch: a waiver with
  its reason (`wave:waived` on the screen), when the data is the answers
  carried from earlier steps;
- a component the catalogue does not have (a group of chips): a waiver that
  says so, never an invented component.

A waiver is the designer''s decision. Write the reason, and list every waiver
in the report.

## 5. Hand over to Wave Review

Specimens approved, every screen at fidelity, preflight open only on what the
designer still decides: load **Wave Review**. It runs the dry run, shows the
designer every screen and asks before uploading (`wave_publish_flow`), then
makes the prototype.

## The report to the designer

Always end with: the gate result (blocking fixed, advice left), every change
made in Figma and whether it moved a pixel, fidelity per screen and anything
over the mark with its cause, every waiver with its reason, and the links.
');
end $$;
