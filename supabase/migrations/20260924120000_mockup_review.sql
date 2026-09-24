-- Mockup review: reviewing HTML mockups element by element, and handing an
-- approved flow to whoever builds it.
--
-- The mockup's HTML is the spec. Everything it says about itself (ids, slugs,
-- bindings, actions, destinations, states) is in its data-pi-* attributes, and
-- nothing here keeps a second copy of that which could disagree. What lives in
-- the database is what is not the design: an index of each version for search
-- and anchoring (a cache, rebuildable from the bytes), the conversation about
-- it, the gaps somebody agreed to accept, and the record of an approval.
--
-- No new permission model. Every table below is exactly as readable as the page
-- or folder it belongs to, through the same can_read everything else uses.

-- A folder can be a flow ---------------------------------------------------------

alter table public.nodes
  add column if not exists is_flow boolean not null default false;

alter table public.nodes
  drop constraint if exists nodes_flow_is_a_folder;
alter table public.nodes
  add constraint nodes_flow_is_a_folder check (not is_flow or kind = 'folder') not valid;
alter table public.nodes validate constraint nodes_flow_is_a_folder;

-- What each version of a mockup was ----------------------------------------------

/**
 * One row per saved version of an HTML page.
 *
 * An HTML page's bytes are a file, not the content column, so the revision
 * history never held them: the file was overwritten in place. This keeps each
 * version's bytes (snapshot_key, in the private artifacts bucket) and what was
 * read out of them. Comparing versions, viewing the one a comment was made on,
 * and freezing an approval all need both.
 *
 * The index columns are a cache. Losing one loses nothing: it is re-read from
 * the snapshot.
 */
create table if not exists public.mockup_revisions (
  id uuid primary key default gen_random_uuid(),
  node_id uuid not null references public.nodes (id) on delete cascade,
  content_version integer not null,
  snapshot_key text,
  screen jsonb not null default '{}'::jsonb,
  nodes jsonb not null default '[]'::jsonb,
  findings jsonb not null default '[]'::jsonb,
  -- The CSS and unidentified controls, for the checks that run over a flow.
  extras jsonb not null default '{}'::jsonb,
  author_id uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (node_id, content_version)
);

create index if not exists mockup_revisions_node_idx
  on public.mockup_revisions (node_id, content_version desc);

alter table public.mockup_revisions enable row level security;

drop policy if exists mockup_revisions_select_readable on public.mockup_revisions;
create policy mockup_revisions_select_readable on public.mockup_revisions
  for select using (public.can_read(node_id));

-- Written by the save path, as the person saving. Whoever may change the page
-- may record what it now says; nobody else may write anything about it.
drop policy if exists mockup_revisions_insert_editor on public.mockup_revisions;
create policy mockup_revisions_insert_editor on public.mockup_revisions
  for insert with check (public.can_edit(node_id));

drop policy if exists mockup_revisions_update_editor on public.mockup_revisions;
create policy mockup_revisions_update_editor on public.mockup_revisions
  for update using (public.can_edit(node_id)) with check (public.can_edit(node_id));

-- Comments: where on the mockup, and where they have got to ----------------------

do $$
begin
  if not exists (select 1 from pg_type where typname = 'comment_status') then
    create type public.comment_status as enum ('open', 'addressed', 'resolved', 'wont_fix');
  end if;
end $$;

alter table public.comments
  -- What it is about: a node, a run of words in one, an area, or an element
  -- without an id. Null for a comment about the page as a whole.
  add column if not exists anchor jsonb,
  -- The version it was made on, so it can be shown where it was.
  add column if not exists content_version integer,
  add column if not exists status public.comment_status,
  add column if not exists status_note text,
  add column if not exists status_version integer,
  add column if not exists status_by uuid references public.profiles (id) on delete set null,
  add column if not exists status_at timestamptz;

/**
 * Keeps status and anchor honest.
 *
 * The update policy on comments lets an author or an admin change their row,
 * which was fine while a row was only its words. Status now carries rules (the
 * author says addressed, somebody else says resolved) and a policy cannot tell
 * one column from another, so these columns move only through the functions
 * below, which set a flag for the length of their own statement.
 */
