-- A Gherkin file (.feature): a feature's end-to-end scenarios, kept as the file
-- itself rather than inside a Markdown page, so tools read it as they read any
-- .feature file.
--
-- A file like any other: the same tree, sharing, history and search; only how
-- the page is drawn differs. On its own, as with html and json: a new enum
-- value cannot be used in the transaction that adds it.

alter type public.content_type add value if not exists 'feature';
