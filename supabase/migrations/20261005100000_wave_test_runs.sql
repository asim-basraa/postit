-- End-to-end test runs, and a feature approved only after one passes.
--
-- Wave Test (a skill, run on the engineer's machine) plays a feature's
-- Gherkin against its prototype and records the run here: passed or not, and
-- the versions it ran (every screen, and the Gherkin page). A feature is
-- approved only when its Gherkin is approved at its current version and the
-- latest run against the prototype passed on exactly the versions being
-- approved. Nothing invalidates a run: whether it still counts is a
-- comparison with the versions as they are now, like an approval.

-- Host hook: a feature's Gherkin page (its tests/flow-feature) -------------------

create or replace function public.wave_flow_test_page(p_flow_id uuid)
returns table (id uuid, content_version integer, approved_current boolean)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.id, n.content_version,
         coalesce(n.review_status = 'approved' and n.review_version = n.content_version, false)
  from public.nodes t
  join public.nodes n on n.parent_id = t.id
  where t.parent_id = p_flow_id
    and t.kind = 'folder'
    and t.slug = 'tests'
    and n.kind = 'file'
    and n.slug = 'flow-feature'
    and (select auth.uid()) is not null
    and public.can_read(p_flow_id)
  limit 1
$$;

-- >>> wave test runs

-- Test runs ----------------------------------------------------------------------

create table if not exists public.wave_test_runs (
  id uuid primary key default gen_random_uuid(),
  flow_id uuid not null,
  run_by uuid,
  ran_at timestamptz not null default now(),
  -- 'prototype', or the address of the app the run was against.
  target text not null,
  passed boolean not null,
  steps integer not null default 0,
  failed integer not null default 0,
  -- The versions it ran: [{screen_id, content_version}] and {id, content_version}.
  members jsonb not null,
  feature jsonb,
  -- The run's report page.
  report_id uuid,
  constraint wave_test_runs_target_not_blank check (length(btrim(target)) > 0)
);

create index if not exists wave_test_runs_flow_idx
  on public.wave_test_runs (flow_id, target, ran_at desc);

alter table public.wave_test_runs enable row level security;

drop policy if exists wave_test_runs_select on public.wave_test_runs;
create policy wave_test_runs_select on public.wave_test_runs
  for select using (public.wave_can_read(flow_id));

-- No insert policy: wave_record_test_run is the only way in.

/** Records a run of a feature's end-to-end tests, at the versions the feature has now. */
create or replace function public.wave_record_test_run(
  p_flow_id uuid,
  p_target text,
  p_passed boolean,
  p_steps integer,
  p_failed integer,
  p_report_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := public.wave_current_user();
  v_members jsonb;
  v_feature jsonb;
  v_id uuid;
begin
  if v_user is null or not public.wave_can_read(p_flow_id) then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;
  if not public.wave_can_edit(p_flow_id) then
    raise exception 'Only somebody who can edit this feature can record its test runs.' using errcode = 'insufficient_privilege';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('screen_id', m.id, 'content_version', m.content_version) order by m.id), '[]'::jsonb)
    into v_members
  from public.wave_flow_members(p_flow_id) m
  where m.kind = 'screen';

  select jsonb_build_object('id', p.id, 'content_version', p.content_version)
    into v_feature
  from public.wave_flow_test_page(p_flow_id) p;

  insert into public.wave_test_runs (flow_id, run_by, target, passed, steps, failed, members, feature, report_id)
  values (p_flow_id, v_user, coalesce(nullif(btrim(p_target), ''), 'prototype'), p_passed, greatest(coalesce(p_steps, 0), 0), greatest(coalesce(p_failed, 0), 0), v_members, v_feature, p_report_id)
  returning id into v_id;

  return v_id;
end;
$$;

/**
 * The latest run against a target, and whether it is current: run on the
 * versions every screen and the Gherkin have now.
 */
