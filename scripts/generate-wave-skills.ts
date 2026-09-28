// Excluded from the typecheck, like generate-postit-space.ts.
//
// Regenerate the migration that publishes Wave's skills into the Post-it space:
//   npx vite-node scripts/generate-wave-skills.ts \
//     > supabase/migrations/20260928100100_wave_skills.sql

import { STARTER_SKILLS } from "../content/skills.ts";

const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const design = STARTER_SKILLS.find((s) => s.title === "Wave Design")!;
const build = STARTER_SKILLS.find((s) => s.title === "Wave Build")!;

console.log(`-- Publishes Wave's skills into the Post-it space's Skills folder, where
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

  perform pg_temp.put_skill(v_folder, v_space, array['wave-design', 'design-for-post-it'], ${q(design.title)}, 'wave-design', ${q(design.body)});
  perform pg_temp.put_skill(v_folder, v_space, array['wave-build'], ${q(build.title)}, 'wave-build', ${q(build.body)});
end $$;`);
