-- Wave projects and assets.
--
-- A project is a folder marked is_project. It holds its design system
-- (design-system/: the DTCG tokens file and a components/ folder of specimen
-- pages) and its features, which are flows. Screen slugs are unique within a
-- project, which Wave checks, so every element's address
-- (screen.type.slug) is unique across the project.
--
-- Assets (images, icons, logos, fonts) are registered per project and served
-- publicly from /a/<project>/<hash>.<ext>. Deleting the project deletes its
-- asset rows through the foreign key below; the delete path removes the bytes.

alter table public.nodes
  add column if not exists is_project boolean not null default false;

alter table public.nodes
  drop constraint if exists nodes_project_is_a_folder;
alter table public.nodes
  add constraint nodes_project_is_a_folder check (not is_project or kind = 'folder') not valid;
alter table public.nodes validate constraint nodes_project_is_a_folder;

-- A folder is a project or a feature, not both.
alter table public.nodes
  drop constraint if exists nodes_project_not_flow;
alter table public.nodes
  add constraint nodes_project_not_flow check (not (is_project and is_flow)) not valid;
alter table public.nodes validate constraint nodes_project_not_flow;

-- Wave's asset register, verbatim from packages/wave-db/sql/assets.sql -----------
-- (test/wave-db.test.ts fails if the two drift apart)

-- >>> wave assets
-- Wave's asset register: every image, icon, logo and font a project's mockups
-- use, stored once per project by content hash. Load after schema.sql.
--
-- The bytes live in the host's storage; this records what they are, who
-- uploaded them and for which project, so the project's catalogue can list
-- them and deleting the project can remove them.

create table if not exists public.wave_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  hash text not null,
  ext text not null,
  mime text not null,
  bytes integer not null,
  name text not null default '',
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (project_id, hash),
  constraint wave_assets_hash_shape check (hash ~ '^[0-9a-f]{64}$'),
  constraint wave_assets_ext_shape check (ext ~ '^[a-z0-9]{2,5}$')
);

alter table public.wave_assets alter column created_by set default public.wave_current_user();

alter table public.wave_assets enable row level security;

drop policy if exists wave_assets_select on public.wave_assets;
create policy wave_assets_select on public.wave_assets
  for select using (public.wave_can_read(project_id));

drop policy if exists wave_assets_insert on public.wave_assets;
create policy wave_assets_insert on public.wave_assets
  for insert with check (public.wave_can_edit(project_id) and created_by = public.wave_current_user());
-- <<< wave assets

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'wave_assets_project_fkey') then
    alter table public.wave_assets
      add constraint wave_assets_project_fkey foreign key (project_id) references public.nodes (id) on delete cascade;
  end if;
end $$;

create index if not exists wave_assets_project_idx on public.wave_assets (project_id, created_at desc);
