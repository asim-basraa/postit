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
