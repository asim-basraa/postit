-- Authorization test suite.
--
-- These are the security tests of the product. Every access decision in Postit
-- is made by effective_role and its can_read / can_edit / can_admin wrappers,
-- so this file is where that decision is held to account.
--
-- Run with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/authorization.sql
--
-- Everything happens inside a transaction that is rolled back, so the suite
-- leaves no trace and can be run against any environment safely.

begin;

-- Assertion helper. Raises on the first mismatch, naming the case, so a
-- failure in CI points straight at the rule that broke.
create function pg_temp.check(
  p_case text,
  p_actual text,
  p_expected text
) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FAIL: % (expected %, got %)',
      p_case, p_expected, coalesce(p_actual, 'null');
  end if;
  raise notice 'pass: %', p_case;
end;
$$;

-- Fixtures -------------------------------------------------------------------
--
--   owner   owns the space
--   alice   granted directly on one deep file
--   bob     member of the engineers team
--   carol   no relationship to anything
--
--   projects/                 (folder)
--     deep/                   (folder)
--       note                  (file)
--   private                   (file, nothing granted on it)

insert into auth.users (id, instance_id, aud, role, email) values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','owner@test.local'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','alice@test.local'),
  ('33333333-3333-3333-3333-333333333333','00000000-0000-0000-0000-000000000000','authenticated','authenticated','bob@test.local'),
  ('44444444-4444-4444-4444-444444444444','00000000-0000-0000-0000-000000000000','authenticated','authenticated','carol@test.local');

-- No explicit profiles insert: the handle_new_user trigger on auth.users
-- creates them. Letting it do so keeps the fixture faithful to how real
-- accounts come into being, and quietly asserts that the trigger works.
select pg_temp.check('signing up provisions a profile',
  (select count(*)::text from public.profiles
   where email like '%@test.local'), '4');

insert into public.spaces (id, slug, name, owner_id) values
  ('a0000000-0000-0000-0000-000000000001','authz-test','Authz Test',
   '11111111-1111-1111-1111-111111111111');

insert into public.nodes (id, space_id, parent_id, kind, name) values
  ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001', null, 'folder','Projects'),
  ('b0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','folder','Deep');
insert into public.nodes (id, space_id, parent_id, kind, name, content) values
  ('b0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','file','Note','# note'),
  ('b0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001', null, 'file','Private','# private');

-- A team belongs to no space: it is a group of people in this company.
insert into public.teams (id, name) values
  ('c0000000-0000-0000-0000-000000000001','Engineers');
insert into public.team_members (team_id, user_id) values
  ('c0000000-0000-0000-0000-000000000001','33333333-3333-3333-3333-333333333333');

-- Alice: viewer on the deep file only.
insert into public.grants (node_id, grantee_type, grantee_id, role) values
  ('b0000000-0000-0000-0000-000000000003','user','22222222-2222-2222-2222-222222222222','viewer');
-- Engineers: editor on the top folder, so bob inherits through two levels.
insert into public.grants (node_id, grantee_type, grantee_id, role) values
  ('b0000000-0000-0000-0000-000000000001','team','c0000000-0000-0000-0000-000000000001','editor');

-- Owner bypass ---------------------------------------------------------------

select pg_temp.check('owner reads a deep file',
  public.can_read('11111111-1111-1111-1111-111111111111','b0000000-0000-0000-0000-000000000003')::text, 'true');
select pg_temp.check('owner holds admin without any grant',
  public.effective_role('11111111-1111-1111-1111-111111111111','b0000000-0000-0000-0000-000000000003')::text, 'admin');
select pg_temp.check('owner reads a node nobody was granted',
  public.can_read('11111111-1111-1111-1111-111111111111','b0000000-0000-0000-0000-000000000004')::text, 'true');

-- Direct grants --------------------------------------------------------------

select pg_temp.check('direct grant on a file grants read',
  public.can_read('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000003')::text, 'true');
select pg_temp.check('direct grant resolves to its own role',
  public.effective_role('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000003')::text, 'viewer');
