-- Prototype links: a feature's prototype, playable by anyone holding the link.
--
-- The token is the permission, as for a mockup's /m/ link, but a prototype is
-- a whole feature (every screen and its mock API), so it gets its own links:
-- several per feature, each with a label, an optional expiry, and revocable on
-- its own. Only the token's SHA-256 is kept; the link is shown once, when it is
-- made. Deleting the feature deletes its links.
--
-- Editors of the feature make, list and revoke links. Nobody reads this table
-- to open a link: the public route looks the hash up with the service role and
-- serves only that feature's screens.

create table if not exists public.wave_prototype_links (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null references public.nodes (id) on delete cascade,
  token_hash text not null unique,
  label text not null default '',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint wave_prototype_links_hash_shape check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint wave_prototype_links_label_length check (char_length(label) <= 200)
);

create index if not exists wave_prototype_links_flow_idx on public.wave_prototype_links (flow_id, created_at desc);

alter table public.wave_prototype_links enable row level security;

drop policy if exists wave_prototype_links_select on public.wave_prototype_links;
create policy wave_prototype_links_select on public.wave_prototype_links
  for select using (public.can_edit(flow_id));

drop policy if exists wave_prototype_links_insert on public.wave_prototype_links;
create policy wave_prototype_links_insert on public.wave_prototype_links
  for insert with check (
    public.can_edit(flow_id)
    and created_by = auth.uid()
    and revoked_at is null
    and exists (select 1 from public.nodes n where n.id = flow_id and n.kind = 'folder' and n.is_flow)
  );

-- Revoking is the only change: a link cannot be moved to another feature or revived.
drop policy if exists wave_prototype_links_update on public.wave_prototype_links;
create policy wave_prototype_links_update on public.wave_prototype_links
  for update using (public.can_edit(flow_id)) with check (public.can_edit(flow_id) and revoked_at is not null);

create or replace function public.wave_prototype_links_frozen()
returns trigger
language plpgsql
as $$
begin
  if new.flow_id <> old.flow_id or new.token_hash <> old.token_hash or new.created_by is distinct from old.created_by or new.created_at <> old.created_at then
    raise exception 'only revoked_at, label and expires_at can change on a prototype link' using errcode = 'check_violation';
  end if;
  if old.revoked_at is not null and new.revoked_at is null then
    raise exception 'a revoked prototype link stays revoked' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists wave_prototype_links_frozen on public.wave_prototype_links;
create trigger wave_prototype_links_frozen
  before update on public.wave_prototype_links
  for each row execute function public.wave_prototype_links_frozen();

grant select, insert, update on public.wave_prototype_links to authenticated;