create or replace function public.guard_comment_review()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.status := case when new.parent_id is null then 'open'::public.comment_status else null end;
    new.status_note := null;
    new.status_version := null;
    new.status_by := null;
    new.status_at := null;
    return new;
  end if;

  if (new.status, new.status_note, new.status_version, new.status_by, new.status_at)
       is distinct from
     (old.status, old.status_note, old.status_version, old.status_by, old.status_at)
     and coalesce(current_setting('postit.comment_status', true), '') <> 'on' then
    raise exception 'a comment''s status changes only through set_comment_status'
      using errcode = 'insufficient_privilege';
  end if;

  if (new.anchor, new.content_version) is distinct from (old.anchor, old.content_version)
     and coalesce(current_setting('postit.comment_anchor', true), '') <> 'on' then
    raise exception 'a comment''s anchor changes only through reattach_comment'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_review_guard on public.comments;
create trigger comments_review_guard
  before insert or update on public.comments
  for each row execute function public.guard_comment_review();

/**
 * Moves a comment through review.
 *
 *   addressed  the page's author (Claude Design acting for them included), with
 *              a note and the version that addresses it
 *   resolved   somebody other than the author, confirming it
 *   open       somebody other than the author, reopening it
 *   wont_fix   the author or a reviewer, with a note saying why
 *
 * The author is the page's creator, or its space's owner when the creator's
 * account is gone: the same rule can_ask_for_review applies.
 */
create or replace function public.set_comment_status(
  p_comment_id uuid,
  p_status public.comment_status,
  p_note text default null,
  p_version integer default null
)
returns public.comment_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_node uuid;
  v_parent uuid;
  v_deleted timestamptz;
  v_is_author boolean;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  select c.node_id, c.parent_id, c.deleted_at
    into v_node, v_parent, v_deleted
  from public.comments c
  where c.id = p_comment_id;

  if v_node is null or (select auth.uid()) is null or not public.can_read(v_node) then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;

  if v_parent is not null then
    raise exception 'Only a comment, not a reply, has a status.' using errcode = 'check_violation';
  end if;
  if v_deleted is not null then
    raise exception 'That comment was withdrawn.' using errcode = 'check_violation';
  end if;

  v_is_author := public.can_ask_for_review(v_node);

  if p_status = 'addressed' then
    if not v_is_author then
      raise exception 'Only the author of this page can mark a comment addressed.' using errcode = 'insufficient_privilege';
    end if;
    if v_note is null or p_version is null then
      raise exception 'Say how it was addressed, and in which version.' using errcode = 'check_violation';
    end if;
  elsif p_status in ('resolved', 'open') then
    if v_is_author then
      raise exception 'Somebody other than the author confirms a comment is resolved, or reopens it.' using errcode = 'insufficient_privilege';
    end if;
  elsif p_status = 'wont_fix' then
    if v_note is null then
      raise exception 'Say why it will not be fixed.' using errcode = 'check_violation';
    end if;
  end if;

  perform set_config('postit.comment_status', 'on', true);
  update public.comments
     set status = p_status,
         status_note = case when p_status in ('addressed', 'wont_fix') then v_note else coalesce(v_note, status_note) end,
         status_version = case when p_status = 'addressed' then p_version else status_version end,
         status_by = (select auth.uid()),
         status_at = now()
   where id = p_comment_id;
  perform set_config('postit.comment_status', 'off', true);

  return p_status;
end;
$$;

revoke all on function public.set_comment_status(uuid, public.comment_status, text, integer) from public, anon;
grant execute on function public.set_comment_status(uuid, public.comment_status, text, integer)
  to authenticated, service_role;

/**
 * Points a comment at a different place, for one left orphaned when the node it
 * was about disappeared. Its author may, and so may whoever may edit the page.
 */
create or replace function public.reattach_comment(p_comment_id uuid, p_anchor jsonb, p_version integer default null)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_node uuid;
  v_author uuid;
begin
  select node_id, author_id into v_node, v_author
  from public.comments where id = p_comment_id and parent_id is null;

  if v_node is null or (select auth.uid()) is null or not public.can_read(v_node) then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;

  if v_author is distinct from (select auth.uid()) and not public.can_edit(v_node) then
    raise exception 'Only its author, or somebody who can edit the page, can move a comment.' using errcode = 'insufficient_privilege';
  end if;

  perform set_config('postit.comment_anchor', 'on', true);
  update public.comments
     set anchor = coalesce(p_anchor, '{}'::jsonb) || jsonb_build_object('reattached_by', (select auth.uid()), 'reattached_at', now()),
         content_version = coalesce(p_version, content_version)
   where id = p_comment_id;
  perform set_config('postit.comment_anchor', 'off', true);