create or replace function public.wave_latest_test_run(p_flow_id uuid, p_target text default 'prototype')
returns table (
  id uuid,
  ran_at timestamptz,
  run_by_email text,
  target text,
  passed boolean,
  steps integer,
  failed integer,
  members jsonb,
  feature jsonb,
  report_id uuid,
  current boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with run as (
    select r.*
    from public.wave_test_runs r
    where r.flow_id = p_flow_id
      and r.target = coalesce(p_target, 'prototype')
      and public.wave_current_user() is not null
      and public.wave_can_read(p_flow_id)
    order by r.ran_at desc
    limit 1
  ),
  now_screens as (
    select m.id, m.content_version from public.wave_flow_members(p_flow_id) m where m.kind = 'screen'
  ),
  now_page as (
    select p.id, p.content_version from public.wave_flow_test_page(p_flow_id) p
  )
  select run.id, run.ran_at, public.wave_user_label(run.run_by), run.target, run.passed, run.steps, run.failed,
         run.members, run.feature, run.report_id,
         (
           jsonb_array_length(run.members) = (select count(*) from now_screens)
           and not exists (
             select 1
             from jsonb_array_elements(run.members) m
             left join now_screens s on s.id = (m->>'screen_id')::uuid
             where s.id is null or s.content_version <> (m->>'content_version')::integer
           )
           and exists (
             select 1 from now_page p
             where run.feature is not null
               and p.id = (run.feature->>'id')::uuid
               and p.content_version = (run.feature->>'content_version')::integer
           )
         ) as current
  from run
$$;

-- What an approval froze of the tests: the Gherkin's version and the run.
alter table public.wave_flow_approvals add column if not exists tests jsonb;

/**
 * Approves a flow, freezing what was approved.
 *
 * Refuses unless the host says this person may, every screen and token file is
 * approved at its current version, no comment is still open or addressed,
 * every screen has a stored copy of its current version, the Gherkin is
 * approved at its current version, and the latest run against the prototype
 * passed on exactly these versions.
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
  v_page record;
  v_run record;
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

  -- The end-to-end tests: the Gherkin approved, and a passing run on these versions.
  select * into v_page from public.wave_flow_test_page(p_flow_id);
  if v_page.id is null then
    raise exception 'This feature has no Gherkin yet (tests/flow-feature). Publish it again and Wave writes it.' using errcode = 'check_violation';
  end if;
  if not coalesce(v_page.approved_current, false) then
    raise exception 'The Gherkin (tests/flow-feature) is not approved at its current version.' using errcode = 'check_violation';
  end if;
  select * into v_run from public.wave_latest_test_run(p_flow_id, 'prototype');
  if v_run.id is null then
    raise exception 'The end-to-end tests have not run on this feature. Run Wave Test, then approve.' using errcode = 'check_violation';
  end if;
  if not coalesce(v_run.current, false) then
    raise exception 'The last end-to-end run was on other versions of the screens or the Gherkin. Run Wave Test again.' using errcode = 'check_violation';
  end if;
  if not v_run.passed then
    raise exception 'The last end-to-end run failed (% of % steps). Fix what it found and run Wave Test again.', v_run.failed, v_run.steps using errcode = 'check_violation';
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

  insert into public.wave_flow_approvals (flow_id, approved_by, members, tokens, waivers, tests)
  values (
    p_flow_id, v_user, v_members, v_tokens, v_waivers,
    jsonb_build_object('feature', jsonb_build_object('id', v_page.id, 'content_version', v_page.content_version), 'run', v_run.id)
  )
  returning id into v_id;

  return v_id;
end;
$$;
-- <<< wave test runs

do $$
declare
  f text;
begin
  foreach f in array array[
    'wave_flow_test_page(uuid)', 'wave_record_test_run(uuid, text, boolean, integer, integer, uuid)',
    'wave_latest_test_run(uuid, text)', 'wave_approve_flow(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated, service_role', f);
  end loop;
end $$;
