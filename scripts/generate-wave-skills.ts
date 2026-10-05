// Excluded from the typecheck, like generate-postit-space.ts.
//
// Regenerate the migration that publishes Wave's skills into the Wave space:
//   npx vite-node scripts/generate-wave-skills.ts \
//     > supabase/migrations/<new timestamp>_wave_skills_<what changed>.sql

import { WAVE_SKILL_PAGES } from "../content/skills.ts";

const q = (s: string) => "'" + s.replace(/'/g, "''") + "'";
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
const titles = WAVE_SKILL_PAGES.map((p) => p.skill.title);

console.log(`-- Publishes Wave's skills into the Wave space, where Claude Design and
-- Claude Code find them with list_skills and get_skill:
--   skills/designer/     the Claude Design flow (Wave Design and its stages)
--   skills/engineering/  the Figma flow and Wave Build
--   skills/gates/        checks anyone can run (the Figma entry gate)
--
-- The Wave space is restricted: only its members can read it, so nothing here
-- is granted to everybody. The text is content/skills.ts (whose vocabulary comes
-- from packages/wave-skills). Wave's skills that earlier migrations put in the
-- Post-it space's shared Skills folder are removed from there.
--
-- Needs the Wave space (slug wave) to exist; without it, nothing changes.
-- Safe to run again: an existing page is brought up to date.

create or replace function pg_temp.put_skill(p_folder uuid, p_space uuid, p_title text, p_slug text, p_body text)
returns void
language plpgsql
as $fn$
declare
  v_node uuid;
begin
  select id into v_node from public.nodes where parent_id = p_folder and slug = p_slug limit 1;
  if v_node is null then
    insert into public.nodes (space_id, parent_id, kind, name, slug, content, content_type)
    values (p_space, p_folder, 'file', p_title, p_slug, p_body, 'skill');
  else
    update public.nodes
       set name = p_title, content = p_body, content_type = 'skill',
           content_version = content_version + 1, updated_at = now()
     where id = v_node and (name, content) is distinct from (p_title, p_body);
  end if;
end;
$fn$;

create or replace function pg_temp.folder(p_space uuid, p_parent uuid, p_name text, p_slug text)
returns uuid
language plpgsql
as $fn$
declare
  v_id uuid;
begin
  select id into v_id from public.nodes
   where space_id = p_space and kind = 'folder' and slug = p_slug
     and parent_id is not distinct from p_parent
   limit 1;
  if v_id is null then
    insert into public.nodes (space_id, parent_id, kind, name, slug)
    values (p_space, p_parent, 'folder', p_name, p_slug)
    returning id into v_id;
  end if;
  return v_id;
end;
$fn$;

do $$
declare
  v_space uuid;
  v_skills uuid;
  v_designer uuid;
  v_engineering uuid;
  v_gates uuid;
  v_postit uuid;
begin
  select id into v_space from public.spaces where slug = 'wave';
  if v_space is null then
    raise notice 'no Wave space here; skipping';
    return;
  end if;

  v_skills := pg_temp.folder(v_space, null, 'Skills', 'skills');
  v_designer := pg_temp.folder(v_space, v_skills, 'Designer', 'designer');
  v_engineering := pg_temp.folder(v_space, v_skills, 'Engineering', 'engineering');
  v_gates := pg_temp.folder(v_space, v_skills, 'Gates', 'gates');

${WAVE_SKILL_PAGES.map((p) => `  perform pg_temp.put_skill(${p.folder === "designer" ? "v_designer" : p.folder === "gates" ? "v_gates" : "v_engineering"}, v_space, ${q(p.skill.title)}, '${slug(p.skill.title)}', ${q(p.skill.body)});`).join("\n")}

  -- Wave's skills no longer live in the Post-it space's shared Skills folder.
  select id into v_postit from public.spaces where slug = 'postit';
  if v_postit is not null then
    delete from public.nodes
     where space_id = v_postit and kind = 'file'
       and parent_id = (select id from public.nodes where space_id = v_postit and kind = 'folder' and slug = 'skills' and parent_id is null)
       and slug = any (array[${[...titles.map(slug), "design-for-post-it"].map((s) => `'${s}'`).join(", ")}]);
  end if;
end $$;`);
