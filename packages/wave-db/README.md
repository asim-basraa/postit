# @wave/db

Wave's tables and functions for Postgres, and a `WaveStore` for Supabase.

- `sql/host-contract.sql`: the seven functions a host database defines first
  (`wave_current_user`, `wave_can_read`, `wave_can_edit`, `wave_user_label`,
  `wave_flow_members`, `wave_approval_refusal`, `wave_open_comment_count`).
  Wave asks these instead of having a permission model of its own.
- `sql/schema.sql`: `wave_screen_versions`, `wave_waivers`,
  `wave_flow_approvals` with RLS through the host functions, and
  `wave_approve_flow`, `wave_flow_approval`, `wave_flow_waivers`. Safe to run
  again. A host copies it into a migration verbatim (Post-it's test checks the
  copy has not drifted).
- `supabaseWaveStore(db)`: the store over those tables, with the client of the
  person asking.

On another database (Lighter's SQLite), write a `WaveStore` over the same three
tables; see `docs/wave/lighter.md`.