end;
$$;

revoke all on function public.reattach_comment(uuid, jsonb, integer) from public, anon;
grant execute on function public.reattach_comment(uuid, jsonb, integer) to authenticated, service_role;

-- The page's comments, now with where and how far along. The return type
-- changes, so the old one has to go first.
drop function if exists public.node_comments(uuid);

create or replace function public.node_comments(p_node_id uuid)
returns table (
  id uuid,
  parent_id uuid,
  author_id uuid,
  author_email text,
  body text,
  created_at timestamptz,
  deleted boolean,
  anchor jsonb,
  content_version integer,
  status public.comment_status,
  status_note text,
  status_version integer,
  status_by_email text,
  status_at timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    c.id,
    c.parent_id,
    c.author_id,
    p.email,
    c.body,
    c.created_at,
    c.deleted_at is not null,
    c.anchor,
    c.content_version,
    c.status,
    c.status_note,
    c.status_version,
    sb.email,
    c.status_at
  from public.comments c
  join public.profiles p on p.id = c.author_id
  left join public.profiles sb on sb.id = c.status_by
  where c.node_id = p_node_id
    and (select auth.uid()) is not null
    and public.can_read(p_node_id)
  order by c.created_at;
$$;

revoke all on function public.node_comments(uuid) from public, anon;
grant execute on function public.node_comments(uuid) to authenticated, service_role;

-- Gaps somebody agreed to accept -------------------------------------------------

create table if not exists public.mockup_waivers (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.nodes (id) on delete cascade,
  check_key text not null,
  message text not null default '',
  note text not null,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (folder_id, check_key),
  constraint mockup_waivers_note_not_blank check (length(btrim(note)) > 0)
);

alter table public.mockup_waivers enable row level security;

drop policy if exists mockup_waivers_select_readable on public.mockup_waivers;
create policy mockup_waivers_select_readable on public.mockup_waivers
  for select using (public.can_read(folder_id));

drop policy if exists mockup_waivers_insert_editor on public.mockup_waivers;
create policy mockup_waivers_insert_editor on public.mockup_waivers
  for insert with check (public.can_edit(folder_id) and created_by = (select auth.uid()));

drop policy if exists mockup_waivers_delete_editor on public.mockup_waivers;
create policy mockup_waivers_delete_editor on public.mockup_waivers
  for delete using (public.can_edit(folder_id));

-- Approving a whole flow ---------------------------------------------------------

/**
 * A flow's approval: which version of every screen and token file was agreed.
 *
 * Nothing invalidates a row. Whether an approval still stands is a comparison
 * made on reading it, between the versions it froze and the versions the pages
 * are at now, so an edit un-approves the flow without anything having to
 * remember to.
 */
create table if not exists public.flow_approvals (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null references public.nodes (id) on delete cascade,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz not null default now(),
  members jsonb not null,
  tokens jsonb not null default '[]'::jsonb,
  waivers jsonb not null default '[]'::jsonb
);

create index if not exists flow_approvals_folder_idx
  on public.flow_approvals (folder_id, approved_at desc);

alter table public.flow_approvals enable row level security;

drop policy if exists flow_approvals_select_readable on public.flow_approvals;
create policy flow_approvals_select_readable on public.flow_approvals
  for select using (public.can_read(folder_id));

-- No insert policy: approve_flow is the only way in.

/**
 * Approves a flow, freezing what was approved.
 *
 * Refuses unless every screen and token page in it is approved at its current
 * version and no comment on any of them is still open or addressed. The person
 * who made the flow cannot approve it, for the same reason an author cannot
 * approve their own page.
 */
create or replace function public.approve_flow(p_folder_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_folder public.nodes%rowtype;
  v_owner uuid;
  v_member record;
  v_open integer;
  v_members jsonb;
  v_tokens jsonb;
  v_waivers jsonb;
  v_id uuid;
begin
  select * into v_folder from public.nodes where id = p_folder_id;

  if v_folder.id is null or (select auth.uid()) is null or not public.can_read(p_folder_id) then
    raise exception 'not found' using errcode = 'no_data_found';
  end if;

  if not v_folder.is_flow then
    raise exception 'This folder is not a flow.' using errcode = 'check_violation';
  end if;

  if not public.in_space(v_folder.space_id) then
    raise exception 'Only somebody in this space can approve its flows.' using errcode = 'insufficient_privilege';
  end if;

  select owner_id into v_owner from public.spaces where id = v_folder.space_id;
  if coalesce(v_folder.created_by, v_owner) = (select auth.uid()) then
    raise exception 'Somebody other than the person who made this flow has to approve it.' using errcode = 'insufficient_privilege';
  end if;

  if not exists (
    select 1 from public.nodes
    where parent_id = p_folder_id and kind = 'file' and content_type = 'html'
  ) then
    raise exception 'This flow has no screens yet.' using errcode = 'check_violation';
  end if;

  for v_member in
    select n.id, n.name, n.review_status, n.review_version, n.content_version
    from public.nodes n
    where n.parent_id = p_folder_id and n.kind = 'file' and n.content_type in ('html', 'json')
  loop
    if v_member.review_status is distinct from 'approved'
       or v_member.review_version is distinct from v_member.content_version then
      raise exception '% is not approved at its current version.', v_member.name using errcode = 'check_violation';
    end if;
  end loop;

  select count(*) into v_open
  from public.comments c
  join public.nodes n on n.id = c.node_id
  where n.parent_id = p_folder_id
    and c.parent_id is null
    and c.deleted_at is null
    and c.status in ('open', 'addressed');

  if v_open > 0 then
    raise exception '% comment% still open or waiting to be confirmed.', v_open, case when v_open = 1 then ' is' else 's are' end
      using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'node_id', n.id,
           'name', n.name,
           'path', n.path,
           'content_version', n.content_version,
           'snapshot_key', r.snapshot_key
         ) order by n.name), '[]'::jsonb)
    into v_members
  from public.nodes n
  left join public.mockup_revisions r
    on r.node_id = n.id and r.content_version = n.content_version
  where n.parent_id = p_folder_id and n.kind = 'file' and n.content_type = 'html';

  if exists (select 1 from jsonb_array_elements(v_members) m where m->>'snapshot_key' is null) then
    raise exception 'A screen has no stored copy of its current version. Open it once in review, then approve again.'
      using errcode = 'check_violation';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'node_id', n.id,
           'name', n.name,
           'content_version', n.content_version,
           'content', n.content
         ) order by n.name), '[]'::jsonb)
    into v_tokens
  from public.nodes n
  where n.parent_id = p_folder_id and n.kind = 'file' and n.content_type = 'json';

  select coalesce(jsonb_agg(jsonb_build_object(
           'key', w.check_key,
           'message', w.message,
           'note', w.note,
           'by', p.email
         ) order by w.created_at), '[]'::jsonb)
    into v_waivers
  from public.mockup_waivers w
  left join public.profiles p on p.id = w.created_by
  where w.folder_id = p_folder_id;

  insert into public.flow_approvals (folder_id, approved_by, members, tokens, waivers)
  values (p_folder_id, (select auth.uid()), v_members, v_tokens, v_waivers)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.approve_flow(uuid) from public, anon;
