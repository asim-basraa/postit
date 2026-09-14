-- Now that a file can be HTML or JSON, counting only articles and skills
-- undercounts what somebody is actually keeping.
--
-- The column keeps its name so the signature does not change, but it now means
-- "pages that are not skills" rather than "pages typed article". The screen
-- that reads it is labelled Pages to match. Skills stay counted separately
-- because that distinction is the one an administrator is actually asking
-- about.
create or replace function public.admin_users()
returns table (
  id uuid,
  email text,
  display_name text,
  is_admin boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz,
  disabled boolean,
  spaces integer,
  articles integer,
  skills integer,
  folders integer,
  content_bytes bigint,
  history_bytes bigint
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    p.id,
    p.email,
    p.display_name,
    p.is_admin,
    p.created_at,
    u.last_sign_in_at,
    (u.banned_until is not null and u.banned_until > now()) as disabled,
    coalesce(owned.spaces, 0),
    coalesce(held.articles, 0),
    coalesce(held.skills, 0),
    coalesce(held.folders, 0),
    coalesce(held.content_bytes, 0),
    coalesce(kept.history_bytes, 0)
  from public.profiles p
  join auth.users u on u.id = p.id
  left join lateral (
    select count(*)::integer as spaces
    from public.spaces s where s.owner_id = p.id
  ) owned on true
  left join lateral (
    select
      count(*) filter (
        where n.kind = 'file' and n.content_type <> 'skill'
      )::integer as articles,
      count(*) filter (where n.content_type = 'skill')::integer as skills,
      count(*) filter (where n.kind = 'folder')::integer as folders,
      coalesce(sum(octet_length(coalesce(n.content, ''))), 0)::bigint as content_bytes
    from public.nodes n
    join public.spaces s on s.id = n.space_id
    where s.owner_id = p.id
  ) held on true
  left join lateral (
    -- What the history costs, which is the part that grows on its own.
    select coalesce(sum(octet_length(coalesce(r.middle, ''))), 0)::bigint as history_bytes
    from public.node_revisions r
    join public.nodes n on n.id = r.node_id
    join public.spaces s on s.id = n.space_id
    where s.owner_id = p.id
  ) kept on true
  where public.is_platform_admin()
  order by p.email;
$$;

revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated, service_role;
