-- Teams stop living inside a space.
--
-- A team used to belong to the space it was made in, and that space's owner
-- administered it. The reason was real once: a team grant could only reach that
-- space, so the person who decided the roster was the person whose space was at
-- stake. That constraint went when teams became grantable anywhere.
--
-- What was left of space_id did exactly one job — answer "who may edit this
-- roster" — and it answered it with a filing accident. Whoever happened to make
-- the team, in whichever space they happened to be standing in, owned the group
-- for good. So the team called GPv2 was administered from the Post-it space,
-- and somebody looking for it in the GPv2 space found nothing. The model
-- produced that confusion; nobody chose it.
--
-- A team is now what it always described: a named group of people in this
-- company. It belongs to nowhere in particular.
--
--   * Platform administrators create teams, rename them, decide who is on them
--     and delete them. Nobody else can.
--   * Everybody signed in can see the teams and who is on them, and can share
--     their own pages with any of them. That is what makes sharing with a group
--     safe to offer: you can always see exactly who you are handing it to.
--   * Being on a team still confers nothing by itself. It is a name that pages
--     get shared with.
--   * What a team *reaches* stays private to the people on it and to
--     administrators, because that is a list of documents rather than a list of
--     people.
--
-- Two consequences worth stating rather than discovering.
--
-- Making a team no longer puts you on it. It used to, because the maker was
-- necessarily the owner of the space and so plainly one of the group. An
-- administrator making "Design" for four other people is not in that group, and
-- adding them silently would hand every administrator everything ever shared
-- with every team. They add themselves when they belong.
--
-- And the trade this concentrates rather than creates: an administrator can put
-- themselves on any team and so reach anything shared with it. That was already
-- true of space owners. Rosters are open, which makes it visible, not
-- impossible.

-- One list of groups, so names have to be unique across the company rather than
-- within a space. Anything that collides because it was made in two places is
-- numbered, oldest keeping the plain name. A loop rather than one pass, because
-- the obvious fix ("Design" becomes "Design 2") can collide with a "Design 2"
-- that already exists.
do $$
declare
  v_row record;
  v_try text;
  v_n integer;
begin
  for v_row in
    select t1.id, t1.name
    from public.teams t1
    where exists (
      select 1 from public.teams t2
      where lower(t2.name) = lower(t1.name)
        and t2.id <> t1.id
        and (t2.created_at, t2.id) < (t1.created_at, t1.id)
    )
    order by t1.created_at, t1.id
  loop
    v_n := 1;
    loop
      v_n := v_n + 1;
      v_try := v_row.name || ' ' || v_n;
      exit when not exists (
        select 1 from public.teams where lower(name) = lower(v_try)
      );
    end loop;
    update public.teams set name = v_try where id = v_row.id;
  end loop;
end $$;

-- These read space_id, so they hold the column up. Recreated below against the
-- new rule.
drop policy if exists teams_select_member_or_owner on public.teams;
drop policy if exists teams_write_space_owner on public.teams;
drop policy if exists team_members_select_self_or_owner on public.team_members;
drop policy if exists team_members_write_space_owner on public.team_members;

-- Creating a team put its space's owner on it. There is no space and so no
-- owner, and an administrator is not automatically one of the group.
drop trigger if exists teams_add_creator on public.teams;
drop function if exists public.add_team_creator();

-- Takes the unique (space_id, name) constraint with it.
alter table public.teams drop column if exists space_id;

create unique index if not exists teams_name_unique on public.teams (lower(name));

-- Who administers a team ------------------------------------------------------

/**
 * Whether a team is one the caller may hand something to.
 *
 * Everybody, now, for any team that exists. The old rule — one whose space you
 * own, or one you are on — was reaching for "you can see who you are handing
 * this to", and open rosters answer that for every team rather than for some of
 * them. Kept as a function so the trigger and the picker cannot drift.
 */
create or replace function public.can_grant_to_team(p_team_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select auth.uid()) is not null
    and exists (select 1 from public.teams t where t.id = p_team_id),
    false
  );
$$;

-- Policies ---------------------------------------------------------------------

-- A directory of the company's groups: visible to everybody with an account,
-- and to nobody without one.
create policy teams_select_signed_in on public.teams
  for select using ((select auth.uid()) is not null);

