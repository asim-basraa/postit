-- Two rules the first version of this got wrong, and one is the point of the
-- feature.
--
-- Asking for a review was gated on being able to edit the page, which is the
-- power to change it rather than the standing to submit it. In a space whose
-- members all hold editor, that meant anybody could put somebody else's
-- half-finished page up for review. It belongs to whoever wrote it.
--
-- And approving was open to anybody in the space, including the person who
-- asked. A review one person can start and finish on their own is not a review;
-- it is a button that says Approved.

/**
 * Whether the caller may put this page up for review, or take it back down.
 *
 * Its author, and nobody else. The one exception is work whose author is gone,
 * which the space's owner has the last word on — the same exception, for the
 * same reason, that lets them delete it.
 */
create or replace function public.can_ask_for_review(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select auth.uid()) is not null
    and public.can_read(p_node_id)
    and exists (
      select 1
      from public.nodes n
      join public.spaces s on s.id = n.space_id
      where n.id = p_node_id
        and n.kind = 'file'
        and (
          n.created_by = (select auth.uid())
          or (n.created_by is null and s.owner_id = (select auth.uid()))
        )
    ),
    false
  );
$$;

/**
 * Whether the caller may approve this page.
 *
 * Anybody in the space it lives in, except two people: whoever wrote it, and
 * whoever asked for the review. Usually the same person, and the exception is
 * the whole substance of the flow — an approval is somebody else agreeing, and
 * one you can give yourself records nothing.
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
    )
    and not exists (
      select 1 from public.nodes n
      where n.id = p_node_id
        and (
          n.created_by = (select auth.uid())
          or n.review_by = (select auth.uid())
        )
    ),
    false
  );
$$;

/**
 * Moves a page through the review flow, or out of it.
 *
 * Recreated for the two rules above. The refusals name which of them stopped
 * you, because a caller looking at a page they may read learns nothing from
 * being told why a button on it is not theirs, and learns a great deal from
 * being told plainly.
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
  v_author uuid;
  v_asked_by uuid;
begin
  select n.kind, n.review_status, n.created_by, n.review_by
    into v_kind, v_current, v_author, v_asked_by
  from public.nodes n
  where n.id = p_node_id and public.can_read(n.id);

  if not found then
    raise exception 'Not found.';
  end if;

  if v_kind <> 'file' then
    raise exception 'Only a page can be reviewed.';
  end if;

  if p_status = 'approved' then
    if v_current is distinct from 'in_review' then
      raise exception 'This page is not under review.';
    end if;
    if v_author = (select auth.uid()) then
      raise exception 'You cannot approve your own page.';
    end if;
    if v_asked_by = (select auth.uid()) then
      raise exception 'You cannot approve a page you sent for review.';
    end if;
    if not public.can_approve(p_node_id) then
      raise exception 'Only somebody in this space can approve a page in it.';
    end if;
  elsif not public.can_ask_for_review(p_node_id) then
    raise exception 'Only the person who wrote this can ask for it to be reviewed.';
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

/** Recreated so the screen offers exactly what the rules above allow. */
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
    coalesce(public.can_ask_for_review(n.id), false),
    coalesce(n.review_status = 'in_review' and public.can_approve(n.id), false)
  from public.nodes n
  left join public.profiles p on p.id = n.review_by
  where n.id = p_node_id
    and public.can_read(n.id)
    and (select auth.uid()) is not null;
$$;

revoke all on function public.can_ask_for_review(uuid) from public, anon;
grant execute on function public.can_ask_for_review(uuid)
  to authenticated, service_role;

-- Growing a page a piece at a time ------------------------------------------

/**
 * Adds text to the end of a page.
 *
 * For the one case nothing else covers: a file too large to pass through a
 * single call. An agent holding 465kB of HTML cannot put it in one tool
 * argument, and the answer everybody reaches for — a signed URL and a direct
 * POST — means a second door onto this data, with its own authentication, its
 * own allowlist to get added to, and its own way of being wrong. This is the
 * same door, used more than once.
 *
 * SECURITY INVOKER, deliberately: the policy on nodes is what decides whether
 * the caller may write here, exactly as it does for an ordinary save. Nothing
 * about who may do this is written twice.
 *
 * No version guard, because appending has no lost update to guard against: two
 * appends land one after the other rather than one on top of the other. Each is
 * a save, so each leaves a revision, and the history reads as the file arriving
 * in the order it arrived.
 */
create or replace function public.append_to_node(p_node_id uuid, p_text text)
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_len integer;
  v_have integer;
begin
  update public.nodes n
     set content = coalesce(n.content, '') || p_text,
         content_version = n.content_version + 1,
         updated_at = now()
   where n.id = p_node_id
     -- The same ceiling an upload gets. Kept here because this is the only way
     -- to grow a page without holding all of it somewhere first, and a limit
     -- that lives only in the client is not a limit. See MAX_UPLOAD_BYTES in
     -- lib/uploads.ts, which must say the same number.
     and octet_length(coalesce(n.content, '')) + octet_length(p_text) <= 1000000
  returning octet_length(n.content) into v_len;

  if v_len is not null then
    return v_len;
  end if;

  -- Nothing was written. Which of the three reasons it was decides what to say,
  -- and the first of them must give nothing away.
  select octet_length(coalesce(n.content, '')) into v_have
  from public.nodes n where n.id = p_node_id;

  if v_have is null then
    raise exception 'Not found.';
  end if;

  if v_have + octet_length(p_text) > 1000000 then
    raise exception
      'That would take the page past 1000kB, which is as much as one page can hold.';
  end if;

  raise exception 'Only somebody who can edit this page can add to it.';
end;
$$;

revoke all on function public.append_to_node(uuid, text) from public, anon;
grant execute on function public.append_to_node(uuid, text)
  to authenticated, service_role;
