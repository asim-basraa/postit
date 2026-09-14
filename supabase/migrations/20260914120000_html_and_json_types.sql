-- Two more kinds of file: a static HTML document, and a JSON document.
--
-- They are files like any other. The same tree, the same sharing, the same
-- history, the same search; what differs is only how the page is drawn, which
-- is the application's business rather than the schema's. Nothing about
-- permissions changes here, so there is no new policy and nothing to re-test
-- in the authorization suite beyond the fact that the values exist.
--
-- On its own in this migration on purpose. Postgres will not let a new enum
-- value be *used* in the transaction that adds it, so anything that mentions
-- 'html' or 'json' has to wait for the next file.

alter type public.content_type add value if not exists 'html';
alter type public.content_type add value if not exists 'json';