create policy teams_write_admin on public.teams
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Who is on a team is the other half of the same directory. "Who else can read
-- what I share with this" is the question sharing with a group raises, and a
-- product about access that will not answer it is not being careful.
create policy team_members_select_signed_in on public.team_members
  for select using ((select auth.uid()) is not null);

create policy team_members_write_admin on public.team_members
  for all using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Managing a roster -------------------------------------------------------------

/**
 * Adds someone to a team by address.
 *
 * Still the controlled hole over private profiles, and the check still happens
 * before the address is looked at, so it cannot be used to find out who has an
 * account. Only the check changed: administering the platform rather than
 * owning a space.
 */
create or replace function public.add_team_member(
  p_team_id uuid,
  p_email text,
  p_role public.team_member_role default 'member'
)
returns public.team_members
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_target uuid;
  v_member public.team_members;
begin
  if not public.is_platform_admin() then
    -- Indistinguishable from a team that does not exist.
    raise exception 'not found' using errcode = 'no_data_found';
  end if;

  if not exists (select 1 from public.teams t where t.id = p_team_id) then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;

  select id into v_target
  from public.profiles
  where lower(email) = lower(trim(p_email));

  if v_target is null then
    raise exception 'no account exists for %', trim(p_email)
      using errcode = 'P0002';
  end if;

  insert into public.team_members (team_id, user_id, role)
  values (p_team_id, v_target, p_role)
  on conflict (team_id, user_id) do update set role = excluded.role
  returning * into v_member;

  return v_member;
end;
$$;