grant execute on function public.approve_flow(uuid) to authenticated, service_role;

/** The latest approval of a flow, with who gave it. */
create or replace function public.flow_approval(p_folder_id uuid)
returns table (
  id uuid,
  approved_by_email text,
  approved_at timestamptz,
  members jsonb,
  tokens jsonb,
  waivers jsonb
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select a.id, p.email, a.approved_at, a.members, a.tokens, a.waivers
  from public.flow_approvals a
  left join public.profiles p on p.id = a.approved_by
  where a.folder_id = p_folder_id
    and (select auth.uid()) is not null
    and public.can_read(p_folder_id)
  order by a.approved_at desc
  limit 1;
$$;

revoke all on function public.flow_approval(uuid) from public, anon;
grant execute on function public.flow_approval(uuid) to authenticated, service_role;

/** Who wrote each waiver, for showing it; profiles are private otherwise. */
create or replace function public.flow_waivers(p_folder_id uuid)
returns table (id uuid, check_key text, message text, note text, by_email text, created_at timestamptz)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select w.id, w.check_key, w.message, w.note, p.email, w.created_at
  from public.mockup_waivers w
  left join public.profiles p on p.id = w.created_by
  where w.folder_id = p_folder_id
    and (select auth.uid()) is not null
    and public.can_read(p_folder_id)
  order by w.created_at;
$$;

revoke all on function public.flow_waivers(uuid) from public, anon;
grant execute on function public.flow_waivers(uuid) to authenticated, service_role;
