// Excluded from the typecheck, like generate-postit-space.ts.
//
// Regenerate the migration that publishes the Design for Post-it skill:
//   node --experimental-strip-types scripts/generate-design-skill.ts \
//     > supabase/migrations/20260924120100_design_for_postit_skill.sql

import { STARTER_SKILLS } from "../content/skills.ts";

const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const skill = STARTER_SKILLS.find((s) => s.title === "Design for Post-it")!;

console.log(`-- Publishes the Design for Post-it skill into the Post-it space's Skills
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
  values (v_node, v_space, v_folder, 'file', ${q(skill.title)}, 'design-for-post-it', ${q(skill.body)}, 'skill');
  insert into public.grants (node_id, grantee_type, grantee_id, role)
  values (v_node, 'authenticated', null, 'viewer');
end $$;`);
