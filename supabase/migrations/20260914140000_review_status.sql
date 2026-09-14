-- Asking for a review, and getting one.
--
-- Opt-in, and the column being nullable is how that is said: a page that has
-- never been sent for review has no status at all, not a status called "draft".
-- Most pages will never carry one, and nothing about them should suggest they
-- are waiting for something. The flow exists only for a document whose author
-- decided it needed one.
--
-- This is a label on a document, not a permission. Nothing here decides who may
-- read or write anything: the review state is carried on a node that the same
-- policies protect as before, and a page you cannot read has no review state
-- you can see either.

do $$
begin
  if not exists (select 1 from pg_type where typname = 'review_status') then
    create type public.review_status as enum ('in_review', 'approved');
  end if;
end $$;

alter table public.nodes
  add column if not exists review_status public.review_status,
  -- Who last moved it, and when. Not a history: the interesting question is
  -- "who approved this", asked of the state it is in now, and the revisions
  -- already record what the document said at the time.
  add column if not exists review_by uuid references public.profiles (id) on delete set null,
  add column if not exists review_at timestamptz,
  -- The version that was sent or approved, so an approval can be told from an
  -- approval that has been edited since. An approval is of a document, not of
  -- a name, and silently keeping the badge over changed text would be the one
  -- genuinely misleading thing this feature could do.
  add column if not exists review_version integer;

-- A folder is not a document and cannot be reviewed.
alter table public.nodes
  drop constraint if exists nodes_review_files_only;
alter table public.nodes
  add constraint nodes_review_files_only check (
    review_status is null or kind = 'file'
  ) not valid;
alter table public.nodes validate constraint nodes_review_files_only;

create index if not exists nodes_in_review_idx
  on public.nodes (space_id)
  where review_status = 'in_review';

/**
 * Whether the caller may approve this page.
 *
 * Anybody in the space it lives in: owning it, being a member of it, or being
 * on a team that is a member of it. Reviewing is something colleagues do for
 * each other, so it is not tied to being able to edit — a reviewer who may only
 * read is the ordinary case rather than a special one.
 *
 * The can_read half is not decoration. Without it somebody in the space could
 * approve a page inside it that has never been shared with them, which is both
 * absurd and a way to learn that the page exists.
 */
create or replace function public.can_approve(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select auth.uid()) is not null
    and public.can_read(p_node_id)
    and public.in_space(
      (select n.space_id from public.nodes n where n.id = p_node_id)
    ),
    false
  );
$$;

/**
 * Moves a page through the review flow, or out of it.
 *
 * Three transitions, and they are not the same power:
 *
 *   null -> in_review    the author's: somebody who may edit it asks for one
 *   in_review -> approved anybody in the space, which is the point of the flow
 *   anything -> null      the author's again: withdrawing, or clearing an
 *                         approval that has gone stale
 *
 * SECURITY DEFINER because approving is deliberately weaker than editing. The
 * policy on nodes requires can_edit to write a row, and a reviewer with read
 * access would be refused by it; the checks the flow actually wants are the
 * ones written here.
 *
 * A caller who cannot read the page is told it does not exist, as everywhere
 * else. Past that point the refusals say what they mean: somebody looking at a
 * page they may read learns nothing from being told why a button on it is not
 * for them.
 */
create or replace function public.set_review_status(
  p_node_id uuid,
  p_status public.review_status
)
returns public.review_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_kind text;
  v_current public.review_status;
begin
  select n.kind, n.review_status into v_kind, v_current
  from public.nodes n
  where n.id = p_node_id and public.can_read(n.id);

  if not found then
    raise exception 'Not found.';
  end if;

  if v_kind <> 'file' then
    raise exception 'Only a page can be reviewed.';
  end if;

  if p_status = 'approved' then
    if not public.can_approve(p_node_id) then
      raise exception 'Only somebody in this space can approve a page in it.';
    end if;
    -- Approving something nobody asked to have reviewed is not a review, and
    -- it would let an approval appear on a page whose author never wanted one.
    if v_current is distinct from 'in_review' then
      raise exception 'This page is not under review.';
    end if;
  elsif not public.can_edit(p_node_id) then
    raise exception 'Only somebody who can edit this page can change that.';
  end if;

  update public.nodes n
     set review_status = p_status,
         review_by = case when p_status is null then null else (select auth.uid()) end,
         review_at = case when p_status is null then null else now() end,
         review_version =
           case when p_status is null then null else n.content_version end
   where n.id = p_node_id;

  return p_status;
end;
$$;

/**
 * The review state of one page, and what the caller may do about it.
 *
 * One call rather than three, and read through the same can_read as everything
 * else, so a page you cannot read has no review state to report.
 *
 * Signed-in callers only. The address of whoever approved something is a
 * person's, and a published page is read by the internet.
 */
create or replace function public.node_review(p_node_id uuid)
returns table (
  status public.review_status,
  actor text,
  happened_at timestamptz,
  stale boolean,
  may_ask boolean,
  may_approve boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    n.review_status,
    p.email,
    n.review_at,
    coalesce(
      n.review_status is not null
        and n.content_version > coalesce(n.review_version, n.content_version),
      false
    ),
    coalesce(n.kind = 'file' and public.can_edit(n.id), false),
    coalesce(n.review_status = 'in_review' and public.can_approve(n.id), false)
  from public.nodes n
  left join public.profiles p on p.id = n.review_by
  where n.id = p_node_id
    and public.can_read(n.id)
    and (select auth.uid()) is not null;
$$;

revoke all on function public.can_approve(uuid) from public, anon;
revoke all on function public.set_review_status(uuid, public.review_status)
  from public, anon;
revoke all on function public.node_review(uuid) from public, anon;

grant execute on function public.can_approve(uuid) to authenticated, service_role;
grant execute on function public.set_review_status(uuid, public.review_status)
  to authenticated, service_role;
grant execute on function public.node_review(uuid) to authenticated, service_role;