select pg_temp.check('viewer cannot edit',
  public.can_edit('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('viewer cannot admin',
  public.can_admin('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000003')::text, 'false');

-- A grant reaches down, never up. This is the rule that stops a single shared
-- file from exposing the folder it happens to live in.
select pg_temp.check('grant on a file does not expose its parent',
  public.can_read('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000002')::text, 'false');
select pg_temp.check('grant on a file does not expose its grandparent',
  public.can_read('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000001')::text, 'false');
select pg_temp.check('grant on a file does not expose a sibling branch',
  public.can_read('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000004')::text, 'false');

-- Inheritance through teams --------------------------------------------------

select pg_temp.check('team grant inherits two levels down',
  public.can_read('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000003')::text, 'true');
select pg_temp.check('inherited role carries its strength',
  public.effective_role('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000003')::text, 'editor');
select pg_temp.check('team editor can edit a descendant',
  public.can_edit('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000003')::text, 'true');
select pg_temp.check('editor is still not an admin',
  public.can_admin('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('team grant does not reach outside its subtree',
  public.can_read('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000004')::text, 'false');

-- Strangers and anonymous ----------------------------------------------------

select pg_temp.check('a stranger reads nothing',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('a stranger has no role at all',
  coalesce(public.effective_role('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000003')::text,'null'), 'null');
select pg_temp.check('anonymous reads nothing without a public grant',
  public.can_read(null,'b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('a nonexistent node is denied, not errored',
  public.can_read('11111111-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999999')::text, 'false');

-- Max wins across overlapping grants ----------------------------------------

-- Alice joins the team, so she now holds viewer directly and editor through
-- the team. The stronger role must win, not the more specific one.
insert into public.team_members (team_id, user_id) values
  ('c0000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222');

select pg_temp.check('union of user and team grants takes the maximum',
  public.effective_role('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000003')::text, 'editor');
select pg_temp.check('the stronger role brings its capability',
  public.can_edit('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000003')::text, 'true');

-- Public grants --------------------------------------------------------------

insert into public.grants (node_id, grantee_type, grantee_id, role) values
  ('b0000000-0000-0000-0000-000000000004','public',null,'viewer');

select pg_temp.check('a public grant admits anonymous readers',
  public.can_read(null,'b0000000-0000-0000-0000-000000000004')::text, 'true');
select pg_temp.check('a public grant admits signed-in strangers',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000004')::text, 'true');
select pg_temp.check('a public grant confers no write access',
  public.can_edit(null,'b0000000-0000-0000-0000-000000000004')::text, 'false');
select pg_temp.check('a public grant on one file does not leak others',
  public.can_read(null,'b0000000-0000-0000-0000-000000000003')::text, 'false');

-- Revocation -----------------------------------------------------------------

delete from public.team_members
 where team_id = 'c0000000-0000-0000-0000-000000000001'
   and user_id = '22222222-2222-2222-2222-222222222222';
delete from public.grants
 where node_id = 'b0000000-0000-0000-0000-000000000003'
   and grantee_type = 'user';

select pg_temp.check('revoking every route removes access',
  public.can_read('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('revoking one user leaves others untouched',
  public.can_read('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000003')::text, 'true');

delete from public.grants
 where node_id = 'b0000000-0000-0000-0000-000000000004' and grantee_type = 'public';

select pg_temp.check('revoking a public grant re-hides the node',
  public.can_read(null,'b0000000-0000-0000-0000-000000000004')::text, 'false');

-- Sign-up gating -------------------------------------------------------------

insert into public.invitations (email, expires_at) values
  ('guest@outside.test', now() + interval '7 days'),
  ('stale@outside.test', now() - interval '1 day');

select pg_temp.check('an allowed domain may sign up',
  public.hook_restrict_signup_by_email_domain('{"user":{"email":"someone@maqsoodlabs.com"}}'::jsonb)::text, '{}');
select pg_temp.check('domain matching ignores case',
  public.hook_restrict_signup_by_email_domain('{"user":{"email":"Someone@MaqsoodLabs.com"}}'::jsonb)::text, '{}');
select pg_temp.check('an outside domain is refused',
  (public.hook_restrict_signup_by_email_domain('{"user":{"email":"someone@gmail.com"}}'::jsonb) -> 'error' ->> 'http_code'), '403');
select pg_temp.check('a live invitation overrides the domain rule',
  public.hook_restrict_signup_by_email_domain('{"user":{"email":"guest@outside.test"}}'::jsonb)::text, '{}');
select pg_temp.check('an expired invitation does not',
  (public.hook_restrict_signup_by_email_domain('{"user":{"email":"stale@outside.test"}}'::jsonb) -> 'error' ->> 'http_code'), '403');
select pg_temp.check('a missing address is refused',
  (public.hook_restrict_signup_by_email_domain('{"user":{}}'::jsonb) -> 'error' ->> 'http_code'), '400');

-- Three-valued logic ---------------------------------------------------------
--
-- Regression tests for a real vulnerability. effective_role returns NULL for a
-- user with no role, and `NULL = 'admin'` is NULL, not false. can_admin
-- therefore answered NULL, and a guard written `if not can_admin(...) then
-- raise` never fired, because `not NULL` is NULL and IF only branches on true.
-- grant_to_email fell straight through its own authorization check.
--
-- RLS hid this completely: a policy expression that is not true denies the
-- row, so NULL and false are indistinguishable there. These assertions check
-- the exact value, not merely its truthiness, because that difference is the
-- whole bug.

select pg_temp.check('can_read answers false, never null, for a stranger',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('can_edit answers false, never null, for a stranger',
  public.can_edit('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('can_admin answers false, never null, for a stranger',
  public.can_admin('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('negation of a stranger check is usable in a guard',
  (not public.can_admin('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000003'))::text, 'true');
select pg_temp.check('can_admin answers false for a viewer, never null',
  public.can_admin('22222222-2222-2222-2222-222222222222','b0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('predicates answer false for a node that does not exist',
  public.can_admin('11111111-1111-1111-1111-111111111111','99999999-9999-9999-9999-999999999999')::text, 'false');

-- Sharing --------------------------------------------------------------------

set local role authenticated;

-- A stranger must not be able to share, and must not learn anything about
-- which addresses have accounts by trying.
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.grant_to_email(
      'b0000000-0000-0000-0000-000000000001','alice@test.local','admin');
    raise exception 'FAIL: a stranger was allowed to share a node';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

-- The owner can share, and re-sharing changes the role rather than failing.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('owner shares by email',
  (public.grant_to_email('b0000000-0000-0000-0000-000000000004','carol@test.local','viewer')).role::text,
  'viewer');
select pg_temp.check('sharing again changes the role',
  (public.grant_to_email('b0000000-0000-0000-0000-000000000004','carol@test.local','editor')).role::text,
  'editor');

reset role;

select pg_temp.check('the shared node is now readable by its grantee',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000004')::text, 'true');
select pg_temp.check('sharing one node does not expose the rest',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000003')::text, 'false');

-- Hand the fixture back as the next section expects to find it: carol is a
-- stranger again, which is what the RLS checks below assert against.
delete from public.grants
 where node_id = 'b0000000-0000-0000-0000-000000000004'
   and grantee_id = '44444444-4444-4444-4444-444444444444';

select pg_temp.check('revoking a shared grant removes access again',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000004')::text, 'false');

-- RLS enforcement ------------------------------------------------------------
--
-- The predicates being correct is necessary but not sufficient: the policies
-- have to actually use them. These check the database refuses to hand over
-- rows even when the application asks for everything.

insert into public.grants (node_id, grantee_type, grantee_id, role) values
  ('b0000000-0000-0000-0000-000000000003','user','22222222-2222-2222-2222-222222222222','viewer');

set local role authenticated;

-- Counted within the space under test rather than across the database.
-- Everybody now owns a space of their own from the moment they have an
-- account, so a bare count of every row somebody can see includes their own
-- front page, which is true and is not what these are asking.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('RLS shows a grantee only what they were granted',
  (select count(*)::text from public.nodes
    where space_id = 'a0000000-0000-0000-0000-000000000001'), '1');
select pg_temp.check('RLS hides grant rows from a non-admin',
  (select count(*)::text from public.grants), '0');

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('RLS shows a stranger nothing',
  (select count(*)::text from public.nodes
    where space_id = 'a0000000-0000-0000-0000-000000000001'), '0');
select pg_temp.check('RLS hides the space itself from a stranger',
  (select count(*)::text from public.spaces
    where id = 'a0000000-0000-0000-0000-000000000001'), '0');

-- And the new rule, which is what the counts above had to be narrowed for.
select pg_temp.check('everybody has a space of their own',
  (select count(*)::text from public.spaces where is_personal), '1');
select pg_temp.check('and it is the one that is theirs',
  (select owner_id::text from public.spaces where is_personal),
  '44444444-4444-4444-4444-444444444444');
select pg_temp.check('with a front page in it and nothing else',
  (select count(*)::text from public.nodes n
    join public.spaces s on s.id = n.space_id where s.is_personal), '1');

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('RLS shows the owner everything in their space',
  (select count(*)::text from public.nodes
    where space_id = 'a0000000-0000-0000-0000-000000000001'), '4');

reset role;

set local role anon;
select set_config('request.jwt.claims','', true);
select pg_temp.check('RLS shows an anonymous visitor no nodes',
  (select count(*)::text from public.nodes), '0');
select pg_temp.check('RLS shows an anonymous visitor no profiles',
  (select count(*)::text from public.profiles), '0');
reset role;

-- Teams ----------------------------------------------------------------------
--
-- A team is a named group of people in this company and belongs to no space.
-- Administering one — making it, editing its roster, deleting it — is the
-- platform administrator's alone. Everybody signed in may read any roster and
-- hand their own pages to any team.
--
-- Membership is still the one route to a node whose meaning changes after the
-- grant is made: a folder is shared once, and who that reaches depends on a
-- roster edited later. So what these check is that editing a roster is guarded
-- at least as tightly as making the grant, and that opening the rosters up did
-- not open anything else up with them.

-- A second team, which nobody is on.
insert into public.teams (id, name) values
  ('c0000000-0000-0000-0000-000000000002','Outsiders');

select pg_temp.check('can_grant_to_team answers false, never null, for a team that does not exist',
  public.can_grant_to_team('c0000000-0000-0000-0000-000000000009')::text, 'false');

set local role authenticated;

-- Owning a space used to be how you administered a team. It is not any more,
-- and the refusal must not say whether the team or the address exists.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('owning a space does not administer the company''s teams',
  public.is_platform_admin()::text, 'false');
do $$
begin
  begin
    perform public.add_team_member(
      'c0000000-0000-0000-0000-000000000001','carol@test.local','member');
    raise exception 'FAIL: a space owner was allowed to edit a roster';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

-- Reading one, though, is everybody's. That is what makes handing a document to
-- a group defensible: you can see the group first. Engineers has bob on it.
select pg_temp.check('but anybody signed in reads the roster',
  (select count(*)::text from public.team_roster('c0000000-0000-0000-0000-000000000001')), '1');
select pg_temp.check('including of a team they have nothing to do with',
  (select count(*)::text from public.team_roster('c0000000-0000-0000-0000-000000000002')), '0');

reset role;

-- Carol administers the platform for the rest of this section, and stops at the
-- end of it: a later section asserts that nobody does to begin with, and that
-- is a premise worth leaving intact. She owns no space and is on no team, which
-- is the point — administering teams is now its own power.
update public.profiles set is_admin = true
 where id = '44444444-4444-4444-4444-444444444444';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select pg_temp.check('an administrator adds a member by email',
  (public.add_team_member('c0000000-0000-0000-0000-000000000001','owner@test.local','member')).user_id::text,
  '11111111-1111-1111-1111-111111111111');
select pg_temp.check('adding again changes the team role rather than failing',
  (public.add_team_member('c0000000-0000-0000-0000-000000000001','owner@test.local','manager')).role::text,
  'manager');
select pg_temp.check('the roster holds both',
  (select count(*)::text from public.team_roster('c0000000-0000-0000-0000-000000000001')), '2');

-- Making a team no longer puts you on it. It used to, when the maker was
-- necessarily the owner of the space and so plainly one of the group. An
-- administrator making a team for other people is not, and adding them
-- silently would hand every administrator everything ever shared with it.
insert into public.teams (id, name) values
  ('c0000000-0000-0000-0000-000000000003','Nobody''s');
select pg_temp.check('making a team does not put the maker on it',
  (select count(*)::text from public.team_roster('c0000000-0000-0000-0000-000000000003')), '0');

-- A name is the company's, so it can only mean one group.
do $$
begin
  begin
    insert into public.teams (name) values ('engineers');
    raise exception 'FAIL: two teams were allowed to share a name';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

-- Sharing with any team ---------------------------------------------------------
--
-- The old rule was "a team you can see", meaning one whose space you own or one
-- you are on, because only those two could read its roster. Everybody can read
-- every roster now, so the rule it was standing in for holds everywhere and the
-- restriction goes. What must not widen with it is what a share *reaches*: the
-- people on the team, and nobody else. Not whoever administers it, not the
-- person who made it.

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select pg_temp.check('a team you are not on and do not administer is grantable',
  public.can_grant_to_team('c0000000-0000-0000-0000-000000000002')::text, 'true');
select pg_temp.check('and the picker offers every team',
  (select count(*)::text from public.grantable_teams('b0000000-0000-0000-0000-000000000004')),
  '3');
select pg_temp.check('with the size of the group, which is what you are choosing by',
  (select member_count::text from public.grantable_teams('b0000000-0000-0000-0000-000000000004')
    where team_id = 'c0000000-0000-0000-0000-000000000001'),
  '2');

select pg_temp.check('a page can be shared with a team the sharer is not on',
  (public.grant_to_team(
     'b0000000-0000-0000-0000-000000000004',
     'c0000000-0000-0000-0000-000000000002',
     'viewer')).role::text,
  'viewer');

-- Refused on integrity grounds rather than visibility: grantee_id is
-- polymorphic and carries no foreign key, so nothing else would catch this.
do $$
begin
  begin
    perform public.grant_to_team(
      'b0000000-0000-0000-0000-000000000004', gen_random_uuid(), 'viewer');
    raise exception 'FAIL: a grant was written naming a team that does not exist';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

reset role;

-- Nobody is on Outsiders, so the share reaches nobody at all. Not carol, who
-- administers every team, and not the owner, who made the share.
select pg_temp.check('sharing with a team nobody is on reaches nobody',
  public.can_read('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000004')::text,
  'false');
select pg_temp.check('administering every team is not being on one',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000004')::text,
  'false');

-- Put bob on it and the same share reaches him, which is the whole mechanism:
-- the grant is fixed and the roster moves.
insert into public.team_members (team_id, user_id) values
  ('c0000000-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333');
select pg_temp.check('joining the team confers the grant it holds',
  public.can_read('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000004')::text,
  'true');
select pg_temp.check('and no more than the role that grant carried',
  public.can_edit('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000004')::text,
  'false');

-- Bob was already on Engineers, which holds editor two levels up.
select pg_temp.check('a team grant still inherits down the tree',
  public.can_edit('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000003')::text,
  'true');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select public.remove_team_member(
  'c0000000-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333');
reset role;

select pg_temp.check('leaving the team takes the access with it',
  public.can_read('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000004')::text,
  'false');
select pg_temp.check('and leaves what came from elsewhere alone',
  public.can_edit('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000003')::text,
  'true');

-- Deleting a team removes the access it conferred rather than leaving a grant
-- pointing at nothing.
insert into public.team_members (team_id, user_id) values
  ('c0000000-0000-0000-0000-000000000002','33333333-3333-3333-3333-333333333333');
select pg_temp.check('rejoining restores it',
  public.can_read('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000004')::text,
  'true');

delete from public.teams where id = 'c0000000-0000-0000-0000-000000000002';

select pg_temp.check('deleting the team removes the grant it carried',
  public.can_read('33333333-3333-3333-3333-333333333333','b0000000-0000-0000-0000-000000000004')::text,
  'false');
select pg_temp.check('and the grant row is gone, not orphaned',
  (select count(*)::text from public.grants where grantee_type = 'team'
     and grantee_id = 'c0000000-0000-0000-0000-000000000002'), '0');
select pg_temp.check('while the grant naming a different team stands',
  (select count(*)::text from public.grants where grantee_type = 'team'
     and grantee_id = 'c0000000-0000-0000-0000-000000000001'), '1');

-- Torn down so the rest of the file sees the access it expects. Several later
-- sections assert that no team grant is standing anywhere, which is a useful
-- thing for them to be able to assume and a fixture of this one's is not a good
-- reason to take it away. Nobody administers the platform again either: a later
-- section asserts that nobody does to begin with.
delete from public.teams where id = 'c0000000-0000-0000-0000-000000000003';
delete from public.teams where id = 'c0000000-0000-0000-0000-000000000001';
update public.profiles set is_admin = false
 where id = '44444444-4444-4444-4444-444444444444';

select pg_temp.check('and the fixture leaves no team grant behind',
  (select count(*)::text from public.grants where grantee_type = 'team'), '0');

-- Publishing -----------------------------------------------------------------
--
-- A public grant is the one grant with no grantee to revoke, so what it can
-- say matters more than usual: viewer, never anything stronger, on any path
-- that writes the row.

insert into public.nodes (id, space_id, parent_id, kind, name, content) values
  ('b0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','file','Published','# published');

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_public('b0000000-0000-0000-0000-000000000001', true);
    raise exception 'FAIL: a stranger published somebody else''s node';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_public('b0000000-0000-0000-0000-000000000001', true);
-- Idempotent: publishing an already-published node is not an error and does
-- not accumulate grants.
select public.set_public('b0000000-0000-0000-0000-000000000001', true);

reset role;

select pg_temp.check('publishing twice leaves one grant',
  (select count(*)::text from public.grants
   where grantee_type = 'public'
     and node_id = 'b0000000-0000-0000-0000-000000000001'), '1');
select pg_temp.check('an anonymous visitor can read a published folder',
  public.can_read(null,'b0000000-0000-0000-0000-000000000001')::text, 'true');
select pg_temp.check('publishing a folder publishes what is under it',
  public.can_read(null,'b0000000-0000-0000-0000-000000000005')::text, 'true');
select pg_temp.check('a node outside the published subtree stays hidden',
  public.can_read(null,'b0000000-0000-0000-0000-000000000004')::text, 'false');
select pg_temp.check('publishing confers no write access',
  public.can_edit(null,'b0000000-0000-0000-0000-000000000005')::text, 'false');

-- A public grant stronger than viewer would mean anyone on the internet can
-- change or reshare the page. Refused at the table, not merely in the helper.
do $$
begin
  begin
    insert into public.grants (node_id, grantee_type, grantee_id, role)
    values ('b0000000-0000-0000-0000-000000000004','public',null,'editor');
    raise exception 'FAIL: a public grant conferred editor';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

set local role anon;
select set_config('request.jwt.claims','', true);
-- Projects, Deep, Note and Published: the whole subtree under the published
-- folder. Private, which sits outside it, is not among them.
select pg_temp.check('RLS hands an anonymous visitor the published subtree and nothing else',
  (select count(*)::text from public.nodes), '4');
select pg_temp.check('and the space that contains it, so the page can render',
  (select count(*)::text from public.spaces), '1');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_public('b0000000-0000-0000-0000-000000000001', false);
reset role;

select pg_temp.check('unpublishing hides it again',
  public.can_read(null,'b0000000-0000-0000-0000-000000000005')::text, 'false');

-- Policy recursion -----------------------------------------------------------
--
-- Regression tests for a real outage. The policy on `teams` asked whether you
-- were a member, which read `team_members`, whose policy asked which space the
-- team belonged to, which read `teams` again. Postgres refuses a query with a
-- policy cycle outright (42P17), so team management failed completely the
-- moment anything selected the table as an ordinary user.
--
-- It hid for as long as it did because `teams` was only ever read from inside
-- effective_role, which is SECURITY DEFINER and applies no policies at all.
--
-- These assertions do not check a value so much as that the queries run: any
-- of them raising is the cycle back.

insert into public.teams (id, name) values
  ('c0000000-0000-0000-0000-00000000000a','Recursion Check');

-- An administrator for this section, put back at the end of it.
update public.profiles set is_admin = true
 where id = '44444444-4444-4444-4444-444444444444';

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('an administrator reads back a team without recursing',
  (select name from public.teams where id = 'c0000000-0000-0000-0000-00000000000a'),
  'Recursion Check');
select pg_temp.check('and adds a member',
  (public.add_team_member('c0000000-0000-0000-0000-00000000000a','bob@test.local','member')).role::text,
  'member');

select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select pg_temp.check('a member can see the team they are on',
  (select count(*)::text from public.teams
   where id = 'c0000000-0000-0000-0000-00000000000a'), '1');
select pg_temp.check('and the memberships of it',
  (select count(*)::text from public.team_members
   where team_id = 'c0000000-0000-0000-0000-00000000000a'), '1');
select pg_temp.check('a member reads the roster of a team they are on',
  (select count(*)::text from public.team_roster('c0000000-0000-0000-0000-00000000000a')), '1');

-- Alice owns nothing and is on nothing, and the directory is hers to read all
-- the same. That is the trade membership was widened on: a roster is a list of
-- colleagues, and being able to read one before handing it a document is what
-- makes sharing with a group something other than a leap. What stays shut is
-- what a team *reaches*, which is a list of documents.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('somebody on no team still sees the company''s teams',
  (select count(*)::text from public.teams), '1');
select pg_temp.check('and who is on them',
  (select count(*)::text from public.team_roster('c0000000-0000-0000-0000-00000000000a')), '1');
select pg_temp.check('but not what a team they are not on reaches',
  (select count(*)::text from public.team_reach('c0000000-0000-0000-0000-00000000000a')), '0');
select pg_temp.check('and cannot administer one',
  public.is_platform_admin()::text, 'false');

reset role;
update public.profiles set is_admin = false
 where id = '44444444-4444-4444-4444-444444444444';

-- What a team reaches ---------------------------------------------------------
--
-- The other half of the same gap. A member could be handed a folder through a
-- team and had no way to learn that was why, because the list of what a team
-- reaches was the owner's alone. Now both get the same answer, from the same
-- function, so the two can never disagree.
--
-- On its own fixture, torn down at the end of the section: the assertions below
-- turn on a team holding a grant, and every team grant made earlier in this file
-- has already been revoked on purpose.

insert into public.teams (id, name) values
  ('c0000000-0000-0000-0000-00000000000b','Reach Check');
insert into public.team_members (team_id, user_id) values
  ('c0000000-0000-0000-0000-00000000000b','33333333-3333-3333-3333-333333333333');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select pg_temp.check('a member sees every team they are on',
  (select count(*)::text from public.my_teams()), '2');

-- The state QA found, and the one worth being explicit about: a team can be
-- real, have people on it, and grant nothing. That is not a fault.
select pg_temp.check('a team nothing has been shared with reaches nothing',
  (select reach_count::text from public.my_teams() where team_name = 'Reach Check'), '0');
-- One: bob. Making a team no longer puts its maker on it.
select pg_temp.check('and says how many people are on it regardless',
  (select member_count::text from public.my_teams() where team_name = 'Reach Check'), '1');

-- Now share something with it, as the owner of the space the page is in.
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.grant_to_team(
  'b0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-00000000000b','viewer');

-- Sharing with a team does not make its whole reach yours to read. The sharer
-- can see the grant they made, on their own page, through the sharing dialog;
-- what this answers is the different question of everything that team holds
-- everywhere, which belongs to the people on it.
select pg_temp.check('making the share does not show what else the team holds',
  (select count(*)::text from public.team_reach('c0000000-0000-0000-0000-00000000000b')), '0');

select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);

select pg_temp.check('the member sees it',
  (select label from public.team_reach('c0000000-0000-0000-0000-00000000000b')), 'Projects');
select pg_temp.check('with the role it carries',
  (select role::text from public.team_reach('c0000000-0000-0000-0000-00000000000b')), 'viewer');
select pg_temp.check('and a link that goes somewhere',
  (select href from public.team_reach('c0000000-0000-0000-0000-00000000000b')),
  '/s/authz-test/projects');
select pg_temp.check('the count on the team agrees',
  (select reach_count::text from public.my_teams() where team_name = 'Reach Check'), '1');
select pg_temp.check('and one round trip answers it for all their teams',
  (select count(*)::text from public.my_team_reach()), '1');

-- Seeing is not administering. Reading the roster of a team confers nothing on
-- the team itself, which is the whole reason this was safe to widen.
do $$
begin
  begin
    perform public.add_team_member(
      'c0000000-0000-0000-0000-00000000000b','carol@test.local','member');
    raise exception 'FAIL: a member was allowed to add to their own team';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;
-- Still one, so the attempt above changed nothing.
select pg_temp.check('a member cannot add anybody to their own team',
  (select count(*)::text from public.team_roster('c0000000-0000-0000-0000-00000000000b')), '1');

-- Alice is on neither team and owns nothing.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('somebody on no team is told about no team',
  (select count(*)::text from public.my_teams()), '0');
select pg_temp.check('and learns nothing of what other teams reach',
  (select count(*)::text from public.my_team_reach()), '0');
select pg_temp.check('nor is the list of every team hers to read',
  (select count(*)::text from public.all_teams()), '0');

reset role;

-- Torn down so the rest of the file sees the access it expects: deleting the
-- team takes its grant with it, which the section above already proves.
delete from public.teams where id = 'c0000000-0000-0000-0000-00000000000b';

select pg_temp.check('and the fixture leaves no team grant behind',
  (select count(*)::text from public.grants where grantee_type = 'team'), '0');

-- Moving a node --------------------------------------------------------------
--
-- move_node is SECURITY INVOKER, so a viewer does not trip a check inside it:
-- they trip RLS on the UPDATE, which changes nothing and raises nothing. The
-- node stays where it is, which is the part that matters, and the function hands
-- back a row of nulls, which is how the caller is supposed to tell. The endpoint
-- used to ignore that and answer 200 with the unmoved node.

set local role authenticated;

-- Alice holds viewer on the deep file and nothing else by now.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select pg_temp.check('a viewer moving a node changes nothing and says so',
  (public.move_node('b0000000-0000-0000-0000-000000000003', null, null, true)).id::text,
  null);

reset role;

select pg_temp.check('and the node is exactly where it was',
  (select path from public.nodes where id = 'b0000000-0000-0000-0000-000000000003'),
  'projects/deep/note');

-- The owner may, and everything beneath comes with it.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select pg_temp.check('the owner moves a folder to the top level',
  (public.move_node('b0000000-0000-0000-0000-000000000002', null, null, true)).path,
  'deep');

select pg_temp.check('and its descendants follow, with new addresses',
  (select path from public.nodes where id = 'b0000000-0000-0000-0000-000000000003'),
  'deep/note');

-- A folder cannot become its own ancestor: without this the subtree is orphaned
-- from the root and unreachable by anybody, owner included.
do $$
begin
  begin
    perform public.move_node(
      'b0000000-0000-0000-0000-000000000002',
      'b0000000-0000-0000-0000-000000000003', null, true);
    raise exception 'FAIL: a folder was moved inside its own subtree';
  exception when sqlstate 'P0001' then
    if sqlerrm like 'FAIL:%' then raise; end if;  -- refused, as it must be
  end;
end $$;

-- Put it back, so the sections below find the tree they expect.
select public.move_node('b0000000-0000-0000-0000-000000000002',
  'b0000000-0000-0000-0000-000000000001', null, true);
reset role;

select pg_temp.check('and moving it back restores every address',
  (select path from public.nodes where id = 'b0000000-0000-0000-0000-000000000003'),
  'projects/deep/note');

-- Notes and replies -----------------------------------------------------------
--
-- A conversation started from the front page belongs to exactly two people: the
-- inbox owner and whoever sent it. Anybody else, signed in or not, gets the same
-- nothing they would get for a conversation that does not exist.
--
-- The anonymous case is the one worth being explicit about. A note sent without
-- an account has one participant, so it can be read by the owner and answered by
-- nobody, and the refusal is deliberate rather than an oversight: a reply there
-- would be a message its recipient could never read.
--
-- The owner here is whoever owns the space with slug 'postit'. This suite's
-- space is not that, so inbox_owner() is null for these fixtures, which makes
-- every assertion below about the sender's side alone. That is the side with the
-- privacy rule on it.

set local role service_role;
select public.send_note('A joke from alice', '22222222-2222-2222-2222-222222222222');
select public.send_note('A joke from bob', '33333333-3333-3333-3333-333333333333');
select public.send_note('A joke from nobody', null);
reset role;

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select pg_temp.check('a sender sees the conversation they started',
  (select count(*)::text from public.note_threads()), '1');
select pg_temp.check('and reads what they said in it',
  (select body from public.note_conversation(
     (select note_id from public.note_threads()))), 'A joke from alice');
select pg_temp.check('and never somebody else''s, through the table itself',
  (select count(*)::text from public.notes), '1');
select pg_temp.check('nor anybody else''s words',
  (select count(*)::text from public.note_messages), '1');

-- Bob's conversation, named directly. Knowing the id is not being in it.
select pg_temp.check('naming another conversation reveals nothing',
  (select count(*)::text from public.note_conversation(
     (select id from public.notes where sender_id = '33333333-3333-3333-3333-333333333333'))),
  '0');

do $$
declare v_other uuid;
begin
  select id into v_other from public.notes
   where sender_id = '33333333-3333-3333-3333-333333333333';
  begin
    perform public.reply_to_note(v_other, 'Butting in');
    raise exception 'FAIL: a stranger replied to somebody else''s conversation';
  exception when sqlstate 'P0002' then null;  -- refused as not-found, as it must be
       when sqlstate 'P0001' then
         if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- Replying to your own is the whole point, and it must still work.
select pg_temp.check('but a sender may answer their own',
  (public.reply_to_note(
     (select note_id from public.note_threads()), 'And another thing') is not null)::text,
  'true');
select pg_temp.check('and the conversation grows by exactly that',
  (select count(*)::text from public.note_conversation(
     (select note_id from public.note_threads()))), '2');

-- An anonymous conversation has nobody in it but the owner, so a sender who is
-- not the owner cannot reach it at all.
select pg_temp.check('an anonymous note belongs to no sender',
  (select count(*)::text from public.note_conversation(
     (select id from public.notes where sender_id is null))), '0');

-- Somebody who has sent nothing is in no conversation.
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('somebody who sent nothing has no conversations',
  (select count(*)::text from public.note_threads()), '0');
select pg_temp.check('and sees no notes at all',
  (select count(*)::text from public.notes), '0');

-- Writing straight at the table, around the function that carries the rules.
do $$
begin
  begin
    insert into public.note_messages (note_id, author_id, body)
    values ((select id from public.notes limit 1),
            '44444444-4444-4444-4444-444444444444', 'Straight in');
    raise exception 'FAIL: a message was inserted around reply_to_note';
  exception when sqlstate '42501' then null;  -- no insert policy exists, as intended
       when sqlstate 'P0001' then
         if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

-- Deleting. Only the inbox owner may, and it takes both sides with it: hiding a
-- conversation from one party while the other goes on writing into it produces
-- messages nobody reads and nobody is told about.
--
-- These fixtures have no inbox owner, since this suite's space is not the one
-- notes are sent to, so what they establish is the refusal: alice sent one of
-- these and still cannot delete it.
do $$
begin
  begin
    perform public.delete_note((select id from public.notes limit 1));
    raise exception 'FAIL: somebody who is not the inbox owner deleted a note';
  exception when sqlstate 'P0002' then null;  -- refused as not-found, as it must be
       when sqlstate 'P0001' then
         if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.delete_note(
      (select id from public.notes where sender_id = '22222222-2222-2222-2222-222222222222'));
    raise exception 'FAIL: a sender deleted their own note from somebody else''s inbox';
  exception when sqlstate 'P0002' then null;  -- a note you sent is not yours to retract
       when sqlstate 'P0001' then
         if sqlerrm like 'FAIL:%' then raise; end if;
  end;
end $$;

reset role;

select pg_temp.check('and nothing was written by anybody who was refused',
  (select count(*)::text from public.note_messages where body = 'Butting in'), '0');
select pg_temp.check('and nothing was deleted by anybody who was refused',
  (select count(*)::text from public.notes), '3');

-- Search ---------------------------------------------------------------------
--
-- Search is the easiest place in a product like this to leak: an index built
-- once and queried by everyone will happily quote a paragraph nobody was meant
-- to read. search_nodes runs as the caller and so is filtered by the same
-- policy that decides whether the page renders at all. These assertions check
-- that, from every side.

insert into public.nodes (id, space_id, parent_id, kind, name, content) values
  ('b0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001', null, 'file','Open Roadmap',
   '# Open Roadmap' || chr(10) || chr(10) || 'The quarterly roadmap mentions kumquats.'),
  ('b0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001', null, 'file','Severance Notes',
   '# Severance Notes' || chr(10) || chr(10) || 'The private roadmap mentions kumquats, and severance.');

insert into public.grants (node_id, grantee_type, grantee_id, role) values
  ('b0000000-0000-0000-0000-000000000006','user','44444444-4444-4444-4444-444444444444','viewer');

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('the owner finds both pages',
  (select count(*)::text from public.search_nodes(
     'a0000000-0000-0000-0000-000000000001','kumquats')), '2');
select pg_temp.check('a name outranks a passing mention in a body',
  (select name from public.search_nodes(
     'a0000000-0000-0000-0000-000000000001','roadmap') limit 1), 'Open Roadmap');

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('a grantee finds only the page they were given',
  (select name from public.search_nodes(
     'a0000000-0000-0000-0000-000000000001','kumquats')), 'Open Roadmap');
-- The word appears only in the restricted page. Finding it, even without a
-- snippet, would confirm that page exists.
select pg_temp.check('a word unique to a restricted page finds nothing at all',
  (select count(*)::text from public.search_nodes(
     'a0000000-0000-0000-0000-000000000001','severance')), '0');

reset role;

set local role anon;
select set_config('request.jwt.claims','', true);
select pg_temp.check('an anonymous search finds nothing that was not published',
  (select count(*)::text from public.search_nodes(
     'a0000000-0000-0000-0000-000000000001','kumquats')), '0');
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_public('b0000000-0000-0000-0000-000000000006', true);
reset role;

set local role anon;
select set_config('request.jwt.claims','', true);
select pg_temp.check('and finds a published page once it is published',
  (select name from public.search_nodes(
     'a0000000-0000-0000-0000-000000000001','kumquats')), 'Open Roadmap');
select pg_temp.check('while the restricted one stays invisible',
  (select count(*)::text from public.search_nodes(
     'a0000000-0000-0000-0000-000000000001','severance')), '0');
reset role;

-- Content types ---------------------------------------------------------------
--
-- A trigger, not a column default, keeps content_type consistent with kind: a
-- default would type folders too, and would not correct a caller who supplies
-- a type for one. Doing it in a trigger is what lets the check constraint be an
-- assertion rather than an error message users see.

insert into public.nodes (id, space_id, parent_id, kind, name, content) values
  ('b0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001', null, 'file','Untyped Page','# untyped');
insert into public.nodes (id, space_id, parent_id, kind, name) values
  ('b0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001', null, 'folder','Untyped Folder');

select pg_temp.check('a new page defaults to article',
  (select content_type::text from public.nodes
   where id = 'b0000000-0000-0000-0000-000000000008'), 'article');
select pg_temp.check('a folder carries no type',
  (select content_type::text from public.nodes
   where id = 'b0000000-0000-0000-0000-000000000009'), null);

-- A type asked for on a folder is discarded rather than rejected: the caller
-- gets a folder, which is what they asked for, and no row exists that the
-- constraint would refuse.
insert into public.nodes (id, space_id, parent_id, kind, name, content_type) values
  ('b0000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-000000000001', null, 'folder','Typed Folder','skill');

select pg_temp.check('a type asked for on a folder is dropped',
  (select content_type::text from public.nodes
   where id = 'b0000000-0000-0000-0000-00000000000a'), null);

update public.nodes set content_type = 'skill'
 where id = 'b0000000-0000-0000-0000-000000000008';
select pg_temp.check('a page can be reclassified',
  (select content_type::text from public.nodes
   where id = 'b0000000-0000-0000-0000-000000000008'), 'skill');

-- Clearing the type on a file is not a way to make an untyped document.
update public.nodes set content_type = null
 where id = 'b0000000-0000-0000-0000-000000000008';
select pg_temp.check('clearing a page''s type puts it back to article',
  (select content_type::text from public.nodes
   where id = 'b0000000-0000-0000-0000-000000000008'), 'article');

select pg_temp.check('filtering by type finds documents, not folders',
  (select count(*)::text from public.nodes
   where space_id = 'a0000000-0000-0000-0000-000000000001'
     and content_type = 'article'
     and kind = 'folder'), '0');

-- MCP tokens ------------------------------------------------------------------
--
-- A token is a long-lived credential on the open internet, so the properties
-- that matter are: only its hash is stored, presenting the hash is not enough,
-- revocation and expiry take effect on the very next request, and nobody can
-- see anybody else's.

insert into public.mcp_tokens (id, user_id, name, token_hash) values
  ('d0000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','Owner laptop',
   encode(extensions.digest('post_owner_secret','sha256'),'hex')),
  ('d0000000-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','Alice laptop',
   encode(extensions.digest('post_alice_secret','sha256'),'hex'));

select pg_temp.check('a live token resolves to its owner',
  (select user_id::text from public.resolve_mcp_token('post_owner_secret')),
  '11111111-1111-1111-1111-111111111111');
select pg_temp.check('using a token records that it was used',
  (select (last_used_at is not null)::text from public.mcp_tokens
   where id = 'd0000000-0000-0000-0000-000000000001'), 'true');
select pg_temp.check('an unknown token resolves to nothing',
  (select count(*)::text from public.resolve_mcp_token('post_not_a_token')), '0');

-- The point of storing hashes. If presenting the stored hash worked, a leaked
-- database would be enough to authenticate and the hashing would buy nothing.
select pg_temp.check('presenting the stored hash is not enough',
  (select count(*)::text from public.resolve_mcp_token(
     encode(extensions.digest('post_owner_secret','sha256'),'hex'))), '0');

update public.mcp_tokens set revoked_at = now()
 where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.check('a revoked token stops working on the next request',
  (select count(*)::text from public.resolve_mcp_token('post_owner_secret')), '0');

update public.mcp_tokens set revoked_at = null, expires_at = now() - interval '1 minute'
 where id = 'd0000000-0000-0000-0000-000000000001';
select pg_temp.check('an expired token stops working too',
  (select count(*)::text from public.resolve_mcp_token('post_owner_secret')), '0');

set local role authenticated;

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('a person sees only their own tokens',
  (select count(*)::text from public.mcp_tokens), '1');
select pg_temp.check('and that one is theirs',
  (select name from public.mcp_tokens), 'Owner laptop');

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('somebody with no tokens cannot tell that anyone has any',
  (select count(*)::text from public.mcp_tokens), '0');

reset role;

-- Comments ---------------------------------------------------------------
--
-- A comment is exactly as reachable as the page it is about, with one
-- narrowing: it also requires an account. Following can_read alone would mean
-- publishing a page publishes its conversation to the internet, in one click
-- and irreversibly once anything has cached it.

-- Said out loud, because a top-level node now records who made it and grants
-- them the run of it. `reset role` does not clear the claims, so a fixture
-- written after somebody else's section would otherwise be created by whoever
-- spoke last, and quietly shared with them.
insert into public.nodes (id, space_id, parent_id, kind, name, content, created_by) values
  ('b0000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-000000000001', null, 'file','Discussed','# discussed',
   '11111111-1111-1111-1111-111111111111');
insert into public.grants (node_id, grantee_type, grantee_id, role) values
  ('b0000000-0000-0000-0000-00000000000b','user','22222222-2222-2222-2222-222222222222','viewer');

set local role authenticated;

-- Reading is enough to comment: a viewer who spots a mistake should be able to
-- say so without being handed the power to edit.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.comments (id, node_id, author_id, body) values
  ('e0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000b',
   '22222222-2222-2222-2222-222222222222','A viewer speaks');
select pg_temp.check('a viewer can comment on a page they can read',
  (select count(*)::text from public.node_comments('b0000000-0000-0000-0000-00000000000b')), '1');

do $$
begin
  begin
    insert into public.comments (node_id, author_id, body)
    values ('b0000000-0000-0000-0000-000000000004','22222222-2222-2222-2222-222222222222','Should not land');
    raise exception 'FAIL: commented on a page they cannot read';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

do $$
begin
  begin
    insert into public.comments (node_id, author_id, body)
    values ('b0000000-0000-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111','Forged');
    raise exception 'FAIL: posted a comment as somebody else';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

-- Threading is one level deep, so a conversation stays followable and the data
-- matches the shape the panel can render.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
insert into public.comments (id, node_id, author_id, parent_id, body) values
  ('e0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-00000000000b',
   '11111111-1111-1111-1111-111111111111','e0000000-0000-0000-0000-000000000001','The owner answers');
do $$
begin
  begin
    insert into public.comments (node_id, author_id, parent_id, body)
    values ('b0000000-0000-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111',
            'e0000000-0000-0000-0000-000000000002','Too deep');
    raise exception 'FAIL: a reply was replied to';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('a stranger sees no conversation',
  (select count(*)::text from public.comments), '0');
select pg_temp.check('and the reading function tells them nothing either',
  (select count(*)::text from public.node_comments('b0000000-0000-0000-0000-00000000000b')), '0');
do $$
begin
  begin
    perform public.delete_comment('e0000000-0000-0000-0000-000000000001');
    raise exception 'FAIL: a stranger deleted somebody''s comment';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

-- An author may withdraw their own words, and withdrawing means the text is
-- gone, not merely flagged.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select public.delete_comment('e0000000-0000-0000-0000-000000000001');
reset role;

select pg_temp.check('a withdrawn comment keeps none of its text',
  (select body from public.comments where id = 'e0000000-0000-0000-0000-000000000001'), '');
select pg_temp.check('and the reply it carried survives',
  (select body from public.comments where id = 'e0000000-0000-0000-0000-000000000002'), 'The owner answers');

-- Moderation: an administrator of the page may remove anybody's.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.delete_comment('e0000000-0000-0000-0000-000000000002');
reset role;

select pg_temp.check('an admin can remove a comment that is not theirs',
  (select (deleted_at is not null)::text from public.comments
   where id = 'e0000000-0000-0000-0000-000000000002'), 'true');

-- Publishing the page must not publish the conversation on it.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_public('b0000000-0000-0000-0000-00000000000b', true);
reset role;

set local role anon;
select set_config('request.jwt.claims','', true);
select pg_temp.check('an anonymous visitor can read the published page',
  (select count(*)::text from public.nodes
   where id = 'b0000000-0000-0000-0000-00000000000b'), '1');
select pg_temp.check('and sees none of its comments',
  (select count(*)::text from public.comments), '0');
reset role;

-- Sharing with everyone ------------------------------------------------------
--
-- The middle of the range: everyone who has an account, which is not the same
-- as the open internet. Its absence is what pushes people towards publishing
-- when all they meant was "the whole company".

insert into public.nodes (id, space_id, parent_id, kind, name) values
  ('b0000000-0000-0000-0000-00000000000c','a0000000-0000-0000-0000-000000000001', null, 'folder','Handbook');
insert into public.nodes (id, space_id, parent_id, kind, name, content) values
  ('b0000000-0000-0000-0000-00000000000d','a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-00000000000c','file','Leave','# leave');

select pg_temp.check('a stranger starts with no access to it',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-00000000000d')::text, 'false');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_shared_with_everyone('b0000000-0000-0000-0000-00000000000c','viewer');
reset role;

select pg_temp.check('everyone with an account can read it',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-00000000000c')::text, 'true');
select pg_temp.check('and everything beneath it',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-00000000000d')::text, 'true');

-- The distinction the whole feature exists for.
select pg_temp.check('an anonymous visitor still sees nothing',
  public.can_read(null,'b0000000-0000-0000-0000-00000000000c')::text, 'false');

select pg_temp.check('reading is not writing',
  public.can_edit('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-00000000000d')::text, 'false');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_shared_with_everyone('b0000000-0000-0000-0000-00000000000c','editor');
reset role;

select pg_temp.check('raising it to editor lets everyone write',
  public.can_edit('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-00000000000d')::text, 'true');
select pg_temp.check('and never administer',
  public.can_admin('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-00000000000d')::text, 'false');

-- Admin for everyone is the power to change who else can see a thing, which is
-- not a decision anybody makes on purpose. Refused at the table.
do $$
begin
  begin
    insert into public.grants (node_id, grantee_type, grantee_id, role)
    values ('b0000000-0000-0000-0000-000000000004','authenticated',null,'admin');
    raise exception 'FAIL: a grant to everyone conferred admin';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

do $$
begin
  begin
    insert into public.grants (node_id, grantee_type, grantee_id, role)
    values ('b0000000-0000-0000-0000-000000000004','authenticated',
            '44444444-4444-4444-4444-444444444444','viewer');
    raise exception 'FAIL: a grant to everyone named a grantee';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_shared_with_everyone('b0000000-0000-0000-0000-000000000004','viewer');
    raise exception 'FAIL: a stranger shared somebody else''s node with everyone';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_shared_with_everyone('b0000000-0000-0000-0000-00000000000c', null);
reset role;

select pg_temp.check('withdrawing it takes the access with it',
  public.can_read('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-00000000000d')::text, 'false');

-- The space's home page ------------------------------------------------------
--
-- Every space has one node at the path `index`, and /s/<slug> is that node. It
-- used to sit in the file tree like any other page, where renaming it
-- rederived its slug and took the space's address with it: the space 404ed for
-- everybody, its owner included, with no way back. The interface no longer
-- offers the rename, but an address a rename can destroy is not an address, so
-- the refusal lives here.

insert into public.nodes (id, space_id, parent_id, kind, name, slug, content) values
  ('b0000000-0000-0000-0000-0000000000f1','a0000000-0000-0000-0000-000000000001',
   null,'file','Authz Test','index','Welcome.');

select pg_temp.check('the home page is at the address the space resolves to',
  (select path from public.nodes where id = 'b0000000-0000-0000-0000-0000000000f1'), 'index');

do $$
begin
  begin
    perform public.move_node(
      p_node_id => 'b0000000-0000-0000-0000-0000000000f1',
      p_new_name => 'Renamed',
      p_reparent => false);
    raise exception 'FAIL: the home page was renamed out from under its address';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select pg_temp.check('so the space still resolves',
  (select path from public.nodes where id = 'b0000000-0000-0000-0000-0000000000f1'), 'index');

do $$
begin
  begin
    delete from public.nodes where id = 'b0000000-0000-0000-0000-0000000000f1';
    raise exception 'FAIL: the home page was deleted';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select pg_temp.check('and is still there',
  (select count(*)::text from public.nodes where id = 'b0000000-0000-0000-0000-0000000000f1'), '1');

-- Renaming the space renames its front page, which is a name change and
-- nothing else. That must still be allowed, or a space could never be renamed.
update public.nodes set name = 'Renamed Space'
 where id = 'b0000000-0000-0000-0000-0000000000f1';

select pg_temp.check('renaming the space renames its front page',
  (select name || ' at ' || path from public.nodes
    where id = 'b0000000-0000-0000-0000-0000000000f1'),
  'Renamed Space at index');

-- Removing the space takes its home page with it: the guard is about losing
-- the front page of a space that still exists, not about keeping orphans.
insert into public.spaces (id, slug, name, owner_id) values
  ('a0000000-0000-0000-0000-0000000000f9','doomed','Doomed',
   '11111111-1111-1111-1111-111111111111');
insert into public.nodes (id, space_id, parent_id, kind, name, slug, content) values
  ('b0000000-0000-0000-0000-0000000000f9','a0000000-0000-0000-0000-0000000000f9',
   null,'file','Doomed','index','Welcome.');
delete from public.spaces where id = 'a0000000-0000-0000-0000-0000000000f9';

select pg_temp.check('deleting a space takes its home page with it',
  (select count(*)::text from public.nodes
    where id = 'b0000000-0000-0000-0000-0000000000f9'), '0');

-- Inviting somebody who has no account --------------------------------------
--
-- Sign-up is invitation-only, so refusing to share with an unknown address was
-- a dead end with no door: the person could not sign up, and nothing let
-- anyone invite them. What the database has to guarantee is that an invitation
-- is an administrator's decision, and that accepting one delivers the access
-- it promised rather than an empty list of spaces.

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

do $$
begin
  begin
    perform public.invite_to_node('b0000000-0000-0000-0000-000000000004',
      'nobody@example.com', 'viewer');
    raise exception 'FAIL: a stranger invited somebody to a node they cannot administer';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.invite_to_node('b0000000-0000-0000-0000-000000000001',
  'Newcomer@Example.com', 'editor');
reset role;

select pg_temp.check('the invitation is recorded against the node, folded to lower case',
  (select lower(email) || ' -> ' || role::text
     from public.invitations
    where node_id = 'b0000000-0000-0000-0000-000000000001'),
  'newcomer@example.com -> editor');

-- Re-inviting refreshes rather than duplicating: the second invitation is the
-- one that counts, and the pending index would refuse a second row anyway.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.invite_to_node('b0000000-0000-0000-0000-000000000001',
  'newcomer@example.com', 'viewer');
reset role;

select pg_temp.check('re-inviting refreshes the one invitation',
  (select count(*)::text || ' at ' || max(role::text)
     from public.invitations
    where node_id = 'b0000000-0000-0000-0000-000000000001'),
  '1 at viewer');

-- The same address invited to a second node. The old index was unique on the
-- address alone, which made this impossible for no good reason.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.invite_to_node('b0000000-0000-0000-0000-000000000004',
  'newcomer@example.com', 'viewer');
reset role;

select pg_temp.check('one person can be invited to two things at once',
  (select count(*)::text from public.invitations
    where lower(email) = 'newcomer@example.com' and accepted_at is null), '2');

-- Accepting is the account coming into being, so this creates one and lets
-- the trigger do what it does. That is what makes the assertions below worth
-- anything: nothing here reaches into the invitations table on its own behalf.
insert into auth.users (id, instance_id, aud, role, email) values
  ('55555555-5555-5555-5555-555555555555','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','newcomer@example.com');

select pg_temp.check('accepting delivers the access the invitation promised',
  public.can_read('55555555-5555-5555-5555-555555555555','b0000000-0000-0000-0000-000000000003')::text,
  'true');
select pg_temp.check('at the role it named',
  public.can_edit('55555555-5555-5555-5555-555555555555','b0000000-0000-0000-0000-000000000003')::text,
  'false');
select pg_temp.check('and an invitation is single use',
  (select count(*)::text from public.invitations
    where lower(email) = 'newcomer@example.com' and accepted_at is null), '0');

-- Visibility as one decision ------------------------------------------------
--
-- Reach used to be set through two independent controls, so a node could be
-- published *and* shared with everyone at once: a state nobody chooses, and
-- one where "who can see this" has two answers that can disagree. One function
-- now decides between the three, and choosing any one of them withdraws the
-- others. That exclusivity is the whole guarantee, so it is what is asserted.

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_node_visibility('b0000000-0000-0000-0000-000000000002','everyone','editor');
reset role;

select pg_temp.check('everyone means everyone with an account',
  public.can_edit('44444444-4444-4444-4444-444444444444','b0000000-0000-0000-0000-000000000003')::text, 'true');
select pg_temp.check('and never an anonymous visitor',
  public.can_read(null,'b0000000-0000-0000-0000-000000000003')::text, 'false');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_node_visibility('b0000000-0000-0000-0000-000000000002','public');
reset role;

select pg_temp.check('publishing withdraws the grant to everyone',
  (select count(*)::text from public.grants
    where node_id = 'b0000000-0000-0000-0000-000000000002'
      and grantee_type = 'authenticated'), '0');
select pg_temp.check('and reaches the internet instead',
  public.can_read(null,'b0000000-0000-0000-0000-000000000003')::text, 'true');
select pg_temp.check('read only, whatever it replaced',
  public.can_edit(null,'b0000000-0000-0000-0000-000000000003')::text, 'false');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_node_visibility('b0000000-0000-0000-0000-000000000002','everyone','viewer');
reset role;

select pg_temp.check('and back the other way withdraws the public grant',
  (select count(*)::text from public.grants
    where node_id = 'b0000000-0000-0000-0000-000000000002'
      and grantee_type = 'public'), '0');
select pg_temp.check('so an anonymous visitor loses it again',
  public.can_read(null,'b0000000-0000-0000-0000-000000000003')::text, 'false');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.set_node_visibility('b0000000-0000-0000-0000-000000000002','private');
reset role;

select pg_temp.check('private leaves neither behind',
  (select count(*)::text from public.grants
    where node_id = 'b0000000-0000-0000-0000-000000000002'
      and grantee_type in ('public','authenticated')), '0');

-- Handing "everyone" the power to decide who else can see a thing is not a
-- decision anybody makes on purpose, so it is not on offer.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_node_visibility('b0000000-0000-0000-0000-000000000002','everyone','admin');
    raise exception 'FAIL: everyone was given admin';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

do $$
begin
  begin
    perform public.set_node_visibility('b0000000-0000-0000-0000-000000000002','somewhere-else');
    raise exception 'FAIL: an unknown visibility was accepted';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

-- A stranger cannot set the reach of somebody else's node, and is told the
-- same thing they would be told about a node that does not exist.
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.set_node_visibility('b0000000-0000-0000-0000-000000000004','public');
    raise exception 'FAIL: a stranger published somebody else''s node';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;
reset role;

-- History -------------------------------------------------------------------
--
-- A page's revisions must be exactly as reachable as the page, through the
-- same predicate. A history with its own visibility rule would be a second
-- answer to "who can see this", and the second answer is the one that turns
-- out to be wrong. Restoring is an edit and needs edit.

-- Two saves on the deep note, which alice can read and the space owner can
-- edit.
update public.nodes
   set content = '# note, second draft', content_version = content_version + 1
 where id = 'b0000000-0000-0000-0000-000000000003';
update public.nodes
   set content = '# note, third draft', content_version = content_version + 1
 where id = 'b0000000-0000-0000-0000-000000000003';

select pg_temp.check('every save is recorded',
  (select count(*)::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000003'), '3');

-- A save that changes nothing is not a revision. Otherwise a history fills
-- with entries that say nothing happened.
update public.nodes
   set updated_at = now()
 where id = 'b0000000-0000-0000-0000-000000000003';

select pg_temp.check('a write that changes nothing records nothing',
  (select count(*)::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000003'), '3');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select pg_temp.check('a reader of the page sees its history',
  (select count(*)::text from public.node_history('b0000000-0000-0000-0000-000000000003')), '3');

select pg_temp.check('and can read the revisions themselves',
  (select count(*)::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000003'), '3');

-- Alice holds viewer, so restoring is not hers to do.
do $$
declare v_id uuid;
begin
  select id into v_id from public.node_revisions
   where node_id = 'b0000000-0000-0000-0000-000000000003'
   order by created_at limit 1;
  begin
    perform public.restore_node_revision(v_id);
    raise exception 'FAIL: a viewer restored a revision';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

-- Carol can read nothing here, so there is no history to see and no revision
-- to name. Both answers are the same as for a page that does not exist.
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select pg_temp.check('a stranger sees no history at all',
  (select count(*)::text from public.node_history('b0000000-0000-0000-0000-000000000003')), '0');
select pg_temp.check('and no revisions',
  (select count(*)::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000003'), '0');

-- The space owner, who holds admin on everything in it and whose access no
-- earlier section of this suite has taken away. Bob's editor grant came
-- through the Engineers team, and the teams section above revokes it: a test
-- that leans on state set up a thousand lines earlier is a test that fails for
-- a reason having nothing to do with what it is checking.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

do $$
declare v_id uuid;
begin
  select id into v_id from public.node_revisions
   where node_id = 'b0000000-0000-0000-0000-000000000003'
   order by created_at limit 1;
  perform public.restore_node_revision(v_id);
end $$;
reset role;

select pg_temp.check('restoring puts the old text back',
  (select content from public.nodes
    where id = 'b0000000-0000-0000-0000-000000000003'), '# note');

-- Forward, never backward: the restore is itself an edit, so it takes a new
-- version and appears in the history. A history you can rewind is a history
-- somebody can quietly rewrite.
--
-- Three, not four: only the last three versions are kept, so the fourth save
-- pushed the oldest off the end. The restore still read the text it was asked
-- for before that happened, which is the ordering that matters.
select pg_temp.check('and is recorded as a new revision rather than a rewind',
  (select count(*)::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000003'), '3');

-- The chain is reverse deltas anchored at what the page says now, so the head
-- must reconstruct to exactly that. If it does not, every older version in the
-- chain is wrong too and nothing else here would have noticed.
select pg_temp.check('and the newest version is what the page now says',
  (select t.content from public.node_revisions r
     join lateral public.node_revision_text(r.id) t on true
    where r.node_id = 'b0000000-0000-0000-0000-000000000003'
    order by r.created_at desc, r.id desc limit 1),
  '# note');

select pg_temp.check('attributed to whoever restored it',
  (select author_id::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000003'
    order by created_at desc limit 1),
  '11111111-1111-1111-1111-111111111111');

-- Nobody writes history by hand. The table has a select policy and no other,
-- so an insert by a signed-in user is refused however plausible it looks.
-- Asked of the space owner, who has every right this product grants. If even
-- they cannot write history by hand, nobody can.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  begin
    insert into public.node_revisions
      (node_id, content_version, name, prefix, suffix, middle, characters)
    values ('b0000000-0000-0000-0000-000000000003', 99, 'Note', 0, 0, 'invented', 8);
    raise exception 'FAIL: a revision was written by hand';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;

  begin
    delete from public.node_revisions
     where node_id = 'b0000000-0000-0000-0000-000000000003';
    if found then
      raise exception 'FAIL: history was deleted';
    end if;
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;
reset role;

select pg_temp.check('so the history is still whole',
  (select count(*)::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000003'), '3');

-- Deleting the page takes its history with it. Keeping revisions of something
-- nobody can reach would be a copy of the content outliving the access rules
-- that governed it.
delete from public.nodes where id = 'b0000000-0000-0000-0000-000000000003';

select pg_temp.check('deleting a page takes its history with it',
  (select count(*)::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000003'), '0');

-- Platform administrators -----------------------------------------------------
--
-- A power over accounts rather than over pages, and the only one in this
-- schema that is not about a single node. What it must not become is a way to
-- read everybody's writing: the rule the rest of this file exists to defend is
-- that a page you cannot read is indistinguishable from one that does not
-- exist, and an administrator who could read everything would be a standing
-- exception to it. So the assertions here are as much about what the power
-- does not carry as about what it does.

select pg_temp.check('nobody administers the platform to begin with',
  (select count(*)::text from public.profiles where is_admin), '0');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select pg_temp.check('so the people list is empty even for a space owner',
  (select count(*)::text from public.admin_users()), '0');

-- Nor can somebody appoint themselves.
do $$
begin
  begin
    perform public.admin_set_admin('11111111-1111-1111-1111-111111111111', true);
    raise exception 'FAIL: a non-administrator appointed one';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;
reset role;

select pg_temp.check('and nobody was appointed',
  (select count(*)::text from public.profiles where is_admin), '0');

update public.profiles set is_admin = true
 where id = '11111111-1111-1111-1111-111111111111';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- Five: the four the fixture starts with, and the colleague added by the
-- sharing-with-everyone section above.
select pg_temp.check('an administrator sees everybody',
  (select count(*)::text from public.admin_users()), '5');

-- Counts and sizes, and not one word of anybody's writing: there is no column
-- here that could carry it, which is the point.
select pg_temp.check('and what each of them holds',
  (select (spaces > 0 and articles > 0 and content_bytes > 0)::text
     from public.admin_users()
    where email = 'owner@test.local'), 'true');

-- Asked of the function's own signature rather than of a table, because
-- admin_users is a function and information_schema would have answered zero
-- for a question it never understood.
select pg_temp.check('but its answer has no column that could carry writing',
  (select count(*)::text
     from pg_proc p, unnest(p.proargnames) as arg
    where p.proname = 'admin_users'
      and p.pronamespace = 'public'::regnamespace
      and arg in ('content', 'middle')), '0');

select pg_temp.check('and it does answer with the columns it should',
  (select count(*)::text
     from pg_proc p, unnest(p.proargnames) as arg
    where p.proname = 'admin_users'
      and p.pronamespace = 'public'::regnamespace
      and arg in ('articles', 'skills', 'content_bytes', 'spaces')), '4');

-- Somebody else's turn. Carol could read nothing in this space before and can
-- read nothing in it now: being listed by an administrator is not access.
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select pg_temp.check('a listed person is not thereby an administrator',
  (select count(*)::text from public.admin_users()), '0');

-- Handing a space over is how somebody leaves. It moves the administration
-- with it, because ownership is where a space's administration comes from.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.admin_transfer_space(
  'a0000000-0000-0000-0000-000000000001',
  '44444444-4444-4444-4444-444444444444');
reset role;

select pg_temp.check('the space has a new owner',
  (select owner_id::text from public.spaces
    where id = 'a0000000-0000-0000-0000-000000000001'),
  '44444444-4444-4444-4444-444444444444');

select pg_temp.check('who administers what is in it',
  public.can_admin('44444444-4444-4444-4444-444444444444',
                   'b0000000-0000-0000-0000-000000000001')::text, 'true');

-- An account that still owns a space cannot be deleted, because a profile
-- cascades to its spaces and a space to every page in it. Enforced here rather
-- than only in the code that deletes, since forgetting is the failure that
-- takes a team's writing with it.
do $$
begin
  begin
    delete from public.profiles where id = '44444444-4444-4444-4444-444444444444';
    raise exception 'FAIL: an account owning spaces was deleted';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select pg_temp.check('so the account is still there',
  (select count(*)::text from public.profiles
    where id = '44444444-4444-4444-4444-444444444444'), '1');

-- And the last administrator cannot stand themselves down, because a platform
-- nobody can administer has no way back through the interface.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
do $$
begin
  begin
    perform public.admin_set_admin('11111111-1111-1111-1111-111111111111', false);
    raise exception 'FAIL: the last administrator stood down';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;
reset role;

select pg_temp.check('there is still somebody who can administer this',
  (select count(*)::text from public.profiles where is_admin), '1');

-- Telling somebody something has been shared with them ------------------------
--
-- Sharing with an address that has no account has always sent an email, since
-- that is how they get in at all. Sharing with somebody who already has one
-- did nothing they could see: the grant landed, the page became theirs to
-- read, and nothing told them. This is the record that does.

-- A page and a grant of its own, so these assertions do not depend on what the
-- sections above have moved, transferred or deleted.
-- Attributed to carol, who owns this space by now. Said rather than left to
-- whatever claims the section above finished with: a top-level node grants its
-- creator the run of it, and an unintended creator would mean a second grant
-- here, which is exactly what the assertion below counts.
insert into public.nodes (id, space_id, parent_id, kind, name, created_by)
values ('b0000000-0000-0000-0000-0000000000e1',
        'a0000000-0000-0000-0000-000000000001', null, 'file', 'Handover',
        '44444444-4444-4444-4444-444444444444');

-- Shared by carol, who owns this space by now, having been handed it in the
-- section above. By her rather than by the superuser this file otherwise runs
-- as, because the whole point of the next assertion is who the database
-- thought was asking, and the answer for nobody in particular is null.
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

insert into public.grants (node_id, grantee_type, grantee_id, role)
values ('b0000000-0000-0000-0000-0000000000e1', 'user',
        '22222222-2222-2222-2222-222222222222', 'viewer');
reset role;

-- Who did it is stamped by a trigger rather than by each of the several
-- functions that create grants, so the next one cannot forget.
select pg_temp.check('a grant records who made it',
  (select granted_by::text from public.grants
    where node_id = 'b0000000-0000-0000-0000-0000000000e1'),
  '44444444-4444-4444-4444-444444444444');

-- One function per table, and this is not a style preference. Sharing one
-- between them plans `tg_table_name = 'grants' and new.granted_by is null` as
-- a single expression against whichever record it was handed, and fails
-- outright on the table with no such column. The fixture at the top of this
-- file is what caught it, by refusing to insert a team member at all, and is
-- still the real test: if these two ever become one again, this suite does not
-- reach its first assertion.
select pg_temp.check('each table stamps through its own function',
  (select count(*)::text from pg_trigger
    where tgname in ('grants_stamp_granted_by', 'team_members_stamp_added_by')
      and not tgisinternal), '2');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);

select pg_temp.check('a page shared with you appears in your list',
  (select count(*)::text from public.shared_with_me() where label = 'Handover'), '1');

select pg_temp.check('and is new until you have looked',
  (select is_new::text from public.shared_with_me() where label = 'Handover'), 'true');

select pg_temp.check('the count in the header agrees that there is something',
  (public.new_share_count() > 0)::text, 'true');

select public.mark_shares_seen();

select pg_temp.check('and nothing is new once you have',
  (select is_new::text from public.shared_with_me() where label = 'Handover'), 'false');

select pg_temp.check('nor does the count say otherwise',
  public.new_share_count()::text, '0');

-- Carol owns this space outright by now, having been handed it in the section
-- above. Owning a thing is not being shared it, and it must not appear as
-- something somebody did for her.
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);

select pg_temp.check('a share of somebody else''s is not in your list',
  (select count(*)::text from public.shared_with_me() where label = 'Handover'), '0');

reset role;

-- Being in a space -------------------------------------------------------------
--
-- Membership and sharing were the same mechanism and should not have been.
-- Sharing answers "this page, this person". Membership answers "you work here":
-- everything in the space, to read and to change, and the top of it to add to.
--
-- What it deliberately does not confer is deleting. That belongs to whoever
-- wrote the thing and to nobody else, the space's owner included, which is the
-- reversal these assertions exist to hold down. Owning a space is owning the
-- room rather than the things people brought into it.
--
-- Its own space, so none of this depends on what the sections above have moved,
-- transferred or deleted. Creators are named rather than left to whatever
-- claims are in force, because who made a node decides who may delete it.

insert into public.spaces (id, slug, name, owner_id) values
  ('a0000000-0000-0000-0000-000000000003','members-test','Members Test',
   '11111111-1111-1111-1111-111111111111');

insert into public.nodes (id, space_id, parent_id, kind, name, created_by) values
  ('b0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-000000000003',
   null,'folder','Owner Folder','11111111-1111-1111-1111-111111111111'),
  -- Shared with nobody, so seeing it can only be membership.
  ('b0000000-0000-0000-0000-0000000000d6','a0000000-0000-0000-0000-000000000003',
   null,'file','Owner Only','11111111-1111-1111-1111-111111111111');

-- Alice is in the space. Bob is shared one folder in it and is not.
insert into public.space_members (space_id, member_type, member_id) values
  ('a0000000-0000-0000-0000-000000000003','user','22222222-2222-2222-2222-222222222222');
insert into public.grants (node_id, grantee_type, grantee_id, role) values
  ('b0000000-0000-0000-0000-0000000000d1','user','33333333-3333-3333-3333-333333333333','viewer');

select pg_temp.check('being in a space is not the same as being shared something in it',
  public.is_space_member('33333333-3333-3333-3333-333333333333',
    'a0000000-0000-0000-0000-000000000003')::text, 'false');
select pg_temp.check('and the owner is in their own space without a row saying so',
  public.is_space_member('11111111-1111-1111-1111-111111111111',
    'a0000000-0000-0000-0000-000000000003')::text, 'true');

-- A member sees the whole space, including what was shared with nobody.
select pg_temp.check('a member reads what nobody shared with them',
  public.can_read('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-0000000000d6')::text, 'true');
select pg_temp.check('and may change it, which is what a shared space is for',
  public.can_edit('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-0000000000d6')::text, 'true');
-- Editing everything is not administering anything: who may read it stays the
-- owner's to decide.
select pg_temp.check('but does not decide who else may read it',
  public.can_admin('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-0000000000d6')::text, 'false');

-- Somebody shared one folder sees that folder and no more of the space.
select pg_temp.check('somebody shared one folder sees only that folder',
  public.can_read('33333333-3333-3333-3333-333333333333',
    'b0000000-0000-0000-0000-0000000000d1')::text, 'true');
select pg_temp.check('and nothing else in the space',
  public.can_read('33333333-3333-3333-3333-333333333333',
    'b0000000-0000-0000-0000-0000000000d6')::text, 'false');

set local role authenticated;

-- Starting something at the top, which inheritance cannot reach.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('a member is in the space',
  public.in_space('a0000000-0000-0000-0000-000000000003')::text, 'true');

insert into public.nodes (id, space_id, parent_id, kind, name) values
  ('b0000000-0000-0000-0000-0000000000d2','a0000000-0000-0000-0000-000000000003',
   null,'file','Alice Started This');
select pg_temp.check('and may start something at the top of it',
  (select name from public.nodes where id = 'b0000000-0000-0000-0000-0000000000d2'),
  'Alice Started This');
select pg_temp.check('recorded as hers without her saying so',
  (select created_by::text from public.nodes where id = 'b0000000-0000-0000-0000-0000000000d2'),
  '22222222-2222-2222-2222-222222222222');

-- Somebody shared a folder in the space is not in the space, so the top of it
-- is not theirs to add to.
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select pg_temp.check('somebody shared one folder is not in the space',
  public.in_space('a0000000-0000-0000-0000-000000000003')::text, 'false');
do $$
begin
  begin
    insert into public.nodes (id, space_id, parent_id, kind, name) values
      ('b0000000-0000-0000-0000-0000000000d3','a0000000-0000-0000-0000-000000000003',
       null,'file','Bob Should Not');
    raise exception 'FAIL: somebody outside a space started something at the top of it';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

-- Deleting: the author, and nobody else --------------------------------------

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('a member may delete what they wrote',
  public.can_delete_node('b0000000-0000-0000-0000-0000000000d2')::text, 'true');
select pg_temp.check('and may not delete what somebody else wrote',
  public.can_delete_node('b0000000-0000-0000-0000-0000000000d6')::text, 'false');
do $$
begin
  delete from public.nodes where id = 'b0000000-0000-0000-0000-0000000000d6';
  if not exists (select 1 from public.nodes where id = 'b0000000-0000-0000-0000-0000000000d6') then
    raise exception 'FAIL: a member deleted somebody else''s page';
  end if;
end $$;

-- The reversal. The owner of the space may not delete a member's work, because
-- owning the space is not owning what is in it.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('and neither may the owner of the space',
  public.can_delete_node('b0000000-0000-0000-0000-0000000000d2')::text, 'false');
do $$
begin
  delete from public.nodes where id = 'b0000000-0000-0000-0000-0000000000d2';
  if not exists (select 1 from public.nodes where id = 'b0000000-0000-0000-0000-0000000000d2') then
    raise exception 'FAIL: a space owner deleted a member''s page';
  end if;
end $$;
select pg_temp.check('though the owner still deletes their own',
  public.can_delete_node('b0000000-0000-0000-0000-0000000000d6')::text, 'true');

-- A folder of your own stops being yours to delete once somebody else has put
-- something in it, or the rule above would be one step from meaningless.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
insert into public.nodes (id, space_id, parent_id, kind, name) values
  ('b0000000-0000-0000-0000-0000000000d4','a0000000-0000-0000-0000-000000000003',
   null,'folder','Alice Folder');
reset role;
insert into public.nodes (id, space_id, parent_id, kind, name, created_by) values
  ('b0000000-0000-0000-0000-0000000000d5','a0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-0000000000d4','file','Somebody Else''s Page',
   '11111111-1111-1111-1111-111111111111');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('nor a folder of their own holding somebody else''s work',
  public.can_delete_node('b0000000-0000-0000-0000-0000000000d4')::text, 'false');
reset role;
delete from public.nodes where id = 'b0000000-0000-0000-0000-0000000000d5';
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('and may once it holds only their own',
  public.can_delete_node('b0000000-0000-0000-0000-0000000000d4')::text, 'true');

-- The roster is the owner's to change and everybody's to read ------------------

select pg_temp.check('a member sees who else is in the space',
  (select count(*)::text from public.space_roster('a0000000-0000-0000-0000-000000000003')), '1');
do $$
begin
  begin
    perform public.add_space_member(
      'a0000000-0000-0000-0000-000000000003','carol@test.local');
    raise exception 'FAIL: a member added somebody to a space';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select pg_temp.check('and somebody outside it is told nothing about the roster',
  (select count(*)::text from public.space_roster('a0000000-0000-0000-0000-000000000003')), '0');

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('the owner adds somebody by address',
  (public.add_space_member(
     'a0000000-0000-0000-0000-000000000003','carol@test.local')).member_type::text,
  'user');
select pg_temp.check('and adding again is not an error',
  (public.add_space_member(
     'a0000000-0000-0000-0000-000000000003','carol@test.local')).member_type::text,
  'user');

reset role;
select pg_temp.check('which lets them read the space at once',
  public.can_read('44444444-4444-4444-4444-444444444444',
    'b0000000-0000-0000-0000-0000000000d6')::text, 'true');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select public.remove_space_member(
  (select member_row_id from public.space_roster('a0000000-0000-0000-0000-000000000003')
    where label = 'carol@test.local'));
reset role;
select pg_temp.check('and taking them out takes the reading with it',
  public.can_read('44444444-4444-4444-4444-444444444444',
    'b0000000-0000-0000-0000-0000000000d6')::text, 'false');

-- Taking a page out of a space -------------------------------------------------
--
-- Deleting belongs to the author, which left a space's owner unable to clear
-- anything out of their own space. Sending it home is the answer: not a
-- deletion, a move. The work survives, keeps its author and its history, and
-- stops being reachable through the space it left.
--
-- Alice is a member of the members-test space and owns nothing in it. What she
-- has is the space everybody has, which is where her work goes when it is sent
-- home: her own, rather than a project she happens to own with other people in
-- it.

reset role;

select pg_temp.check('the author has the one space everybody has',
  (select count(*)::text from public.spaces
    where owner_id = '22222222-2222-2222-2222-222222222222'), '1');
select pg_temp.check('and it is marked as hers rather than a project',
  (select is_personal::text from public.spaces
    where owner_id = '22222222-2222-2222-2222-222222222222'), 'true');

-- A page of alice's with something under it, so the subtree can be watched.
insert into public.nodes (id, space_id, parent_id, kind, name, created_by) values
  ('b0000000-0000-0000-0000-0000000000e7','a0000000-0000-0000-0000-000000000003',
   'b0000000-0000-0000-0000-0000000000d4','file','Under Hers',
   '22222222-2222-2222-2222-222222222222');

set local role authenticated;

-- A member cannot send anything home: it is not their space to clear.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('a member cannot send somebody else''s work home',
  public.can_evict_node('b0000000-0000-0000-0000-0000000000d6')::text, 'false');
do $$
begin
  begin
    perform public.evict_node('b0000000-0000-0000-0000-0000000000d6');
    raise exception 'FAIL: a member sent somebody else''s work out of a space';
  exception when sqlstate 'P0001' then raise;
       when others then null;  -- refused, as it must be
  end;
end $$;

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

-- Nor the owner their own work: that is deleting, and they can already do it.
select pg_temp.check('and the owner does not send their own work home',
  public.can_evict_node('b0000000-0000-0000-0000-0000000000d6')::text, 'false');

-- Nor the home page, which is the space's address.
select pg_temp.check('nor the page a space resolves to',
  public.can_evict_node(
    (select id from public.nodes
      where space_id = 'a0000000-0000-0000-0000-000000000003' and slug = 'index'))::text,
  'false');

select pg_temp.check('but a member''s folder is theirs to send back',
  public.can_evict_node('b0000000-0000-0000-0000-0000000000d4')::text, 'true');
select pg_temp.check('and it lands at the top of a space of the author''s',
  coalesce((public.evict_node('b0000000-0000-0000-0000-0000000000d4')).parent_id::text,
           'top level'),
  'top level');

reset role;

-- No second space was minted for it: it went to the one that is hers, which is
-- the whole point of sending work home rather than merely out.
select pg_temp.check('it went to the space that is already theirs',
  (select count(*)::text from public.spaces
    where owner_id = '22222222-2222-2222-2222-222222222222'), '1');
select pg_temp.check('the personal one, not a new project',
  (select s.is_personal::text from public.nodes n
    join public.spaces s on s.id = n.space_id
    where n.id = 'b0000000-0000-0000-0000-0000000000d4'), 'true');
select pg_temp.check('the folder is in it now',
  (select s.owner_id::text from public.nodes n
    join public.spaces s on s.id = n.space_id
    where n.id = 'b0000000-0000-0000-0000-0000000000d4'),
  '22222222-2222-2222-2222-222222222222');
select pg_temp.check('and what was under it came too',
  (select s.owner_id::text from public.nodes n
    join public.spaces s on s.id = n.space_id
    where n.id = 'b0000000-0000-0000-0000-0000000000e7'),
  '22222222-2222-2222-2222-222222222222');
select pg_temp.check('with its path rewritten under the new one',
  (select n.path from public.nodes n where n.id = 'b0000000-0000-0000-0000-0000000000e7'),
  'alice-folder/under-hers');

-- Nothing was destroyed, and it is hers now rather than merely visible to her.
select pg_temp.check('the author still has it, and administers it',
  public.can_admin('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-0000000000d4')::text, 'true');
-- And the space it left no longer reaches it, which is the point of sending it.
select pg_temp.check('and the space it left cannot reach it any more',
  public.can_read('11111111-1111-1111-1111-111111111111',
    'b0000000-0000-0000-0000-0000000000d4')::text, 'false');

-- Work that is nobody's ---------------------------------------------------------
--
-- An account going takes its authorship with it, leaving a page that nobody may
-- delete and that cannot be sent home either, because there is no home. The
-- owner of the space holding it is the last judgement available.

update public.nodes set created_by = null
 where id = 'b0000000-0000-0000-0000-0000000000d2';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('work that is nobody''s cannot be sent home',
  public.can_evict_node('b0000000-0000-0000-0000-0000000000d2')::text, 'false');
select pg_temp.check('so the owner of the space holding it may remove it',
  public.can_delete_node('b0000000-0000-0000-0000-0000000000d2')::text, 'true');

-- And that exception is exactly as wide as it says: somebody else's work in the
-- same space is still not theirs to delete.
insert into public.nodes (id, space_id, parent_id, kind, name, created_by) values
  ('b0000000-0000-0000-0000-0000000000e8','a0000000-0000-0000-0000-000000000003',
   null,'file','Still Somebody''s','33333333-3333-3333-3333-333333333333');
select pg_temp.check('and no wider than that',
  public.can_delete_node('b0000000-0000-0000-0000-0000000000e8')::text, 'false');

reset role;


-- An author never loses their own work ----------------------------------------
--
-- The base rule, and the one that was missing. Access came from grants, from
-- membership and from owning a space, none of which is authorship, so somebody
-- taken out of a space lost the pages they had written in it: work only they
-- could delete and none of them could open.

-- Bob is not in the members-test space and holds one viewer grant on one folder
-- in it. He wrote 'Still Somebody''s', which nothing has been shared with him.
select pg_temp.check('having written it is a reason to reach it',
  public.can_read('33333333-3333-3333-3333-333333333333',
    'b0000000-0000-0000-0000-0000000000e8')::text, 'true');
select pg_temp.check('and to change it',
  public.can_edit('33333333-3333-3333-3333-333333333333',
    'b0000000-0000-0000-0000-0000000000e8')::text, 'true');
-- Editor and not more: who else may read a page inside somebody's space is
-- still that somebody's decision.
select pg_temp.check('but not to decide who else reads it',
  public.can_admin('33333333-3333-3333-3333-333333333333',
    'b0000000-0000-0000-0000-0000000000e8')::text, 'false');
-- And it is about your work, not about the space it happens to be in.
select pg_temp.check('and it says nothing about the rest of the space',
  public.can_read('33333333-3333-3333-3333-333333333333',
    'b0000000-0000-0000-0000-0000000000d6')::text, 'false');

-- The case this rule exists for: being taken out of a space.
insert into public.nodes (id, space_id, parent_id, kind, name, created_by) values
  ('b0000000-0000-0000-0000-0000000000e9','a0000000-0000-0000-0000-000000000003',
   null,'file','Alice Wrote This','22222222-2222-2222-2222-222222222222');

select pg_temp.check('a member reads what they wrote in a space',
  public.can_read('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-0000000000e9')::text, 'true');

delete from public.space_members
 where space_id = 'a0000000-0000-0000-0000-000000000003'
   and member_type = 'user'
   and member_id = '22222222-2222-2222-2222-222222222222';

select pg_temp.check('and still reads it after being taken out of the space',
  public.can_read('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-0000000000e9')::text, 'true');
select pg_temp.check('and may still change it',
  public.can_edit('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-0000000000e9')::text, 'true');
select pg_temp.check('and it is still theirs to delete',
  (select public.can_delete_node('b0000000-0000-0000-0000-0000000000e9')
     from (select set_config('request.jwt.claims',
       '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true)) _)::text,
  'true');
-- What they did lose is the space: everything in it that is not theirs.
select pg_temp.check('but the rest of the space went with the membership',
  public.can_read('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-0000000000d6')::text, 'false');


-- Two more kinds of file -------------------------------------------------------

-- HTML and JSON are formats, not permissions, and these checks exist to hold
-- that line. A file typed html is stored like any other file, kept consistent
-- by the same trigger, and answered for by the same predicates: there is no
-- rule anywhere that reads the type before deciding who may see something.

insert into public.nodes (id, space_id, parent_id, kind, name, content, content_type, created_by) values
  ('b0000000-0000-0000-0000-000000000fa1','a0000000-0000-0000-0000-000000000003',
   null,'file','Report','<p>Q3</p>','html','22222222-2222-2222-2222-222222222222'),
  ('b0000000-0000-0000-0000-000000000fa2','a0000000-0000-0000-0000-000000000003',
   null,'file','Settings','{"theme":"dark"}','json','22222222-2222-2222-2222-222222222222');

select pg_temp.check('an html file keeps its type',
  (select content_type::text from public.nodes
    where id = 'b0000000-0000-0000-0000-000000000fa1'), 'html');
select pg_temp.check('a json file keeps its type',
  (select content_type::text from public.nodes
    where id = 'b0000000-0000-0000-0000-000000000fa2'), 'json');

-- The same author, the same answer as for the prose page above it.
select pg_temp.check('and its author reads it exactly as they read their prose',
  public.can_read('22222222-2222-2222-2222-222222222222',
    'b0000000-0000-0000-0000-000000000fa1')::text, 'true');
select pg_temp.check('while somebody outside the space reads neither',
  public.can_read('33333333-3333-3333-3333-333333333333',
    'b0000000-0000-0000-0000-000000000fa2')::text, 'false');

-- A folder is still nothing of the kind, however it is asked for.
insert into public.nodes (id, space_id, parent_id, kind, name, content_type, created_by) values
  ('b0000000-0000-0000-0000-000000000fa3','a0000000-0000-0000-0000-000000000003',
   null,'folder','Exports','json','22222222-2222-2222-2222-222222222222');

select pg_temp.check('a folder asked for a type is still untyped',
  (select (content_type is null)::text from public.nodes
    where id = 'b0000000-0000-0000-0000-000000000fa3'), 'true');

-- And a revision of one is a revision like any other, so history works on the
-- new types without anything being taught about them.
update public.nodes set content = '<p>Q4</p>', content_version = content_version + 1
 where id = 'b0000000-0000-0000-0000-000000000fa1';

select pg_temp.check('an html file keeps history like everything else',
  (select (count(*) > 0)::text from public.node_revisions
    where node_id = 'b0000000-0000-0000-0000-000000000fa1'), 'true');


-- Review ------------------------------------------------------------------------

-- Asking for a review, and getting one. The point of these checks is that the
-- three transitions are three different powers, and that none of them is a way
-- to learn anything about a page you cannot read.

-- Returns what the database said when it refused, or 'allowed' when it did not.
-- The refusals here are raised deliberately with messages, so the message is
-- the thing worth asserting: it is what somebody will read.
create function pg_temp.refusal(p_sql text) returns text language plpgsql as $$
begin
  execute p_sql;
  return 'allowed';
exception when others then
  return sqlerrm;
end;
$$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('66666666-6666-6666-6666-666666666666','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','reviewer@test.local');

-- A space of its own, because the older ones have been handed around by the
-- sections above and a test that depends on who owns what by now is a test
-- that will break for a reason having nothing to do with reviewing.
--
--   owner     wrote the page and owns the space
--   reviewer  is in the space and holds nothing on the page itself
--   alice     holds a viewer grant on the page and is not in the space
--   carol     has no relationship to any of it
--
-- The middle two are the halves of the rule: being able to read a page is not
-- being in the room where it is reviewed, and being in that room does not
-- require holding anything on the page.
insert into public.spaces (id, slug, name, owner_id) values
  ('a0000000-0000-0000-0000-000000000009','review-test','Review Test',
   '11111111-1111-1111-1111-111111111111');

insert into public.nodes (id, space_id, parent_id, kind, name, content, created_by) values
  ('b0000000-0000-0000-0000-00000000fb01','a0000000-0000-0000-0000-000000000009',
   null,'file','Proposal','# proposal','11111111-1111-1111-1111-111111111111'),
  ('b0000000-0000-0000-0000-00000000fb02','a0000000-0000-0000-0000-000000000009',
   null,'folder','Drafts',null,'11111111-1111-1111-1111-111111111111');

insert into public.grants (node_id, grantee_type, grantee_id, role) values
  ('b0000000-0000-0000-0000-00000000fb01','user',
   '22222222-2222-2222-2222-222222222222','viewer');
insert into public.space_members (space_id, member_type, member_id) values
  ('a0000000-0000-0000-0000-000000000009','user',
   '66666666-6666-6666-6666-666666666666');

-- Nothing to begin with, which is the state nearly every page stays in.
select pg_temp.check('a page has no review state until somebody asks for one',
  (select coalesce(review_status::text, 'none') from public.nodes
    where id = 'b0000000-0000-0000-0000-00000000fb01'), 'none');

-- Somebody with no access learns nothing, including that it is there.
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('a stranger asking for a review is told there is no such page',
  pg_temp.refusal($q$select public.set_review_status('b0000000-0000-0000-0000-00000000fb01','in_review')$q$),
  'Not found.');
select pg_temp.check('and cannot see the review state either',
  (select count(*)::text from public.node_review('b0000000-0000-0000-0000-00000000fb01')),
  '0');

-- A reader is not an author. Named rather than hidden: they can see the page,
-- so being told why the control is not theirs reveals nothing.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('somebody who may only read cannot send it for review',
  pg_temp.refusal($q$select public.set_review_status('b0000000-0000-0000-0000-00000000fb01','in_review')$q$),
  'Only the person who wrote this can ask for it to be reviewed.');

-- Nor can somebody who may change it. Being able to edit a page is the power
-- to fix a typo in it; putting it up to be judged is the author's, and in a
-- space whose members all hold editor the two came to the same thing.
select set_config('request.jwt.claims','{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select pg_temp.check('somebody who may edit it still cannot, not having written it',
  public.can_edit('b0000000-0000-0000-0000-00000000fb01')::text, 'true');
select pg_temp.check('because asking belongs to whoever wrote it',
  pg_temp.refusal($q$select public.set_review_status('b0000000-0000-0000-0000-00000000fb01','in_review')$q$),
  'Only the person who wrote this can ask for it to be reviewed.');

-- The author's own act.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('the author sends it for review',
  public.set_review_status('b0000000-0000-0000-0000-00000000fb01','in_review')::text,
  'in_review');

-- And cannot then approve it. A review one person starts and finishes is not a
-- review; it is a button that says Approved.
select pg_temp.check('the author cannot approve their own page',
  pg_temp.refusal($q$select public.set_review_status('b0000000-0000-0000-0000-00000000fb01','approved')$q$),
  'You cannot approve your own page.');
select pg_temp.check('and can_approve says so on its own',
  public.can_approve('b0000000-0000-0000-0000-00000000fb01')::text, 'false');

-- Reading a page is not being in the room where it is reviewed.
select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('a grantee from outside the space cannot approve',
  pg_temp.refusal($q$select public.set_review_status('b0000000-0000-0000-0000-00000000fb01','approved')$q$),
  'Only somebody in this space can approve a page in it.');
select pg_temp.check('and can_approve says so on its own',
  public.can_approve('b0000000-0000-0000-0000-00000000fb01')::text, 'false');

-- Anybody in the space, holding nothing on the page itself.
select set_config('request.jwt.claims','{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select pg_temp.check('somebody in the space approves it',
  public.set_review_status('b0000000-0000-0000-0000-00000000fb01','approved')::text,
  'approved');
select pg_temp.check('and the page records who',
  (select p.email from public.nodes n join public.profiles p on p.id = n.review_by
    where n.id = 'b0000000-0000-0000-0000-00000000fb01'), 'reviewer@test.local');

-- Approving twice is not a thing: the second one is approving something that
-- is not under review.
select pg_temp.check('approving something not under review is refused',
  pg_temp.refusal($q$select public.set_review_status('b0000000-0000-0000-0000-00000000fb01','approved')$q$),
  'This page is not under review.');

-- An approval is of a document rather than of a name, so an edit after one is
-- worth saying out loud.
select pg_temp.check('a fresh approval is not stale',
  (select stale::text from public.node_review('b0000000-0000-0000-0000-00000000fb01')),
  'false');
update public.nodes
   set content = '# proposal, revised', content_version = content_version + 1
 where id = 'b0000000-0000-0000-0000-00000000fb01';
select pg_temp.check('changing the page after it was approved says so',
  (select stale::text from public.node_review('b0000000-0000-0000-0000-00000000fb01')),
  'true');

-- Clearing it is the author's again, and leaves nothing behind.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('the author clears it',
  coalesce(public.set_review_status('b0000000-0000-0000-0000-00000000fb01', null)::text, 'none'),
  'none');
select pg_temp.check('and who approved it goes with it',
  (select coalesce(review_by::text, 'none') from public.nodes
    where id = 'b0000000-0000-0000-0000-00000000fb01'), 'none');

-- A folder is not a document.
select pg_temp.check('a folder cannot be reviewed',
  pg_temp.refusal($q$select public.set_review_status('b0000000-0000-0000-0000-00000000fb02','in_review')$q$),
  'Only a page can be reviewed.');

-- Being put in a space is news ---------------------------------------------------

-- The largest thing that can happen to somebody here, and it used to happen in
-- silence: every folder in the space and everything anybody adds to it later,
-- arriving with no notice of any kind.
select set_config('request.jwt.claims','{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}', true);
select pg_temp.check('being added to a space is something you are told about',
  (select count(*)::text from public.shared_with_me()
    where kind = 'space' and label = 'Review Test'), '1');
select pg_temp.check('and it points at the space itself',
  (select href from public.shared_with_me()
    where kind = 'space' and label = 'Review Test'), '/s/review-test');
select pg_temp.check('and it counts towards what is new',
  (public.new_share_count() > 0)::text, 'true');

-- And it is told to the people it happened to, nobody else.
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('somebody not in the space hears nothing about it',
  (select count(*)::text from public.shared_with_me() where label = 'Review Test'), '0');

-- Owning a space is not news you send yourself.
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('and its owner is not told they were added to their own space',
  (select count(*)::text from public.shared_with_me()
    where kind = 'space' and label = 'Review Test'), '0');

select set_config('request.jwt.claims', '', true);


-- Which teams somebody is on --------------------------------------------------

-- Asked from the People screen, where putting somebody on a team is done: you
-- are looking at the person rather than at the team. The reader is an
-- administrator's, like every other question that crosses accounts, and it
-- answers nobody else at all rather than refusing them.
--
-- Its own team, so this does not depend on which of the fixtures above still
-- hold by the time the suite gets here.
insert into public.teams (id, name) values
  ('c0000000-0000-0000-0000-0000000000f1','Support Desk');
insert into public.team_members (team_id, user_id) values
  ('c0000000-0000-0000-0000-0000000000f1','33333333-3333-3333-3333-333333333333');

select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}', true);
select pg_temp.check('which teams somebody is on is not everybody''s business',
  (select count(*)::text from public.admin_user_teams(
    '33333333-3333-3333-3333-333333333333')), '0');

update public.profiles set is_admin = true
 where id = '11111111-1111-1111-1111-111111111111';
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);

select pg_temp.check('an administrator can see which teams somebody is on',
  (select count(*)::text from public.admin_user_teams(
    '33333333-3333-3333-3333-333333333333') where team_name = 'Support Desk'),
  '1');
select pg_temp.check('and somebody on nothing comes back empty rather than absent',
  (select count(*)::text from public.admin_user_teams(
    '44444444-4444-4444-4444-444444444444')), '0');

update public.profiles set is_admin = false
 where id = '11111111-1111-1111-1111-111111111111';
select pg_temp.check('and it stops answering the moment they stand down',
  (select count(*)::text from public.admin_user_teams(
    '33333333-3333-3333-3333-333333333333')), '0');


-- Growing a page a piece at a time ----------------------------------------------

-- A file too big to pass through one call arrives in several. Who may do it is
-- the policy's decision and nothing else's, which is what these check.

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('the author adds to the end of their own page',
  public.append_to_node('b0000000-0000-0000-0000-00000000fb01', ' and more')::text,
  '28');

select set_config('request.jwt.claims','{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}', true);
select pg_temp.check('somebody who may only read cannot',
  pg_temp.refusal($q$select public.append_to_node('b0000000-0000-0000-0000-00000000fb01', 'x')$q$),
  'Only somebody who can edit this page can add to it.');

select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}', true);
select pg_temp.check('and somebody who cannot read it is told there is no such page',
  pg_temp.refusal($q$select public.append_to_node('b0000000-0000-0000-0000-00000000fb01', 'x')$q$),
  'Not found.');

select set_config('request.jwt.claims','{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}', true);
select pg_temp.check('and a page cannot be grown past what one can hold',
  pg_temp.refusal($q$select public.append_to_node('b0000000-0000-0000-0000-00000000fb01', repeat('x', 1000001))$q$),
  'That would take the page past 1000kB, which is as much as one page can hold.');

reset role;
select set_config('request.jwt.claims', '', true);

-- A space of your own -----------------------------------------------------------

-- Signing up used to provision a profile and stop, so the first thing somebody
-- saw was an empty list and a form asking them to invent a name and an address
-- before they had written anything. Everybody gets one now, and these check the
-- three things that could go wrong with that: that it happens, that it is
-- private, and that two people cannot collide over an address.

insert into auth.users (id, instance_id, aud, role, email) values
  ('77777777-7777-7777-7777-777777777777','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','newstarter@test.local');

select pg_temp.check('signing up comes with a space',
  (select count(*)::text from public.spaces
    where owner_id = '77777777-7777-7777-7777-777777777777' and is_personal), '1');
select pg_temp.check('addressed by the name they signed up with',
  (select slug from public.spaces
    where owner_id = '77777777-7777-7777-7777-777777777777'), 'newstarter');
select pg_temp.check('and it has a front page like any other space',
  (select count(*)::text from public.nodes n
    join public.spaces s on s.id = n.space_id
    where s.owner_id = '77777777-7777-7777-7777-777777777777' and n.path = 'index'),
  '1');

-- The same name at another company. A slug is unique across the product, so the
-- second one cannot have the first one's address and must not fail to get one.
insert into auth.users (id, instance_id, aud, role, email) values
  ('88888888-8888-8888-8888-888888888888','00000000-0000-0000-0000-000000000000',
   'authenticated','authenticated','newstarter@elsewhere.local');

select pg_temp.check('a second person of the same name gets their own address',
  (select slug from public.spaces
    where owner_id = '88888888-8888-8888-8888-888888888888'), 'newstarter-2');

-- Private, which is the whole reason for it.
select pg_temp.check('and nobody else can read what is in it',
  public.can_read('77777777-7777-7777-7777-777777777777',
    (select n.id from public.nodes n
      join public.spaces s on s.id = n.space_id
      where s.owner_id = '88888888-8888-8888-8888-888888888888'))::text,
  'false');
select pg_temp.check('while its owner can',
  public.can_read('88888888-8888-8888-8888-888888888888',
    (select n.id from public.nodes n
      join public.spaces s on s.id = n.space_id
      where s.owner_id = '88888888-8888-8888-8888-888888888888'))::text,
  'true');

-- Asked for again, which the backfill does to everybody including the people
-- who already have one.
select public.create_personal_space('77777777-7777-7777-7777-777777777777');
select pg_temp.check('asking twice does not make a second one',
  (select count(*)::text from public.spaces
    where owner_id = '77777777-7777-7777-7777-777777777777'), '1');

select set_config('request.jwt.claims', '', true);


rollback;
