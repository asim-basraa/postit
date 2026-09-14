-- A space of your own, from the moment you have an account.
--
-- Signing up provisioned a profile and stopped, so the first thing a new person
-- saw was an empty list and a form asking them to invent a name and an address
-- before they had written anything. For a product whose whole subject is who
-- can read what, somewhere that is yours alone is the right first thing to own,
-- and nobody should have to think of it themselves.
--
-- Marked rather than merely owned, because "the space that is yours" is a fact
-- worth being able to state: it is what stops a second one being made, and what
-- lets a screen say which one it is.

alter table public.spaces
  add column if not exists is_personal boolean not null default false;

-- One each. The index is the rule rather than a convention the code remembers.
create unique index if not exists spaces_one_personal_each
  on public.spaces (owner_id) where is_personal;

/**
 * Makes somebody the space that is theirs, if they have not got one.
 *
 * The address comes from the part of their email before the @, which is the
 * only name this product knows them by, slugified by the same function every
 * other slug goes through and made unique by a suffix when it is taken. That
 * leaves `/s/asim` for the first Asim and `/s/asim-2` for the second, which is
 * the ordinary way of it and better than inventing something nobody would
 * guess.
 *
 * Idempotent on purpose: it is called at signup, again over everybody who
 * signed up before it existed, and again by home_space_for whenever somebody's
 * work is sent back to them. None of those may produce a second one.
 *
 * The front page is deliberately not the tour of the syntax a new project
 * space gets. This one has a single job, which is to say plainly that nobody
 * else can see this — the question a private space raises, and the reason to
 * trust it.
 */
create or replace function public.create_personal_space(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_handle text;
  v_label text;
  v_slug text;
  v_n integer := 1;
  v_space uuid;
begin
  select id into v_space
  from public.spaces
  where owner_id = p_user_id and is_personal;
  if found then
    return v_space;
  end if;

  select email into v_email from public.profiles where id = p_user_id;
  if v_email is null then
    return null;
  end if;

  v_handle := public.slugify(split_part(v_email, '@', 1));
  if v_handle = 'untitled' then
    v_handle := 'space';
  end if;

  -- "asim.basraa" is a name with a full stop in it, so it becomes two words.
  v_label := initcap(replace(v_handle, '-', ' '));

  -- A space slug is unique across the whole product, not within an owner.
  v_slug := v_handle;
  while exists (select 1 from public.spaces where slug = v_slug) loop
    v_n := v_n + 1;
    v_slug := v_handle || '-' || v_n;
  end loop;

  insert into public.spaces (slug, name, owner_id, is_personal)
  values (v_slug, v_label, p_user_id, true)
  returning id into v_space;

  -- Every space has a home page; /s/<slug> resolves to it. Passed explicitly,
  -- as the application does: the trigger that derives a path needs a parent,
  -- and this has none.
  insert into public.nodes
    (space_id, parent_id, kind, name, slug, path, content, created_by)
  values (
    v_space, null, 'file', v_label, 'index', 'index',
    'This space is yours. Nobody else can see anything in it, and nothing here'
      || chr(10) ||
    'is shared until you share it: a page you have not given somebody is'
      || chr(10) ||
    'indistinguishable, to them, from a page that does not exist.'
      || chr(10) || chr(10) ||
    'Write what you like here. Notes to yourself, drafts, things not ready to'
      || chr(10) ||
    'be looked at. When one of them is ready, share the page, or the folder it'
      || chr(10) ||
    'is in, with a person, with a team, or with everybody.'
      || chr(10),
    p_user_id
  );

  return v_space;
end;
$$;

/**
 * Where somebody's work goes when it is sent home.
 *
 * Recreated to mean the space that is theirs, rather than the oldest one they
 * happen to own. Those were the same thing while the only way to have a space
 * was to make one; now that everybody has a personal space, "the oldest" would
 * often be a project they own with other people in it, and somebody's own work
 * coming home belongs somewhere that is only theirs.
 *
 * It also stops this being a second implementation of "make somebody a space",
 * which is what it was: the same slug rule, the same suffix loop, and a second
 * copy to keep in step.
 */
create or replace function public.home_space_for(p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_space uuid;
begin
  v_space := public.create_personal_space(p_user_id);
  if v_space is null then
    raise exception 'no such account' using errcode = 'no_data_found';
  end if;
  return v_space;
end;
$$;

/**
 * Signing up now comes with one.
 *
 * Wrapped, because a failure here must never cost somebody their account. A
 * missing space is a thing they can make for themselves in ten seconds; a
 * failed signup is a person who cannot get in at all.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;

  -- Everything an invitation promised, delivered the moment the account comes
  -- into being. Unchanged, and restated here because this function is being
  -- replaced rather than added to.
  insert into public.grants (node_id, grantee_type, grantee_id, role)
  select i.node_id, 'user', new.id, i.role
  from public.invitations i
  where lower(i.email) = lower(new.email)
    and i.accepted_at is null
    and i.expires_at > now()
    and i.node_id is not null
  on conflict (node_id, grantee_type, grantee_id) where grantee_id is not null
  do update set role = excluded.role;

  -- Single-use: marking it accepted here means the same invitation cannot
  -- admit a second account.
  update public.invitations
     set accepted_at = now()
   where lower(email) = lower(new.email)
     and accepted_at is null;

  -- And the new part. Wrapped, because a failure here must never cost somebody
  -- their account: a missing space is something they can make in ten seconds,
  -- a failed signup is a person who cannot get in at all.
  begin
    perform public.create_personal_space(new.id);
  exception when others then
    raise warning 'no personal space for %: %', new.email, sqlerrm;
  end;

  return new;
end;
$$;

-- Everybody who signed up before this existed. Idempotent, so running it again
-- makes nothing.
do $$
declare
  v_id uuid;
begin
  for v_id in select id from public.profiles loop
    begin
      perform public.create_personal_space(v_id);
    exception when others then
      raise warning 'no personal space for %: %', v_id, sqlerrm;
    end;
  end loop;
end $$;

revoke all on function public.create_personal_space(uuid) from public, anon, authenticated;
grant execute on function public.create_personal_space(uuid) to service_role;
revoke all on function public.home_space_for(uuid) from public, anon, authenticated;
