-- Being put in a space is the largest thing that can happen to you here, and
-- it was the one thing "Shared with you" did not mention.
--
-- Sharing a page tells you. Being added to a team tells you. Being given a
-- whole space — every folder in it, and everything anybody puts in it later —
-- happened in silence, and the only way to find out was to notice a space you
-- did not recognise in your list. That is the opposite of what this screen is
-- for.
--
-- It arrives as its own kind, because it is not a page: there is no role to
-- report and the address is the space itself.

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
  in_spaces as (
    -- One row per space however many ways you got into it. Being both a member
    -- yourself and on a team that is a member is a real state and a confusing
    -- thing to see listed twice; the later of the two is the news.
    select distinct on (s.id)
      'space'::text as kind,
      s.name as label,
      -- The team is how, when it was a team. Null when you were added by name.
      t.name as detail,
      '/s/' || s.slug as href,
      'member'::text as role,
      p.email as actor,
      case
        when m.member_type = 'team' then greatest(m.added_at, tm.added_at)
        else m.added_at
      end as happened_at
    from public.space_members m
    join public.spaces s on s.id = m.space_id
    left join public.teams t
      on m.member_type = 'team' and t.id = m.member_id
    left join public.team_members tm
      on m.member_type = 'team'
     and tm.team_id = m.member_id
     and tm.user_id = (select auth.uid())
    left join public.profiles p on p.id = m.added_by
    where (m.member_type = 'user' and m.member_id = (select auth.uid()))
       or (m.member_type = 'team' and tm.user_id is not null)
    order by s.id, happened_at desc
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
    union all select * from in_spaces
    union all select * from joined
  )
  select
    e.kind, e.label, e.detail, e.href, e.role, e.actor, e.happened_at,
    (me.shares_seen_at is null or e.happened_at > me.shares_seen_at)
  from everything e, me
  order by e.happened_at desc
  limit 50;
$$;

/** The badge in the header counts the same things the screen lists. */
create or replace function public.new_share_count()
returns integer
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with me as (
    select coalesce(shares_seen_at, '-infinity'::timestamptz) as seen
    from public.profiles where id = (select auth.uid())
  )
  select (
    (select count(*) from public.grants g, me
      where g.grantee_type = 'user'
        and g.grantee_id = (select auth.uid())
        and g.created_at > me.seen)
  + (select count(*) from public.grants g
      join public.team_members tm
        on tm.team_id = g.grantee_id and tm.user_id = (select auth.uid()), me
      where g.grantee_type = 'team'
        and greatest(g.created_at, tm.added_at) > me.seen)
  + (select count(*) from public.team_members tm, me
      where tm.user_id = (select auth.uid()) and tm.added_at > me.seen)
  + (select count(*) from public.space_members m, me
      where m.member_type = 'user'
        and m.member_id = (select auth.uid())
        and m.added_at > me.seen)
  + (select count(*) from public.space_members m
      join public.team_members tm
        on tm.team_id = m.member_id and tm.user_id = (select auth.uid()), me
      where m.member_type = 'team'
        and greatest(m.added_at, tm.added_at) > me.seen)
  )::integer;
$$;

revoke all on function public.shared_with_me() from public, anon;
revoke all on function public.new_share_count() from public, anon;
grant execute on function public.shared_with_me() to authenticated, service_role;
grant execute on function public.new_share_count() to authenticated, service_role;
