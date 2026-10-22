-- Wave is leaving Post-it for a product of its own. This hands over what it
-- takes with it, for Wave's scripts/migrate-from-postit.ts to write into Wave
-- with public.wave_import.
--
-- What goes: whole spaces named by slug (the Wave space, with its docs and
-- skills) and projects named by id (each one's folder and everything under it,
-- plus its space and that space's home page). With them, everything those
-- pages carry: revisions, comments, grants, links, open invitations and every
-- Wave row (screen versions, assets, waivers, approvals, shared screens,
-- prototype links, test runs). And the people: every member of those spaces,
-- directly or through a team, everyone granted a page in them, and everyone a
-- copied row names (authors, reviewers, owners), with their auth rows so they
-- keep their passwords.
--
-- Read-only. Callable only with the service key, because it returns
-- auth.users. `keys` lists the storage objects (bucket artifacts) the pages
-- point at, for the script to copy.

create or replace function public.wave_export(p_space_slugs text[], p_project_ids uuid[])
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_nodes uuid[];
  v_spaces uuid[];
  v_teams uuid[];
  v_users uuid[];
  v_flows uuid[];
  v_flow_screens jsonb := '[]';
begin
  select coalesce(array_agg(distinct n.id), '{}') into v_nodes
    from public.nodes n
   where n.space_id in (select id from public.spaces where slug = any (p_space_slugs))
      or exists (
        select 1 from public.nodes p
         where p.id = any (p_project_ids) and p.space_id = n.space_id
           and (n.path = p.path or n.path like p.path || '/%'
                or (n.parent_id is null and n.slug = 'index'))
      );

  select coalesce(array_agg(distinct space_id), '{}') into v_spaces
    from public.nodes where id = any (v_nodes);
  v_spaces := v_spaces || coalesce((select array_agg(id) from public.spaces where slug = any (p_space_slugs)), '{}');

  select coalesce(array_agg(distinct t), '{}') into v_teams from (
    select member_id t from public.space_members where space_id = any (v_spaces) and member_type::text = 'team'
    union select grantee_id from public.grants where node_id = any (v_nodes) and grantee_type::text = 'team'
  ) x;

  select coalesce(array_agg(id), '{}') into v_flows
    from public.nodes where id = any (v_nodes) and (is_flow or is_project);

  select coalesce(array_agg(distinct u), '{}') into v_users from (
    select member_id u from public.space_members where space_id = any (v_spaces) and member_type::text = 'user'
    union select added_by from public.space_members where space_id = any (v_spaces)
    union select user_id from public.team_members where team_id = any (v_teams)
    union select grantee_id from public.grants where node_id = any (v_nodes) and grantee_type::text = 'user'
    union select granted_by from public.grants where node_id = any (v_nodes)
    union select owner_id from public.spaces where id = any (v_spaces)
    union select created_by from public.nodes where id = any (v_nodes)
    union select review_by from public.nodes where id = any (v_nodes)
    union select author_id from public.node_revisions where node_id = any (v_nodes)
    union select author_id from public.comments where node_id = any (v_nodes)
    union select status_by from public.comments where node_id = any (v_nodes)
    union select invited_by from public.invitations where node_id = any (v_nodes) or space_id = any (v_spaces)
    union select author_id from public.wave_screen_versions where screen_id = any (v_nodes)
    union select created_by from public.wave_assets where project_id = any (v_nodes)
    union select created_by from public.wave_waivers where flow_id = any (v_nodes)
    union select approved_by from public.wave_flow_approvals where flow_id = any (v_nodes)
    union select run_by from public.wave_test_runs where flow_id = any (v_nodes)
  ) x where u is not null and exists (select 1 from public.profiles where id = u);

  -- Not every Post-it has applied wave_shared_screens.
  if to_regclass('public.wave_flow_screens') is not null then
    execute 'select coalesce(jsonb_agg(to_jsonb(t)), ''[]'') from public.wave_flow_screens t where flow_id = any ($1)'
      into v_flow_screens using v_flows;
  end if;

  return jsonb_build_object(
    'tables', jsonb_build_object(
      'auth.users', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from auth.users t where id = any (v_users)),
      'auth.identities', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from auth.identities t where user_id = any (v_users)),
      'public.profiles', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.profiles t where id = any (v_users)),
      'public.signup_email_domains', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.signup_email_domains t),
      'public.teams', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.teams t where id = any (v_teams)),
      'public.team_members', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.team_members t where team_id = any (v_teams)),
      'public.spaces', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.spaces t where id = any (v_spaces)),
      'public.space_members', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.space_members t where space_id = any (v_spaces)),
      'public.nodes', (select coalesce(jsonb_agg(to_jsonb(t) - 'search_vector'), '[]') from public.nodes t where id = any (v_nodes)),
      'public.grants', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.grants t where node_id = any (v_nodes)),
      'public.node_revisions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.node_revisions t where node_id = any (v_nodes)),
      'public.comments', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.comments t where node_id = any (v_nodes)),
      'public.links', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.links t where source_node_id = any (v_nodes) and target_node_id = any (v_nodes)),
      'public.invitations', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.invitations t
                              where accepted_at is null and (node_id = any (v_nodes) or (node_id is null and space_id = any (v_spaces)))),
      'public.wave_assets', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.wave_assets t where project_id = any (v_nodes)),
      'public.wave_screen_versions', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.wave_screen_versions t where screen_id = any (v_nodes)),
      'public.wave_waivers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.wave_waivers t where flow_id = any (v_nodes)),
      'public.wave_flow_approvals', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.wave_flow_approvals t where flow_id = any (v_nodes)),
      'public.wave_flow_screens', v_flow_screens,
      'public.wave_prototype_links', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.wave_prototype_links t where flow_id = any (v_nodes)),
      'public.wave_test_runs', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from public.wave_test_runs t where flow_id = any (v_nodes))
    ),
    'keys', (select coalesce(jsonb_agg(distinct k), '[]') from (
      select artifact_key k from public.nodes where id = any (v_nodes) and artifact_key is not null
      union select snapshot_key from public.wave_screen_versions where screen_id = any (v_nodes) and snapshot_key is not null
      union select 'assets/' || project_id || '/' || hash || '.' || ext from public.wave_assets where project_id = any (v_nodes)
    ) x)
  );
end;
$$;

revoke all on function public.wave_export(text[], uuid[]) from public, anon, authenticated;
grant execute on function public.wave_export(text[], uuid[]) to service_role;
