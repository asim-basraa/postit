-- Wave: the mockup review engine, now a set of packages Post-it hosts.
--
-- The tables mockup review created become Wave's (wave_screen_versions,
-- wave_waivers, wave_flow_approvals), and their rules move from Post-it's own
-- can_read and can_edit to the wave_* host functions defined here. Those are
-- the only thing Wave asks of a host database; see packages/wave-db.
--
-- Comments stay Post-it's: their anchor and status columns, set_comment_status
-- and reattach_comment are unchanged.

-- The host contract, answered by Post-it ----------------------------------------

create or replace function public.wave_current_user()
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$ select auth.uid() $$;

create or replace function public.wave_can_read(p_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select public.can_read(p_id) $$;

create or replace function public.wave_can_edit(p_id uuid)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select public.can_edit(p_id) $$;

-- Profiles are private, so this reads them as the definer. It answers only for
-- a signed-in caller, and only an email.
create or replace function public.wave_user_label(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.email from public.profiles p
  where p.id = p_user and (select auth.uid()) is not null
$$;

-- A flow is a folder marked is_flow; its members are the HTML and JSON files
-- directly in it. Approved means the page review approved this very version.
create or replace function public.wave_flow_members(p_flow_id uuid)
returns table (id uuid, name text, path text, kind text, content_version integer, approved_current boolean, content text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id, n.name, n.path,
         case when n.content_type = 'html' then 'screen' else 'tokens' end,
         n.content_version,
         n.review_status = 'approved' and n.review_version = n.content_version,
         case when n.content_type = 'json' then n.content end
  from public.nodes n
  where n.parent_id = p_flow_id
    and n.kind = 'file'
    and n.content_type in ('html', 'json')
    and (select auth.uid()) is not null
    and public.can_read(p_flow_id)
  order by n.name
$$;

-- Post-it's rules for who approves a flow: somebody in its space, and not the
-- person who made it (or the space's owner, when that account is gone).
create or replace function public.wave_approval_refusal(p_flow_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_folder public.nodes%rowtype;
  v_owner uuid;
begin
  select * into v_folder from public.nodes where id = p_flow_id;
  if v_folder.id is null or v_folder.kind <> 'folder' then
    return 'not found';
  end if;
  if not v_folder.is_flow then
    return 'This folder is not a flow.';
  end if;
  if not public.in_space(v_folder.space_id) then
    return 'Only somebody in this space can approve its flows.';
  end if;
  select owner_id into v_owner from public.spaces where id = v_folder.space_id;
  if coalesce(v_folder.created_by, v_owner) = (select auth.uid()) then
    return 'Somebody other than the person who made this flow has to approve it.';
  end if;
  return null;
end;
$$;

create or replace function public.wave_open_comment_count(p_flow_id uuid)
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)::integer
  from public.comments c
  join public.nodes n on n.id = c.node_id
  where n.parent_id = p_flow_id
    and c.parent_id is null
    and c.deleted_at is null
    and c.status in ('open', 'addressed')
    and public.can_read(p_flow_id)
$$;

-- Mockup review's tables become Wave's -------------------------------------------

do $$
begin
  if to_regclass('public.mockup_revisions') is not null and to_regclass('public.wave_screen_versions') is null then
    alter table public.mockup_revisions rename to wave_screen_versions;
    alter table public.wave_screen_versions rename column node_id to screen_id;
  end if;
  if to_regclass('public.mockup_waivers') is not null and to_regclass('public.wave_waivers') is null then
    alter table public.mockup_waivers rename to wave_waivers;
    alter table public.wave_waivers rename column folder_id to flow_id;
    alter table public.wave_waivers rename constraint mockup_waivers_note_not_blank to wave_waivers_note_not_blank;
  end if;
  if to_regclass('public.flow_approvals') is not null and to_regclass('public.wave_flow_approvals') is null then
    alter table public.flow_approvals rename to wave_flow_approvals;
    alter table public.wave_flow_approvals rename column folder_id to flow_id;
  end if;
end $$;

drop policy if exists mockup_revisions_select_readable on public.wave_screen_versions;
drop policy if exists mockup_revisions_insert_editor on public.wave_screen_versions;
drop policy if exists mockup_revisions_update_editor on public.wave_screen_versions;
drop policy if exists mockup_waivers_select_readable on public.wave_waivers;
drop policy if exists mockup_waivers_insert_editor on public.wave_waivers;
drop policy if exists mockup_waivers_delete_editor on public.wave_waivers;
drop policy if exists flow_approvals_select_readable on public.wave_flow_approvals;

drop function if exists public.approve_flow(uuid);
drop function if exists public.flow_approval(uuid);
drop function if exists public.flow_waivers(uuid);

-- Approvals made before the rename name their members the old way.
update public.wave_flow_approvals
   set members = (select coalesce(jsonb_agg((m - 'node_id') || jsonb_build_object('screen_id', m->'node_id')), '[]'::jsonb)
                    from jsonb_array_elements(members) m),
       tokens = (select coalesce(jsonb_agg((t - 'node_id') || jsonb_build_object('resource_id', t->'node_id')), '[]'::jsonb)
                   from jsonb_array_elements(tokens) t)
 where exists (select 1 from jsonb_array_elements(members) m where m ? 'node_id');

-- Wave's schema, verbatim from packages/wave-db/sql/schema.sql -------------------
-- (test/wave-db.test.ts fails if the two drift apart)

-- >>> wave schema
-- Wave's own tables and functions. Load after the host contract
-- (host-contract.sql, with the host's bodies). Safe to run again.
--
-- The mockup's HTML is the spec, and nothing here keeps a second copy of it
-- that could disagree. What lives here is what is not the design: an index of
-- each version (a cache, rebuildable from its stored copy), the gaps somebody
-- agreed to accept, and the record of an approval.

-- What each version of a screen was ------------------------------------------------

create table if not exists public.wave_screen_versions (
  id uuid primary key default gen_random_uuid(),
  screen_id uuid not null,
  content_version integer not null,
  snapshot_key text,
  screen jsonb not null default '{}'::jsonb,
  nodes jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  extras jsonb not null default '{}'::jsonb,
  author_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (screen_id, content_version)
);

alter table public.wave_screen_versions alter column author_id set default public.wave_current_user();

create index if not exists wave_screen_versions_screen_idx
  on public.wave_screen_versions (screen_id, content_version desc);

alter table public.wave_screen_versions enable row level security;

drop policy if exists wave_screen_versions_select on public.wave_screen_versions;
create policy wave_screen_versions_select on public.wave_screen_versions
  for select using (public.wave_can_read(screen_id));

-- Written by the save path, as the person saving.
drop policy if exists wave_screen_versions_insert on public.wave_screen_versions;
create policy wave_screen_versions_insert on public.wave_screen_versions
  for insert with check (public.wave_can_edit(screen_id));

drop policy if exists wave_screen_versions_update on public.wave_screen_versions;
create policy wave_screen_versions_update on public.wave_screen_versions
  for update using (public.wave_can_edit(screen_id)) with check (public.wave_can_edit(screen_id));

-- Gaps somebody agreed to accept -------------------------------------------------

create table if not exists public.wave_waivers (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null,
  check_key text not null,
  message text not null default '',
  note text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  unique (flow_id, check_key),
  constraint wave_waivers_note_not_blank check (length(btrim(note)) > 0)
);

alter table public.wave_waivers alter column created_by set default public.wave_current_user();

alter table public.wave_waivers enable row level security;

drop policy if exists wave_waivers_select on public.wave_waivers;
create policy wave_waivers_select on public.wave_waivers
  for select using (public.wave_can_read(flow_id));

drop policy if exists wave_waivers_insert on public.wave_waivers;
create policy wave_waivers_insert on public.wave_waivers
  for insert with check (public.wave_can_edit(flow_id) and created_by = public.wave_current_user());

-- Replacing a waiver's reason is an upsert, which needs update too.
drop policy if exists wave_waivers_update on public.wave_waivers;
create policy wave_waivers_update on public.wave_waivers
  for update using (public.wave_can_edit(flow_id))
  with check (public.wave_can_edit(flow_id) and created_by = public.wave_current_user());

drop policy if exists wave_waivers_delete on public.wave_waivers;
create policy wave_waivers_delete on public.wave_waivers
  for delete using (public.wave_can_edit(flow_id));

-- Approving a whole flow ---------------------------------------------------------

/**
 * A flow's approval: which version of every screen and token file was agreed.
 *
 * Nothing invalidates a row. Whether an approval still stands is a comparison
 * made on reading it, so an edit un-approves the flow without anything having
 * to remember to.
 */
create table if not exists public.wave_flow_approvals (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null,
  approved_by uuid,
  approved_at timestamptz not null default now(),
  members jsonb not null,
  tokens jsonb not null default '[]'::jsonb,
  waivers jsonb not null default '[]'::jsonb
);

create index if not exists wave_flow_approvals_flow_idx
  on public.wave_flow_approvals (flow_id, approved_at desc);

alter table public.wave_flow_approvals enable row level security;

drop policy if exists wave_flow_approvals_select on public.wave_flow_approvals;
create policy wave_flow_approvals_select on public.wave_flow_approvals
  for select using (public.wave_can_read(flow_id));

-- No insert policy: wave_approve_flow is the only way in.

/**
 * Approves a flow, freezing what was approved.
 *
 * Refuses unless the host says this person may, every screen and token file is
 * approved at its current version, no comment is still open or addressed, and
 * every screen has a stored copy of its current version.
 */
create or replace function public.wave_approve_flow(p_flow_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := public.wave_current_user();
  v_refusal text;
  v_member record;
  v_open integer;
  v_members jsonb;
  v_tokens jsonb;
  v_waivers jsonb;
  v_id uuid;
begin
  if v_user is null or not public.wave_can_read(p_flow_id) then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;

  v_refusal := public.wave_approval_refusal(p_flow_id);
  if v_refusal is not null then
    raise exception '%', v_refusal using errcode = 'insufficient_privilege';
  end if;

  if not exists (select 1 from public.wave_flow_members(p_flow_id) m where m.kind = 'screen') then
    raise exception 'This flow has no screens yet.' using errcode = 'check_violation';
  end if;

  for v_member in select m.name, m.approved_current from public.wave_flow_members(p_flow_id) m loop
    if not coalesce(v_member.approved_current, false) then
      raise exception '% is not approved at its current version.', v_member.name using errcode = 'check_violation';
    end if;
  end loop;

  v_open := coalesce(public.wave_open_comment_count(p_flow_id), 0);
  if v_open > 0 then
    raise exception '% comment% still open or waiting to be confirmed.', v_open, case when v_open = 1 then ' is' else 's are' end
      using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'screen_id', m.id,
           'name', m.name,
           'path', m.path,
           'content_version', m.content_version,
           'snapshot_key', v.snapshot_key
         ) order by m.name), '[]'::jsonb)
    into v_members
  from public.wave_flow_members(p_flow_id) m
  left join public.wave_screen_versions v
    on v.screen_id = m.id and v.content_version = m.content_version
  where m.kind = 'screen';

  if exists (select 1 from jsonb_array_elements(v_members) m where m->>'snapshot_key' is null) then
    raise exception 'A screen has no stored copy of its current version. Open it once in review, then approve again.'
      using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'resource_id', m.id,
           'name', m.name,
           'content_version', m.content_version,
           'content', m.content
         ) order by m.name), '[]'::jsonb)
    into v_tokens
  from public.wave_flow_members(p_flow_id) m
  where m.kind = 'tokens';

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', w.check_key,
           'message', w.message,
           'note', w.note,
           'by', public.wave_user_label(w.created_by)
         ) order by w.created_at), '[]'::jsonb)
    into v_waivers
  from public.wave_waivers w
  where w.flow_id = p_flow_id;

  insert into public.wave_flow_approvals (flow_id, approved_by, members, tokens, waivers)
  values (p_flow_id, v_user, v_members, v_tokens, v_waivers)
  returning id into v_id;

  return v_id;
