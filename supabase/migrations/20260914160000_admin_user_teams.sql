-- Which teams somebody is on, asked from the People screen.
--
-- Teams belong to the company and are administered from one place, so the
-- question "who is on this team" had an answer and "which teams is this person
-- on" did not. Adding somebody to a team from the list of people is the way it
-- actually gets done — you are looking at the person, not at the team — and
-- doing it blind, without seeing what they are already on, is how somebody ends
-- up on a team twice or on the wrong one.
--
-- Administrators only, like everything else that reads across accounts. It
-- reports membership and nothing about what any team can reach: what a team
-- reaches is shown to the people on it, and an administrator is not one of them
-- by virtue of the title.
create or replace function public.admin_user_teams(p_user_id uuid)
returns table (team_id uuid, team_name text, role text, added_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select t.id, t.name, tm.role::text, tm.added_at
  from public.team_members tm
  join public.teams t on t.id = tm.team_id
  where tm.user_id = p_user_id
    and public.is_platform_admin()
  order by t.name;
$$;

revoke all on function public.admin_user_teams(uuid) from public, anon;
grant execute on function public.admin_user_teams(uuid)
  to authenticated, service_role;
