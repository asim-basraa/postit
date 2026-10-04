-- The functions a host database provides before loading Wave's schema.
--
-- Wave keeps no users and no permissions. Its tables and functions ask the
-- host these questions instead, so each is exactly as readable and writable as
-- the host's own screen or flow it belongs to. Every id below is the host's id
-- for a screen, a flow or a user, as uuid.
--
-- These are the signatures, with bodies that refuse everything. Replace each
-- body with the host's answer; see postit's migration for a worked example.

-- Who is asking, or null.
create or replace function public.wave_current_user()
returns uuid language sql stable as $$ select null::uuid $$;

-- Whether the current user may read / change a screen or a flow.
create or replace function public.wave_can_read(p_id uuid)
returns boolean language sql stable as $$ select false $$;

create or replace function public.wave_can_edit(p_id uuid)
returns boolean language sql stable as $$ select false $$;

-- How to show a user: an email, a name. Null when the user is gone.
create or replace function public.wave_user_label(p_user uuid)
returns text language sql stable as $$ select null::text $$;

-- Everything in a flow. kind is 'screen' for HTML, 'tokens' for a JSON file
-- that may hold design tokens; content is the JSON for tokens, null for
-- screens. approved_current is true when the member is approved at the
-- version it is at now, by whatever review the host has.
create or replace function public.wave_flow_members(p_flow_id uuid)
returns table (id uuid, name text, path text, kind text, content_version integer, approved_current boolean, content text)
language sql stable as $$ select null::uuid, null::text, null::text, null::text, null::integer, null::boolean, null::text where false $$;

-- A flow's Gherkin page (its end-to-end scenarios), and whether it is approved
-- at its current version. No row when the flow has none. Needed by
-- test-runs.sql.
create or replace function public.wave_flow_test_page(p_flow_id uuid)
returns table (id uuid, content_version integer, approved_current boolean)
language sql stable as $$ select null::uuid, null::integer, null::boolean where false $$;

-- Why the current user may not approve this flow, or null when they may. The
-- host's own rules: that it is a flow at all, who counts as a member, that the
-- person who made it is not the one approving it.
create or replace function public.wave_approval_refusal(p_flow_id uuid)
returns text language sql stable as $$ select 'Approval is not set up.'::text $$;

-- Top-level comments on the flow's screens still open or addressed.
create or replace function public.wave_open_comment_count(p_flow_id uuid)
returns integer language sql stable as $$ select 0 $$;