/** Takes somebody off a team. An administrator's, like adding. */
create or replace function public.remove_team_member(
  p_team_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;

  delete from public.team_members
   where team_id = p_team_id and user_id = p_user_id;

  if not found then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;
end;
$$;

/**
 * Who is on a team.
 *
 * Open to everybody signed in, which is the change that makes sharing with any
 * team defensible: before handing a document to a group you can read the group.
 * It is a list of colleagues, not a list of documents, and everybody here works
 * together.
 */
create or replace function public.team_roster(p_team_id uuid)
returns table (
  user_id uuid,
  email text,
  display_name text,
  role public.team_member_role
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select tm.user_id, p.email, p.display_name, tm.role
  from public.team_members tm
  join public.profiles p on p.id = tm.user_id
  where tm.team_id = p_team_id
    and (select auth.uid()) is not null
  order by p.email;
$$;

/**
 * What a team reaches: the pages and folders shared with it.
 *
 * Deliberately not opened up with the roster. This is a list of documents, and
 * "what does this group have access to" is a different question from "who is in
 * this group". The people on it and the administrators may ask.
 */
create or replace function public.team_reach(p_team_id uuid)
returns table (
  node_id uuid,
  label text,
  href text,
  role public.grant_role,
  space_name text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    n.id,
    n.name,
    '/s/' || s.slug ||
      case when n.path = 'index' then '' else '/' || n.path end,
    g.role,
    s.name
  from public.grants g
  join public.nodes n on n.id = g.node_id
  join public.spaces s on s.id = n.space_id
  where g.grantee_type = 'team'
    and g.grantee_id = p_team_id
    and (public.is_team_member(p_team_id) or public.is_platform_admin())
    and public.can_read(n.id)
  order by s.name, n.path;
$$;

-- The screens --------------------------------------------------------------------

-- Recreated rather than replaced: the row type loses the two columns that named
-- a space the team no longer lives in.
drop function if exists public.my_teams();

/**
 * The teams the caller is on.
 *
 * reach_count is allowed to be zero and is shown as such: a team that reaches
 * nothing yet is the ordinary state of one just made.
 */
create function public.my_teams()
returns table (
  team_id uuid,
  team_name text,
  my_role public.team_member_role,
  member_count integer,
  reach_count integer,
  added_at timestamptz,
  added_by text
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.name,
    tm.role,
    (select count(*)::integer from public.team_members m where m.team_id = t.id),
    (select count(*)::integer from public.team_reach(t.id)),
    tm.added_at,
    p.email
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  left join public.profiles p on p.id = tm.added_by
  where tm.user_id = (select auth.uid())
  order by t.name;
$$;

/**
 * Every team, for the administration screen.
 *
 * Empty for everybody else, which is the answer the rest of this schema gives
 * for anything out of reach: absence rather than refusal. Ordinary people see
 * the teams they are on, through my_teams, and any team's roster when they are
 * choosing who to share with.
 */
create or replace function public.all_teams()
returns table (
  team_id uuid,
  team_name text,
  member_count integer,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.name,
    (select count(*)::integer from public.team_members m where m.team_id = t.id),
    t.created_at
  from public.teams t
  where public.is_platform_admin()
  order by t.name;
$$;

-- Recreated: the row type loses the space a team no longer has, and gains the
-- size of the group, which is what the picker needs in its place.
drop function if exists public.grantable_teams(uuid);

/**
 * The teams this node could be shared with, for the picker.
 *
 * Every team, gated on being able to share the node at all so it cannot be
 * asked as a general question. member_count rather than a home space: the thing
 * worth knowing at the moment of choosing is how many people that name covers.
 */
create function public.grantable_teams(p_node_id uuid)
returns table (
  team_id uuid,
  team_name text,
  member_count integer
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    t.id,
    t.name,
    (select count(*)::integer from public.team_members m where m.team_id = t.id)
  from public.teams t
  where public.can_admin(p_node_id)
  order by t.name;
$$;

/**
 * Recreated for one line: a team no longer has a space to be named after.
 *
 * Everything else is as it was. The space named against a page shared through a
 * team is the page's own space, which is still exactly right.
 */
create or replace function public.shared_with_me()
returns table (
  kind text,
  label text,
  detail text,
  href text,
  role text,
  actor text,
  happened_at timestamptz,
  is_new boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select id, shares_seen_at from public.profiles where id = (select auth.uid())
  ),
  direct as (
    select
      'page'::text as kind,
      n.name as label,
      s.name as detail,
      '/s/' || s.slug ||
        case when n.path = 'index' then '' else '/' || n.path end as href,
      g.role::text as role,
      p.email as actor,
      g.created_at as happened_at
    from public.grants g
    join public.nodes n on n.id = g.node_id
    join public.spaces s on s.id = n.space_id
    left join public.profiles p on p.id = g.granted_by
    where g.grantee_type = 'user'
      and g.grantee_id = (select auth.uid())
      and public.can_read(n.id)
  ),
  through_team as (
    select
      'page'::text,
      n.name,
      t.name || ', in ' || s.name,
      '/s/' || s.slug ||
        case when n.path = 'index' then '' else '/' || n.path end,
      g.role::text,
      p.email,
      -- Whichever happened later: a page given to a team before you joined it
      -- is news on the day you join, not on the day it was given.
      greatest(g.created_at, tm.added_at)
    from public.grants g
    join public.team_members tm
      on tm.team_id = g.grantee_id and tm.user_id = (select auth.uid())
    join public.teams t on t.id = g.grantee_id
    join public.nodes n on n.id = g.node_id
    join public.spaces s on s.id = n.space_id
    left join public.profiles p on p.id = g.granted_by
    where g.grantee_type = 'team'
      and public.can_read(n.id)
  ),
  joined as (
    select
      'team'::text,
      t.name,
      null::text,
      '/teams'::text,
      tm.role::text,
      p.email,
      tm.added_at
    from public.team_members tm
    join public.teams t on t.id = tm.team_id
    left join public.profiles p on p.id = tm.added_by
    where tm.user_id = (select auth.uid())
  ),
  everything as (
    select * from direct
    union all select * from through_team
    union all select * from joined
  )
  select
    e.kind, e.label, e.detail, e.href, e.role, e.actor, e.happened_at,
    (me.shares_seen_at is null or e.happened_at > me.shares_seen_at)
  from everything e, me
  order by e.happened_at desc
  limit 50;
$$;

-- Nothing asks who owns a team's space any more, because a team has no space.
drop function if exists public.owns_team_space(uuid);

revoke all on function public.all_teams() from public, anon;
grant execute on function public.all_teams() to authenticated, service_role;

revoke all on function public.grantable_teams(uuid) from public, anon;
grant execute on function public.grantable_teams(uuid) to authenticated, service_role;

revoke all on function public.my_teams() from public, anon;
grant execute on function public.my_teams() to authenticated, service_role;
