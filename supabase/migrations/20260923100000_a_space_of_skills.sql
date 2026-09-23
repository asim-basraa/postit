-- A space can say that what it holds is skills.
--
-- Post-it has stored skills since early on: a Markdown page with a name and a
-- description in its frontmatter, which is precisely the Agent Skills format
-- the wider ecosystem settled on. What it had no way to say was that a
-- particular space is *for* them, and no way to hand one to anything that is
-- not already talking to the MCP server.
--
-- This is the smaller half of fixing that, and it is deliberately one column.
-- A skillset is a space. Not a new kind of object with its own table, its own
-- membership and its own idea of who may read what — a space, with every rule
-- it already has. Sharing a skillset with a team is sharing a space with a
-- team, because it is the same act on the same row, decided by the same
-- policies. The word changes and nothing else does.
--
-- Which is the whole reason to do it this way. A second access model, however
-- carefully written, is a second place for the answer to "can this person read
-- this" to be wrong.

alter table public.spaces
  add column if not exists is_skillset boolean not null default false;

comment on column public.spaces.is_skillset is
  'Marks a space whose contents are skills, served in the Agent Skills layout. '
  'A label on a space, never a permission: who may read what is decided by the '
  'same policies as any other space.';

-- Small and read on every visit to the list, so it is worth the index being
-- partial: the answer wanted is nearly always "which of these few are
-- skillsets", not "which of these many are not".
create index if not exists spaces_skillsets_idx
  on public.spaces (id) where is_skillset;
