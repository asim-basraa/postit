-- HTML stops being a column and becomes a file with an address.
--
-- The use it is actually put to decided this. These are mockups, and a mockup
-- exists to be sent to somebody: a client, who has no account here and is not
-- going to get one. Keeping the bytes in a column meant the only way to show
-- them one was to make the page public inside Post-it, which is a permission
-- decision standing in for what is really a publishing decision.
--
-- So the bytes go to object storage and the page keeps a token. The token is
-- the address and the address is the permission: anybody holding the link can
-- open it, nobody else can guess it, and taking it away is rotating it.
--
-- Say plainly what that gives up, because it is the one place this product
-- does not hold its own line. Everywhere else, content you may not read is
-- indistinguishable from content that does not exist. An artifact's bytes are
-- not: they are readable by anybody the link reaches, for as long as the token
-- stands, whatever the page's sharing says. That is the point of it, and it is
-- why the screen says so where somebody is about to hand the link over.

alter table public.nodes
  -- Where the bytes are, in the artifacts bucket. Null for every page whose
  -- content is in the column, which is every page but an HTML one.
  add column if not exists artifact_key text,
  -- What the public address carries. Unique, unguessable, and rotatable.
  add column if not exists artifact_token text;

create unique index if not exists nodes_artifact_token_idx
  on public.nodes (artifact_token) where artifact_token is not null;

-- A page keeps its bytes in one place or the other, never both and never
-- neither by accident.
alter table public.nodes
  drop constraint if exists nodes_artifact_is_a_file;
alter table public.nodes
  add constraint nodes_artifact_is_a_file check (
    artifact_key is null or kind = 'file'
  ) not valid;
alter table public.nodes validate constraint nodes_artifact_is_a_file;

-- The bucket is private. Nothing reads it but this application, holding the
-- service key, and what it serves it serves under a policy of its own. A public
-- bucket would put somebody else's markup on a domain that has something to
-- lose, which is the one thing worth being careful about here.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'storage' and table_name = 'buckets'
  ) then
    insert into storage.buckets (id, name, public)
    values ('artifacts', 'artifacts', false)
    on conflict (id) do nothing;
  end if;
end $$;

/**
 * A fresh token for a page's public address.
 *
 * Sixteen random bytes. Long enough that guessing is not a strategy, short
 * enough to paste into a message.
 */
create or replace function public.mint_artifact_token()
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select encode(gen_random_bytes(16), 'hex');
$$;

/**
 * The artifact an address points at, for anybody at all.
 *
 * Deliberately open to `anon`, and the only function in this schema that is.
 * The token is the permission: whoever holds the link may read the file, which
 * is what a link you send a client has to mean. It answers the object's key and
 * the page's name and nothing else — not the space, not who wrote it, not what
 * else is in there.
 */
create or replace function public.artifact_for_token(p_token text)
returns table (artifact_key text, name text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select n.artifact_key, n.name
  from public.nodes n
  where n.artifact_token = p_token
    and n.artifact_key is not null
  limit 1;
$$;

revoke all on function public.mint_artifact_token() from public, anon;
grant execute on function public.mint_artifact_token() to authenticated, service_role;

revoke all on function public.artifact_for_token(text) from public;
grant execute on function public.artifact_for_token(text)
  to anon, authenticated, service_role;
