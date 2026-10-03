-- Access, worked out once per space instead of once per row.
--
-- effective_role answers for one node by walking up its ancestry, joining
-- grants and checking membership. Every read of `nodes` called it once per row
-- through can_read, `spaces` called it again per node of every space it
-- probed, and space_node_rights called it four times per node plus a subtree
-- walk for can_delete_node. On staging, with 83 nodes, space_node_rights took
-- 274 ms and listing spaces 345 ms for a member who was not the owner.
--
-- Nothing here changes who may see or do what. Every new path is either the
-- same rules computed for a whole space at once, or a cheap condition that
-- already implies can_read and is checked before it. The authorization suite
-- compares each against the per-node functions for every user and node.

-- The role a user has on every node of one space: effective_role, set-based.
--
-- Walks the space's tree once from its roots down, carrying the strongest
-- grant met on the way, which is what effective_role finds by walking up from
-- each node. Then the same three overrides: the owner is admin; a member, and
-- the author of a node, are at least editor.
--
-- Internal. It takes a user id, so it is not granted to anybody: only the
-- security-definer functions below call it, with auth.uid().
create or replace function public.space_access(p_user_id uuid, p_space_id uuid)
returns table (node_id uuid, role public.grant_role, created_by uuid, parent_id uuid, slug text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive
  me as (
    select
      p_user_id is not null and exists (
        select 1 from public.spaces s
        where s.id = p_space_id and s.owner_id = p_user_id
      ) as owner,
      public.is_space_member(p_user_id, p_space_id) as member
  ),
  granted as (
    select g.node_id, max(g.role) as role
    from public.grants g
    join public.nodes n on n.id = g.node_id and n.space_id = p_space_id
    where
      g.grantee_type = 'public'
      or (p_user_id is not null and g.grantee_type = 'authenticated')
      or (p_user_id is not null and g.grantee_type = 'user' and g.grantee_id = p_user_id)
      or (
        p_user_id is not null
        and g.grantee_type = 'team'
        and exists (
          select 1 from public.team_members tm
          where tm.team_id = g.grantee_id and tm.user_id = p_user_id
        )
      )
    group by g.node_id
  ),
  walk (id, inherited) as (
    -- The roots of this space's tree. A node whose parent is somewhere else
    -- starts afresh here; it inherits nothing from outside the space, so it
    -- can only ever be granted less than effective_role would give, never more.
    select n.id, gr.role
    from public.nodes n
    left join granted gr on gr.node_id = n.id
    where n.space_id = p_space_id
      and (
        n.parent_id is null
        or not exists (
          select 1 from public.nodes p
          where p.id = n.parent_id and p.space_id = p_space_id
        )
      )
    union all
    select c.id, greatest(w.inherited, gr.role)
    from walk w
    join public.nodes c on c.parent_id = w.id and c.space_id = p_space_id
    left join granted gr on gr.node_id = c.id
  )
  select
    n.id,
    case
      when me.owner then 'admin'::public.grant_role
      else greatest(
        w.inherited,
        case when me.member then 'editor'::public.grant_role end,
        case
          when p_user_id is not null and n.created_by = p_user_id
            then 'editor'::public.grant_role
        end
      )
    end,
    n.created_by,
    n.parent_id,
    n.slug
  from walk w
  join public.nodes n on n.id = w.id
  cross join me;
$$;

revoke all on function public.space_access(uuid, uuid) from public, anon, authenticated;

-- What the caller may do to each node of a space, for the sidebar.
--
-- Same answers as before, from one pass over the space. may_delete is
-- can_delete_node's rule: the caller made the node (or it has no author and
-- the caller owns the space), and so is everything beneath it. That is now
-- found by marking the ancestors of every node the caller could not delete on
-- its own, once, instead of walking each node's subtree.
--
-- Presentation only, as it always was: the policies decide when the write
-- arrives.
create or replace function public.space_node_rights(p_space_id uuid)
returns table (
  node_id uuid,
  may_edit boolean,
  may_delete boolean,
  may_share boolean,
  may_evict boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with recursive
  me as (
    select
      (select auth.uid()) as uid,
      exists (
        select 1 from public.spaces s
        where s.id = p_space_id and s.owner_id = (select auth.uid())
      ) as owner
  ),
  access as (
    select a.* from public.space_access((select auth.uid()), p_space_id) a
  ),
  -- Nodes the caller could not delete even with nothing beneath them.
  foreign_made as (
    select a.node_id, a.parent_id
    from access a cross join me
    -- Spelled out against nulls: a node with no author must land here unless
    -- the caller owns the space, not fall out of the set as unknown.
    where not coalesce(
      me.uid is not null
      and (
        a.created_by = me.uid
        or (a.created_by is null and me.owner)
      ),
      false
    )
  ),
  -- Everything above one of those, which takes it down with it.
  blocked (id) as (
    select f.parent_id from foreign_made f where f.parent_id is not null
    union
    select n.parent_id
    from blocked b
    join public.nodes n on n.id = b.id
    where n.parent_id is not null and n.space_id = p_space_id
  )
  select
    a.node_id,
    a.role in ('editor', 'admin'),
    me.uid is not null
      and not exists (select 1 from foreign_made f where f.node_id = a.node_id)
      and not exists (select 1 from blocked b where b.id = a.node_id),
    a.role = 'admin',
    coalesce(
      me.owner
      and a.created_by is not null
      and a.created_by <> me.uid
      and not (a.parent_id is null and a.slug = 'index'),
      false
    )
  from access a cross join me
  where a.role is not null;
$$;

revoke all on function public.space_node_rights(uuid) from public, anon;
grant execute on function public.space_node_rights(uuid) to authenticated, service_role;

-- The spaces the caller is in: owned, or a member directly or through a team.
-- is_space_member's rule, for every space at once.
create or replace function public.my_spaces()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id from public.spaces s
  where s.owner_id = (select auth.uid())
  union
  select m.space_id
  from public.space_members m
  where (select auth.uid()) is not null
    and (
      (m.member_type = 'user' and m.member_id = (select auth.uid()))
      or (
        m.member_type = 'team'
        and exists (
          select 1 from public.team_members tm
          where tm.team_id = m.member_id and tm.user_id = (select auth.uid())
        )
      )
    );
$$;

revoke all on function public.my_spaces() from public;
grant execute on function public.my_spaces() to anon, authenticated, service_role;

-- Spaces with at least one node the caller can read.
--
-- A node is readable through membership, authorship, or a grant on it or an
-- ancestor; and a node with a grant on it is itself readable. So a space has
-- a readable node exactly when the caller is in it (and it has a node), made
-- a node in it, or holds a grant on a node in it.
create or replace function public.readable_space_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.space_id from public.nodes n
  where n.space_id in (select public.my_spaces())
  union
  select n.space_id from public.nodes n
  where (select auth.uid()) is not null and n.created_by = (select auth.uid())
  union
  select n.space_id
  from public.grants g
  join public.nodes n on n.id = g.node_id
  where
    g.grantee_type = 'public'
    or ((select auth.uid()) is not null and g.grantee_type = 'authenticated')
    or ((select auth.uid()) is not null and g.grantee_type = 'user' and g.grantee_id = (select auth.uid()))
    or (
      (select auth.uid()) is not null
      and g.grantee_type = 'team'
      and exists (
        select 1 from public.team_members tm
        where tm.team_id = g.grantee_id and tm.user_id = (select auth.uid())
      )
    );
$$;

revoke all on function public.readable_space_ids() from public;
grant execute on function public.readable_space_ids() to anon, authenticated, service_role;

-- Reading a node: the conditions that settle most rows cheaply come first, and
-- each of them already makes can_read true (the author and a member are
-- editors, the owner is admin), so the policy admits exactly the rows it did.
-- The subqueries are uncorrelated and run once per statement; can_read runs
-- only for rows none of them settles, which is what is shared from elsewhere.
drop policy if exists nodes_select_readable on public.nodes;
create policy nodes_select_readable on public.nodes
  for select
  using (
    (
      (select auth.uid()) is not null
      and (
        created_by = (select auth.uid())
        or space_id in (select public.my_spaces())
      )
    )
    or public.can_read(id)
  );

drop policy if exists spaces_select_readable on public.spaces;
create policy spaces_select_readable on public.spaces
  for select
  using (
    owner_id = (select auth.uid())
    or id in (select public.readable_space_ids())
  );
