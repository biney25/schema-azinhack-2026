-- Advisor feedback after live apply. Applied migrations remain immutable.
create index schema_entry_assets_owner_entry on public.schema_entry_assets(owner_id,entry_id);
-- pg_net is non-relocatable on this project. Its functions live in net; keep the
-- working scheduler intact and make that API operator-only. The extension
-- namespace advisory is recorded for a future planned maintenance window.
revoke usage on schema net from public,anon,authenticated;
revoke execute on all functions in schema net from public,anon,authenticated;
