-- Wave has moved to a product of its own. What it took with it stays readable
-- here and can no longer be changed, so the two copies cannot drift apart while
-- people try the new one.
--
-- A row in wave_moved freezes a whole space (space_id) or a project and
-- everything under it (project_id). Wave's migration script adds the rows when
-- it copies them, and deleting a row undoes the freeze. Every write that would
-- change a frozen page is refused with the address Wave lives at now: the page
-- itself, its comments and grants, pages added under it, and Wave's own rows
-- for it. Reading is untouched.

create table if not exists public.wave_moved (
  id uuid primary key default gen_random_uuid(),
  space_id uuid references public.spaces (id) on delete cascade,
  project_id uuid references public.nodes (id) on delete cascade,
  moved_to text not null,
  moved_at timestamptz not null default now(),
  constraint wave_moved_one_target check ((space_id is null) <> (project_id is null))
);

alter table public.wave_moved enable row level security;

drop policy if exists wave_moved_select on public.wave_moved;
create policy wave_moved_select on public.wave_moved
  for select to authenticated using (true);

-- Where a node went, or null when it did not move.
create or replace function public.wave_moved_to(p_node uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select m.moved_to
    from public.nodes n
    join public.wave_moved m
      on m.space_id = n.space_id
      or exists (
        select 1 from public.nodes p
         where p.id = m.project_id and p.space_id = n.space_id
           and (n.path = p.path or n.path like p.path || '/%')
      )
   where n.id = p_node
   limit 1;
$$;

create or replace function public.wave_refuse_moved()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row jsonb := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  v_node uuid;
  v_to text;
begin
  if not exists (select 1 from public.wave_moved) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_table_name = 'nodes' then
    -- A new page is frozen by where it is going; a change, by where it is.
    v_node := case when tg_op = 'INSERT' then (v_row ->> 'parent_id')::uuid else (v_row ->> 'id')::uuid end;
    v_to := public.wave_moved_to(v_node);
    if v_to is null and tg_op = 'INSERT' then
      select m.moved_to into v_to from public.wave_moved m where m.space_id = (v_row ->> 'space_id')::uuid;
    end if;
    if v_to is null and tg_op = 'UPDATE' then
      v_to := public.wave_moved_to((v_row ->> 'parent_id')::uuid);
    end if;
  else
    v_node := coalesce(v_row ->> 'node_id', v_row ->> 'screen_id', v_row ->> 'flow_id', v_row ->> 'project_id')::uuid;
    v_to := public.wave_moved_to(v_node);
  end if;

  if v_to is not null then
    raise exception 'Wave has moved to %. This is read-only in Post-it now; make the change in Wave.', v_to
      using errcode = 'P0001', hint = v_to;
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'nodes', 'comments', 'grants', 'wave_screen_versions', 'wave_assets', 'wave_waivers',
    'wave_flow_approvals', 'wave_flow_screens', 'wave_prototype_links', 'wave_test_runs'
  ] loop
    if to_regclass('public.' || v_table) is not null then
      execute format('drop trigger if exists wave_refuse_moved on public.%I', v_table);
      execute format(
        'create trigger wave_refuse_moved before insert or update or delete on public.%I for each row execute function public.wave_refuse_moved()',
        v_table
      );
    end if;
  end loop;
end $$;