end;
$$;

/** The latest approval of a flow, with who gave it. */
create or replace function public.wave_flow_approval(p_flow_id uuid)
returns table (id uuid, approved_by_email text, approved_at timestamptz, members jsonb, tokens jsonb, waivers jsonb)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, public.wave_user_label(a.approved_by), a.approved_at, a.members, a.tokens, a.waivers
  from public.wave_flow_approvals a
  where a.flow_id = p_flow_id
    and public.wave_current_user() is not null
    and public.wave_can_read(p_flow_id)
  order by a.approved_at desc
  limit 1;
$$;

/** Who wrote each waiver, for showing it. */
create or replace function public.wave_flow_waivers(p_flow_id uuid)
returns table (id uuid, check_key text, message text, note text, by_email text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.check_key, w.message, w.note, public.wave_user_label(w.created_by), w.created_at
  from public.wave_waivers w
  where w.flow_id = p_flow_id
    and public.wave_current_user() is not null
    and public.wave_can_read(p_flow_id)
  order by w.created_at;
$$;
-- <<< wave schema

-- Who may call what ---------------------------------------------------------------

do $$
declare
  f text;
begin
  foreach f in array array[
    'wave_current_user()', 'wave_can_read(uuid)', 'wave_can_edit(uuid)', 'wave_user_label(uuid)',
    'wave_flow_members(uuid)', 'wave_approval_refusal(uuid)', 'wave_open_comment_count(uuid)',
    'wave_approve_flow(uuid)', 'wave_flow_approval(uuid)', 'wave_flow_waivers(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
