-- Shared screens -------------------------------------------------------------------

/**
 * A feature may use a screen that lives in another feature of its project
 * (the same header, the same confirmation screen). The screen keeps one
 * identity, one address and one version history; the features that use it
 * name it here. The host's wave_flow_members lists used screens with the
 * feature's own.
 */
create table if not exists public.wave_flow_screens (
  flow_id uuid not null,
  screen_id uuid not null,
  added_by uuid,
  created_at timestamptz not null default now(),
  primary key (flow_id, screen_id)
);

create index if not exists wave_flow_screens_screen_idx on public.wave_flow_screens (screen_id);

alter table public.wave_flow_screens enable row level security;

drop policy if exists wave_flow_screens_select on public.wave_flow_screens;
create policy wave_flow_screens_select on public.wave_flow_screens
  for select using (public.wave_can_read(flow_id));

drop policy if exists wave_flow_screens_insert on public.wave_flow_screens;
create policy wave_flow_screens_insert on public.wave_flow_screens
  for insert with check (public.wave_can_edit(flow_id) and public.wave_can_read(screen_id) and added_by = public.wave_current_user());

drop policy if exists wave_flow_screens_delete on public.wave_flow_screens;
create policy wave_flow_screens_delete on public.wave_flow_screens
  for delete using (public.wave_can_edit(flow_id));

/**
 * An approval locks its feature: the versions it froze are what the feature
 * shows (review, prototype, handover) until somebody reopens it. Later
 * versions of its screens belong to the features that made them.
 */
alter table public.wave_flow_approvals add column if not exists reopened_at timestamptz;
alter table public.wave_flow_approvals add column if not exists reopened_by uuid;

drop function if exists public.wave_flow_approval(uuid);
create function public.wave_flow_approval(p_flow_id uuid)
returns table (id uuid, approved_by_email text, approved_at timestamptz, members jsonb, tokens jsonb, waivers jsonb, reopened_at timestamptz, reopened_by_email text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, public.wave_user_label(a.approved_by), a.approved_at, a.members, a.tokens, a.waivers, a.reopened_at, public.wave_user_label(a.reopened_by)
  from public.wave_flow_approvals a
  where a.flow_id = p_flow_id
    and public.wave_current_user() is not null
    and public.wave_can_read(p_flow_id)
  order by a.approved_at desc
  limit 1;
$$;

/** Unlocks an approved feature so its screens can change; it needs approving again. */
create or replace function public.wave_reopen_flow(p_flow_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := public.wave_current_user();
begin
  if v_user is null or not public.wave_can_edit(p_flow_id) then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;
  update public.wave_flow_approvals a
     set reopened_at = now(), reopened_by = v_user
   where a.id = (select x.id from public.wave_flow_approvals x where x.flow_id = p_flow_id order by x.approved_at desc limit 1)
     and a.reopened_at is null;
end;
$$;

/** Which features use a screen, besides the one it lives in. */
create or replace function public.wave_screen_users(p_screen_id uuid)
returns table (flow_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.flow_id from public.wave_flow_screens s
  where s.screen_id = p_screen_id
    and public.wave_current_user() is not null
    and public.wave_can_read(s.flow_id);
$$;

